import { and, eq, isNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { leads, tasks, users } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "CANCELLED";
type TaskType = "PROJECT" | "RECURRING" | "SYSTEM";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  groupCode?: string | null;
  productId?: string | null;
  type?: TaskType;
  assigneeId: string;
  coAssignees?: string[];
  goalKpi?: string | null;
  dueDate?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  recurrenceRule?: string | null;
  linkUrl?: string | null;
}

export async function createTask(
  db: AnyDb,
  input: CreateTaskInput,
  actor: Actor,
): Promise<{ id: string }> {
  if (input.type === "RECURRING" && !input.recurrenceRule)
    throw new ServiceError("Việc định kỳ phải có luật lặp.", "NEED_RRULE");
  const [row] = await db
    .insert(tasks)
    .values({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      groupCode: input.groupCode?.trim() || null,
      productId: input.productId ?? null,
      type: input.type ?? "PROJECT",
      assigneeId: input.assigneeId,
      coAssignees: input.coAssignees?.length ? input.coAssignees : null,
      goalKpi: input.goalKpi?.trim() || null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? "NORMAL",
      recurrenceRule: input.recurrenceRule ?? null,
      linkUrl: input.linkUrl?.trim() || null,
      createdBy: actor.id,
      updatedBy: actor.id,
    })
    .returning({ id: tasks.id });
  await writeAudit(db, {
    actorId: actor.id,
    entity: "tasks",
    entityId: row.id,
    action: "CREATE",
    changes: { title: { from: null, to: input.title } },
  });
  return row;
}

export interface UpdateTaskPatch {
  status?: TaskStatus;
  progressPct?: number;
  blockedReason?: string | null;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assigneeId?: string;
  goalKpi?: string | null;
  linkUrl?: string | null;
}

export async function updateTask(
  db: AnyDb,
  id: string,
  patch: UpdateTaskPatch,
  actor: Actor,
): Promise<void> {
  const [before] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!before) throw new ServiceError("Không tìm thấy đầu việc.", "NOT_FOUND");

  const set: Partial<typeof tasks.$inferInsert> = { updatedBy: actor.id };
  if (patch.status && patch.status !== before.status) {
    if (patch.status === "BLOCKED" && !patch.blockedReason?.trim())
      throw new ServiceError("Trạng thái BLOCKED phải kèm lý do.", "NEED_REASON");
    set.status = patch.status;
    if (patch.status === "DONE") {
      set.completedAt = new Date();
      set.progressPct = 100;
    }
    if (patch.status !== "BLOCKED") set.blockedReason = null;
  }
  if (patch.blockedReason !== undefined)
    set.blockedReason = patch.blockedReason?.trim() || null;
  if (patch.progressPct !== undefined)
    set.progressPct = Math.max(0, Math.min(100, Math.round(patch.progressPct)));
  if (patch.title) set.title = patch.title.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.priority) set.priority = patch.priority;
  if (patch.assigneeId) set.assigneeId = patch.assigneeId;
  if (patch.goalKpi !== undefined) set.goalKpi = patch.goalKpi?.trim() || null;
  if (patch.linkUrl !== undefined) set.linkUrl = patch.linkUrl?.trim() || null;

  await db.update(tasks).set(set).where(eq(tasks.id, id));
  if (set.status !== undefined) {
    await writeAudit(db, {
      actorId: actor.id,
      entity: "tasks",
      entityId: id,
      action: "UPDATE",
      changes: { status: { from: before.status, to: set.status } },
    });
  }
}

export async function softDeleteTask(db: AnyDb, id: string, actor: Actor) {
  await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedBy: actor.id })
    .where(eq(tasks.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "tasks",
    entityId: id,
    action: "DELETE",
  });
}

/**
 * Lưu trữ / bỏ lưu trữ đầu việc (ẩn khỏi bảng Công việc). Chỉ lưu trữ được việc đã
 * DONE — SPEC 13.1. Không phải xóa: bản ghi vẫn còn, vẫn tính vào thống kê.
 */
export async function setTaskArchived(
  db: AnyDb,
  id: string,
  archived: boolean,
  actor: Actor,
): Promise<void> {
  const [before] = await db
    .select({ status: tasks.status, archivedAt: tasks.archivedAt })
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!before) throw new ServiceError("Không tìm thấy đầu việc.", "NOT_FOUND");
  if (archived && before.status !== "DONE")
    throw new ServiceError("Chỉ lưu trữ được việc đã Xong.", "NOT_DONE");
  if (!!before.archivedAt === archived) return;

  await db
    .update(tasks)
    .set({ archivedAt: archived ? new Date() : null, updatedBy: actor.id })
    .where(eq(tasks.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "tasks",
    entityId: id,
    action: "UPDATE",
    changes: { archived_at: { from: before.archivedAt, to: archived ? "now" : null } },
  });
}

