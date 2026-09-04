/**
 * Tác vụ định kỳ — SPEC Mục 17.2. Mỗi hàm chạy độc lập, idempotent trong ngày
 * (dùng dedupeKey). Gọi từ cron (src/lib/cron.ts) hoặc nút "chạy ngay" của ADMIN.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { campaigns, leadStageHistory, leads, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/email";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import { COLD_LOST_REASON } from "./escalate";
import { evaluateCampaignAlerts } from "./metrics";
import type { AnyDb } from "./metrics";
import { getManagerIds, notify, notifyMany } from "./notifications";
import { spawnLeadCareTasks } from "./lead-care-tasks";
import {
  completeAdsEntryTasksIfDone,
  spawnAdsEntryTasks,
} from "./ads-entry-tasks";
import { spawnRecurringTasks } from "./tasks";

export interface JobResult {
  job: string;
  createdNotifications: number;
  affected: number;
  emailsSent?: number;
  detail?: string;
}

async function emailsFor(db: AnyDb, userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.isActive, true)));
  return rows.map((r) => r.email);
}

/** 08:00 — tổng hợp lead quá hạn theo từng EC (SPEC 17.2). */
export async function runOverdueDigest(
  db: AnyDb,
  now = new Date(),
): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const rows = await db
    .select({
      assignedTo: leads.assignedTo,
      code: leads.code,
      fullName: leads.fullName,
      nextContactDate: leads.nextContactDate,
      silenceCount: leads.silenceCount,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        eq(leads.outcome, "OPEN"),
        lt(leads.nextContactDate, today),
      ),
    );

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.assignedTo) continue;
    if (!byUser.has(r.assignedTo)) byUser.set(r.assignedTo, []);
    byUser.get(r.assignedTo)!.push(r);
  }

  let created = 0;
  const managers = await getManagerIds(db);
  for (const [uid, list] of byUser) {
    const worst = list.reduce((a, b) =>
      (a.nextContactDate ?? "9") < (b.nextContactDate ?? "9") ? a : b,
    );
    const days = worst.nextContactDate
      ? Math.round(
          (Date.parse(`${today}T00:00:00Z`) -
            Date.parse(`${worst.nextContactDate}T00:00:00Z`)) /
            86_400_000,
        )
      : 0;
    const body = `Trễ nhất ${days} ngày (${worst.fullName} — đã im lặng ${worst.silenceCount} lần). Mở hàng đợi.`;
    if (
      await notify(db, {
        userId: uid,
        type: "OVERDUE_LEADS",
        severity: days > 3 ? "WARNING" : "INFO",
        title: `Bạn có ${list.length} khách trễ hẹn chăm sóc`,
        body,
        linkUrl: "/cong-viec",
        dedupeKey: `overdue:${today}`,
      })
    )
      created++;
  }
  created += await notifyMany(db, managers, {
    type: "OVERDUE_LEADS",
    severity: "INFO",
    title: `Toàn đội: ${rows.length} lead trễ hẹn chăm sóc`,
    linkUrl: "/lead",
    dedupeKey: `overdue-team:${today}`,
  });

  return { job: "overdue-digest", createdNotifications: created, affected: rows.length };
}

/** 08:00 & 10:30 — rà quy tắc R1–R5 (SPEC 17.2 / 9.4). */
export async function runAlertScan(db: AnyDb, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const alerts = await evaluateCampaignAlerts(db, now);
  const owners = await db
    .select({ id: campaigns.id, ownerId: campaigns.ownerId })
    .from(campaigns);
  const ownerMap = new Map(owners.map((o) => [o.id, o.ownerId]));
  const managers = await getManagerIds(db);

  let created = 0;
  const critTargets = new Set<string>();
  const critLines: string[] = [];
  for (const a of alerts) {
    const targets = new Set<string>(managers);
    const owner = ownerMap.get(a.campaignId);
    if (owner) targets.add(owner);
    const sev = a.severity;
    created += await notifyMany(db, [...targets], {
      type: a.rule === "R4" ? "DATA_GAP" : "CAMPAIGN_ALERT",
      severity: sev,
      title: `[${a.rule}] ${a.label} — ${a.displayName}`,
      body: a.detail,
      linkUrl: "/campaign",
      dedupeKey: `campaign:${a.campaignId}:${a.rule}:${today}`,
    });
    if (sev === "CRITICAL") {
      for (const t of targets) critTargets.add(t);
      critLines.push(`[${a.rule}] ${a.displayName} — ${a.detail}`);
    }
  }

  // Email cho mức CRITICAL (SPEC 17.1)
  let emailsSent = 0;
  if (critLines.length) {
    const to = await emailsFor(db, [...critTargets]);
    if (to.length) {
      const r = await sendMail({
        to,
        subject: `[VMG TMĐT OS] ${critLines.length} cảnh báo campaign CRITICAL`,
        text: `${critLines.join("\n")}\n\nMở: ${process.env.APP_URL ?? ""}/campaign`,
      });
      emailsSent = r.sent ? to.length : 0;
    }
  }

  return {
    job: "alert-scan",
    createdNotifications: created,
    affected: alerts.length,
    emailsSent,
    detail: alerts.map((a) => `${a.rule}:${a.displayName}`).join(", "),
  };
}

