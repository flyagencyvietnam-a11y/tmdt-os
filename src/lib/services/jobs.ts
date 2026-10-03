/**
 * Tác vụ định kỳ — SPEC Mục 11.2 (ma trận sự kiện) + Mục 6.3 (sinh task lặp).
 * Mỗi hàm idempotent trong ngày (dedupeKey). Gọi từ cron hoặc nút "chạy ngay" của admin.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { tasks, users } from "@/lib/db/schema";
import { diffDaysStr, todayVnDayStr } from "@/lib/time";
import { generateAllRecurringTasks } from "./recurring";
import { emailsFor, getManagerIds, notify, notifyMany } from "./notifications";
import { sendMail } from "@/lib/email";
import { overdueSqlFragment } from "./tasks";

export interface JobResult {
  job: string;
  createdNotifications: number;
  affected: number;
  emailsSent?: number;
}

/** 00:30 — sinh task định kỳ còn thiếu (Mục 6.3). */
export async function runSpawnRecurring(db: DB, now = new Date()): Promise<JobResult> {
  const r = await generateAllRecurringTasks(db, now);
  return { job: "spawn-recurring", createdNotifications: 0, affected: r.created };
}

/** 08:00 — task sắp đến hạn hôm nay (nhắc trong app) (Mục 11.2). */
export async function runDueTodayReminder(db: DB, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(
      and(isNull(tasks.deletedAt), eq(tasks.dueDate, today), inArray(tasks.status, ["todo", "in_progress", "in_review", "blocked"])),
    );
  let created = 0;
  for (const t of rows) {
    if (!t.assigneeId) continue;
    if (
      await notify(db, {
        userId: t.assigneeId,
        kind: "due_today",
        taskId: t.id,
        title: `Hôm nay đến hạn: ${t.title}`,
        dedupeKey: `task:${t.id}:due_today:${today}`,
      })
    )
      created++;
  }
  return { job: "due-today-reminder", createdNotifications: created, affected: rows.length };
}

/** 16:30 — task đến hạn hôm nay nhưng chưa xong (Mục 11.2). */
export async function runDueTodayUnfinished(db: DB, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(
      and(isNull(tasks.deletedAt), eq(tasks.dueDate, today), inArray(tasks.status, ["todo", "in_progress", "in_review", "blocked"])),
    );
  const byUser = new Map<string, { id: string; title: string }[]>();
  for (const t of rows) {
    if (!t.assigneeId) continue;
    if (!byUser.has(t.assigneeId)) byUser.set(t.assigneeId, []);
    byUser.get(t.assigneeId)!.push(t);
  }
  let created = 0;
  let emailsSent = 0;
  for (const [uid, list] of byUser) {
    const ok = await notify(db, {
      userId: uid,
      kind: "due_today",
      title: `${list.length} task đến hạn hôm nay chưa xong`,
      body: list.map((t) => `- ${t.title}`).join("\n"),
      dedupeKey: `due-unfinished:${uid}:${today}`,
    });
    if (ok) created++;
    const [to] = await emailsFor(db, [uid]);
    if (to) {
      await sendMail({
        to,
        subject: `[MKT OS] ${list.length} task đến hạn hôm nay chưa xong`,
        text: list.map((t) => `- ${t.title}`).join("\n"),
      });
      emailsSent++;
    }
  }
  return { job: "due-today-unfinished", createdNotifications: created, affected: rows.length, emailsSent };
}

/** Sáng hôm sau 08:00 — task trễ hạn (Mục 11.2) + tổng hợp hằng ngày. */
export async function runOverdueMorning(db: DB, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), overdueSqlFragment(today)));

  const byUser = new Map<string, typeof rows>();
  for (const t of rows) {
    if (!t.assigneeId) continue;
    if (!byUser.has(t.assigneeId)) byUser.set(t.assigneeId, []);
    byUser.get(t.assigneeId)!.push(t);
  }
  let created = 0;
  let emailsSent = 0;
  for (const [uid, list] of byUser) {
    if (
      await notify(db, {
        userId: uid,
        kind: "overdue",
        title: `Bạn có ${list.length} task trễ hạn`,
        body: list.map((t) => `- ${t.title} (hạn ${t.dueDate})`).join("\n"),
        dedupeKey: `overdue:${uid}:${today}`,
      })
    )
      created++;
    const [to] = await emailsFor(db, [uid]);
    if (to) {
      await sendMail({
        to,
        subject: `[MKT OS] ${list.length} task trễ hạn`,
        text: list.map((t) => `- ${t.title} (hạn ${t.dueDate})`).join("\n"),
      });
      emailsSent++;
    }
  }
  return { job: "overdue-morning", createdNotifications: created, affected: rows.length, emailsSent };
}

