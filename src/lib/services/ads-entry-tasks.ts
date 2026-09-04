import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { tasks, users } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import type { AnyDb } from "./metrics";

/** Nhóm nhận diện task "nhập số liệu ads" tự tạo hàng ngày. */
const ADS_GROUP = "ADS";
const OPEN_STATUSES = ["TODO", "IN_PROGRESS"] as const;

/**
 * Mỗi Marketing Executive: 1 task/ngày "Nhập số liệu ads hôm nay" (SPEC 12.3 / 13).
 * Idempotent trong ngày — bỏ qua nếu người đó đã có task ADS `due_date = hôm nay`
 * (kể cả đã DONE). Task tự chuyển Xong khi nhập đủ (completeAdsEntryTasksIfDone).
 */
export async function spawnAdsEntryTasks(
  db: AnyDb,
  now = new Date(),
): Promise<{ created: number }> {
  const today = todayVnDayStr(now);

  const mkts = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "MARKETING")));
  if (mkts.length === 0) return { created: 0 };

  const existing = await db
    .select({ assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(
      and(
        eq(tasks.groupCode, ADS_GROUP),
        eq(tasks.dueDate, today),
        isNull(tasks.deletedAt),
        inArray(
          tasks.assigneeId,
          mkts.map((m) => m.id),
        ),
      ),
    );
  const have = new Set(existing.map((e) => e.assigneeId));

  const rows = mkts
    .filter((m) => !have.has(m.id))
    .map((m) => ({
      title: "Nhập số liệu ads hôm nay",
      type: "SYSTEM" as const,
      groupCode: ADS_GROUP,
      assigneeId: m.id,
      dueDate: today,
      priority: "HIGH" as const,
      goalKpi: "Nhập đủ spend & tin nhắn cho mọi campaign đang ON trong ngày (V10)",
      linkUrl: "/ads",
      createdBy: m.id,
      updatedBy: m.id,
    }));
  if (rows.length === 0) return { created: 0 };

  await db.insert(tasks).values(rows);
  return { created: rows.length };
}

/**
 * Đã nhập đủ số liệu ads cho hôm nay chưa? = số campaign ON đang chạy hôm nay đều có
 * bản ghi trong campaign_daily_metrics với metric_date = hôm nay (khớp
 * `getDataEntryCompliance` ở metrics.ts, tính cho 1 ngày).
 */
async function adsEntryCompleteToday(db: AnyDb, today: string): Promise<boolean> {
  const rows = await db.execute<{ on_campaigns: number; entered: number }>(sql`
    select
      (select count(*) from campaigns c
        where c.deleted_at is null
          and c.started_on <= ${today}::date
          and (c.ended_on is null or c.ended_on >= ${today}::date)
          and c.status = 'ON') as on_campaigns,
      (select count(distinct m.campaign_id) from campaign_daily_metrics m
        where m.metric_date = ${today}::date) as entered
  `);
  const r = Array.isArray(rows)
    ? rows[0]
    : (rows as { rows: { on_campaigns: number; entered: number }[] }).rows?.[0];
  const on = Number(r?.on_campaigns ?? 0);
  const entered = Number(r?.entered ?? 0);
  return on > 0 && entered >= on;
}

/**
 * Nếu hôm nay đã nhập đủ số liệu ads → đóng mọi task ADS `due_date = hôm nay` còn mở.
 * Gọi sau mỗi lần lưu số liệu campaign và trong job sáng.
 */
export async function completeAdsEntryTasksIfDone(
  db: AnyDb,
  now = new Date(),
): Promise<{ completed: number }> {
  const today = todayVnDayStr(now);
  if (!(await adsEntryCompleteToday(db, today))) return { completed: 0 };

  const open = await db
    .select({ id: tasks.id, assigneeId: tasks.assigneeId })
    .from(tasks)
    .where(
      and(
        eq(tasks.groupCode, ADS_GROUP),
        eq(tasks.dueDate, today),
        isNull(tasks.deletedAt),
        inArray(tasks.status, [...OPEN_STATUSES]),
      ),
    );
  if (open.length === 0) return { completed: 0 };

  await db
    .update(tasks)
    .set({ status: "DONE", progressPct: 100, completedAt: now })
    .where(
      inArray(
        tasks.id,
        open.map((t) => t.id),
      ),
    );
  for (const t of open) {
    await writeAudit(db, {
      actorId: null,
      entity: "tasks",
      entityId: t.id,
      action: "UPDATE",
      changes: {
        status: { from: "open", to: "DONE" },
        reason: { from: null, to: "Đã nhập đủ số liệu ads trong ngày" },
      },
    });
  }
  return { completed: open.length };
}