/** 00:30 — chuyển Cold Data cho lead silence_count >= 6 (SPEC 17.2). Ghi log, không thông báo. */
export async function runColdDataSweep(db: AnyDb): Promise<JobResult> {
  const stale = await db
    .select({ id: leads.id, stage: leads.stage, outcome: leads.outcome })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        eq(leads.isCold, false),
        eq(leads.outcome, "OPEN"),
        sql`${leads.silenceCount} >= 6`,
      ),
    );

  for (const l of stale) {
    await db
      .update(leads)
      .set({
        isCold: true,
        outcome: "LOST",
        lostReason: COLD_LOST_REASON,
        nextContactDate: null,
      })
      .where(eq(leads.id, l.id));
    await db.insert(leadStageHistory).values({
      leadId: l.id,
      fromStage: l.stage,
      toStage: l.stage,
      fromOutcome: l.outcome,
      toOutcome: "LOST",
      changedBy: null,
      reason: "Cron 00:30 — Cold Data (silence_count >= 6)",
    });
    await writeAudit(db, {
      actorId: null,
      entity: "leads",
      entityId: l.id,
      action: "UPDATE",
      changes: { outcome: { from: l.outcome, to: "LOST" }, is_cold: { from: false, to: true } },
    });
  }
  return { job: "cold-data-sweep", createdNotifications: 0, affected: stale.length };
}

/** Thứ Hai 08:00 — tổng kết tuần cho Trưởng phòng (SPEC 17.2). */
export async function runWeeklySummary(db: AnyDb, now = new Date()): Promise<JobResult> {
  const managers = await getManagerIds(db);
  const to = todayVnDayStr(now);
  const from = addDaysStr(to, -6);
  const { getBaseMetrics } = await import("./metrics");
  const b = await getBaseMetrics(db, { from, to });
  const n = await notifyMany(db, managers, {
    type: "KPI_RISK",
    severity: "INFO",
    title: `Tổng kết tuần (${from} → ${to})`,
    body: `Spend ${Math.round(b.spend).toLocaleString("vi-VN")}đ · Lead ${b.leads} · MQL ${b.mql} · HV ${b.won} · DT ${Math.round(b.revenueGross).toLocaleString("vi-VN")}đ`,
    linkUrl: "/",
    dedupeKey: `weekly:${to}`,
  });
  return { job: "weekly-summary", createdNotifications: n, affected: 0 };
}

/** Ngày 1 hằng tháng 08:00 — nhắc chốt số & khóa sổ tháng trước (SPEC 17.2). */
export async function runMonthLockReminder(
  db: AnyDb,
  now = new Date(),
): Promise<JobResult> {
  const adminRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), sql`${users.role} = 'ADMIN'`));
  const today = todayVnDayStr(now);
  const n = await notifyMany(
    db,
    adminRows.map((r) => r.id),
    {
      type: "KPI_RISK",
      severity: "INFO",
      title: "Đến hạn chốt số & khóa sổ tháng trước",
      body: "Rà soát số liệu, sau đó khóa sổ để cố định con số tính thưởng.",
      linkUrl: "/khoa-so",
      dedupeKey: `monthlock:${today.slice(0, 7)}`,
    },
  );
  return { job: "month-lock-reminder", createdNotifications: n, affected: 0 };
}

/** 08:00 — sinh task con từ việc định kỳ (SPEC 17.2 / 13.2). */
export async function runSpawnRecurring(db: AnyDb, now = new Date()): Promise<JobResult> {
  const r = await spawnRecurringTasks(db, now);
  return { job: "spawn-recurring", createdNotifications: 0, affected: r.created };
}

export async function runSpawnLeadCare(db: AnyDb, now = new Date()): Promise<JobResult> {
  const r = await spawnLeadCareTasks(db, now);
  return { job: "spawn-lead-care", createdNotifications: 0, affected: r.created };
}

/** 08:00 — mỗi Marketing Executive 1 task "nhập số liệu ads hôm nay" (SPEC 12.3). */
export async function runSpawnAdsEntry(db: AnyDb, now = new Date()): Promise<JobResult> {
  const s = await spawnAdsEntryTasks(db, now);
  const c = await completeAdsEntryTasksIfDone(db, now);
  return {
    job: "spawn-ads-entry",
    createdNotifications: 0,
    affected: s.created,
    detail: c.completed ? `${c.completed} task tự đóng (đã nhập đủ)` : undefined,
  };
}

/** Chạy toàn bộ tác vụ buổi sáng (dùng cho nút "chạy ngay" của ADMIN). */
export async function runAllMorningJobs(db: AnyDb, now = new Date()) {
  return {
    overdue: await runOverdueDigest(db, now),
    alerts: await runAlertScan(db, now),
    cold: await runColdDataSweep(db),
    recurring: await runSpawnRecurring(db, now),
    leadCare: await runSpawnLeadCare(db, now),
    adsEntry: await runSpawnAdsEntry(db, now),
  };
}