export async function listTasks(
  db: AnyDb,
  opts: {
    assigneeId?: string;
    includeSystem?: boolean;
    /** Kèm cả việc đã lưu trữ (mặc định: ẩn). */
    includeArchived?: boolean;
  } = {},
) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      groupCode: tasks.groupCode,
      type: tasks.type,
      status: tasks.status,
      priority: tasks.priority,
      progressPct: tasks.progressPct,
      dueDate: tasks.dueDate,
      goalKpi: tasks.goalKpi,
      linkUrl: tasks.linkUrl,
      blockedReason: tasks.blockedReason,
      recurrenceRule: tasks.recurrenceRule,
      assigneeId: tasks.assigneeId,
      assigneeName: users.fullName,
      completedAt: tasks.completedAt,
      archivedAt: tasks.archivedAt,
      leadId: tasks.leadId,
      leadCode: leads.code,
      leadStage: leads.stage,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .leftJoin(leads, eq(leads.id, tasks.leadId))
    .where(
      and(
        isNull(tasks.deletedAt),
        opts.includeArchived ? undefined : isNull(tasks.archivedAt),
        opts.assigneeId ? eq(tasks.assigneeId, opts.assigneeId) : undefined,
      ),
    )
    .orderBy(tasks.dueDate);
}

// ---------------------------------------------------------------------------
//  Việc định kỳ — sinh task con mỗi sáng (SPEC Mục 13.2 / 17.2)
// ---------------------------------------------------------------------------

/**
 * Luật lặp rút gọn (không phải RRULE đầy đủ):
 *   DAILY            — mỗi ngày
 *   DAILY_WEEKDAY    — T2..T7 (bỏ Chủ nhật)
 *   WEEKLY:MON..SUN  — mỗi tuần vào thứ chỉ định
 *   MONTHLY:1..28    — ngày cố định trong tháng
 */
function recurrenceMatches(rule: string, dayStr: string): boolean {
  const dow = new Date(`${dayStr}T00:00:00Z`).getUTCDay(); // 0=CN
  const dom = Number(dayStr.slice(8, 10));
  const map: Record<string, number> = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
  };
  if (rule === "DAILY") return true;
  if (rule === "DAILY_WEEKDAY") return dow !== 0;
  if (rule.startsWith("WEEKLY:")) return map[rule.slice(7).toUpperCase()] === dow;
  if (rule.startsWith("MONTHLY:")) return Number(rule.slice(8)) === dom;
  return false;
}

export async function spawnRecurringTasks(
  db: AnyDb,
  now = new Date(),
): Promise<{ created: number }> {
  const today = todayVnDayStr(now);
  const recurring = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.type, "RECURRING"),
        isNull(tasks.deletedAt),
        sql`${tasks.recurrenceRule} is not null`,
      ),
    );

  let created = 0;
  for (const t of recurring) {
    if (!t.recurrenceRule || !recurrenceMatches(t.recurrenceRule, today)) continue;
    const [exists] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, t.id), eq(tasks.dueDate, today)))
      .limit(1);
    if (exists) continue;
    await db.insert(tasks).values({
      title: t.title,
      description: t.description,
      groupCode: t.groupCode,
      productId: t.productId,
      type: "PROJECT",
      assigneeId: t.assigneeId,
      coAssignees: t.coAssignees,
      goalKpi: t.goalKpi,
      dueDate: today,
      priority: t.priority,
      parentTaskId: t.id,
      linkUrl: t.linkUrl,
      createdBy: t.createdBy,
      updatedBy: t.createdBy,
    });
    created++;
  }
  return { created };
}

/** % hoàn thành đầu việc trong kỳ — SPEC 13.3 (dùng cho thẻ tổng). */
export async function taskCompletionStats(
  db: AnyDb,
  opts: { assigneeId?: string } = {},
) {
  const rows = await db
    .select({ status: tasks.status, c: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        sql`${tasks.status} <> 'CANCELLED'`,
        opts.assigneeId ? eq(tasks.assigneeId, opts.assigneeId) : undefined,
      ),
    )
    .groupBy(tasks.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.c)]));
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return {
    total,
    done: by.DONE ?? 0,
    blocked: by.BLOCKED ?? 0,
    inProgress: by.IN_PROGRESS ?? 0,
    todo: by.TODO ?? 0,
    completionPct: total ? (by.DONE ?? 0) / total : null,
  };
}