/** Trễ >= 2 ngày làm việc — nhắc quản lý, lặp lại mỗi tuần (Mục 11.2, xấp xỉ bằng lịch ngày). */
export async function runEscalateToManagers(db: DB, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, assigneeId: tasks.assigneeId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), overdueSqlFragment(today)));
  const stale = rows.filter((t) => t.dueDate && diffDaysStr(t.dueDate, today) >= 2);
  if (!stale.length) return { job: "escalate-managers", createdNotifications: 0, affected: 0 };

  const managers = await getManagerIds(db);
  const week = today.slice(0, 4) + "-W" + Math.ceil(Number(today.slice(8, 10)) / 7);
  const created = await notifyMany(db, managers, {
    kind: "escalation",
    title: `${stale.length} task trễ hạn >= 2 ngày làm việc`,
    body: stale.map((t) => `- ${t.title} (hạn ${t.dueDate})`).join("\n"),
    dedupeKey: `escalation:${week}`,
  });
  return { job: "escalate-managers", createdNotifications: created, affected: stale.length };
}

/** 08:00 mỗi ngày làm việc — tóm tắt hằng ngày qua email (Mục 11.2). */
export async function runDailyDigest(db: DB, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const tomorrow = todayVnDayStr(new Date(now.getTime() + 86400000));
  const activeUsers = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.active, true));
  let emailsSent = 0;
  for (const u of activeUsers) {
    const rows = await db
      .select({ title: tasks.title, dueDate: tasks.dueDate, status: tasks.status })
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), eq(tasks.assigneeId, u.id), inArray(tasks.status, ["todo", "in_progress", "in_review", "blocked"])));
    const overdue = rows.filter((t) => t.dueDate && t.dueDate < today);
    const dueToday = rows.filter((t) => t.dueDate === today);
    const dueTomorrow = rows.filter((t) => t.dueDate === tomorrow);
    if (!overdue.length && !dueToday.length && !dueTomorrow.length) continue;
    const text = [
      overdue.length ? `Trễ hạn (${overdue.length}):\n${overdue.map((t) => `- ${t.title}`).join("\n")}` : "",
      dueToday.length ? `Hôm nay (${dueToday.length}):\n${dueToday.map((t) => `- ${t.title}`).join("\n")}` : "",
      dueTomorrow.length ? `Ngày mai (${dueTomorrow.length}):\n${dueTomorrow.map((t) => `- ${t.title}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const r = await sendMail({ to: u.email, subject: `[MKT OS] Tóm tắt công việc ${today}`, text });
    if (r.sent) emailsSent++;
  }
  return { job: "daily-digest", createdNotifications: 0, affected: activeUsers.length, emailsSent };
}

/** Sáng thứ Hai — tóm tắt hằng tuần cho quản lý (Mục 11.2). */
export async function runWeeklySummary(db: DB, now = new Date()): Promise<JobResult> {
  const today = todayVnDayStr(now);
  const managers = await getManagerIds(db);
  const [openTask] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), inArray(tasks.status, ["todo", "in_progress", "in_review", "blocked"])))
    .limit(1);
  const created = await notifyMany(db, managers, {
    kind: "digest_weekly",
    title: `Tổng kết tuần (${today})`,
    body: openTask ? "Xem Dashboard quản lý để biết chi tiết tải công việc." : "Không có task mở.",
    dedupeKey: `weekly:${today}`,
  });
  return { job: "weekly-summary", createdNotifications: created, affected: managers.length };
}

export async function runAllNightlyJobs(db: DB, now = new Date()) {
  return {
    recurring: await runSpawnRecurring(db, now),
    overdueMorning: await runOverdueMorning(db, now),
    dueTodayReminder: await runDueTodayReminder(db, now),
    escalate: await runEscalateToManagers(db, now),
    dailyDigest: await runDailyDigest(db, now),
  };
}
