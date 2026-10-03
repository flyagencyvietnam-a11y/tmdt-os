import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  activityLog,
  checklistItems,
  comments,
  sbuCatalogItems,
  sbuItemStatus,
  taskCollaborators,
  taskDependencies,
  taskLabels,
  taskSbus,
  taskWatchers,
  tasks,
  users,
  type NewTask,
  type Task,
} from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { nextTaskCode } from "./codes";
import { createConfirmationToken } from "./confirmation-tokens";
import { ServiceError } from "./errors";
import { notify } from "./notifications";
import { sendMail } from "@/lib/email";
import { todayVnDayStr } from "@/lib/time";

/** SPEC Mục 3.3 / 11.4 — assignee `center_contributor` nhận thêm email kèm magic link. */
async function maybeSendCenterContributorLink(db: DB, assigneeId: string, task: Task) {
  const [u] = await db.select({ role: users.role, email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, assigneeId)).limit(1);
  if (!u || u.role !== "center_contributor") return;
  const token = await createConfirmationToken(db, task.id, { email: u.email, name: u.fullName });
  const link = `${process.env.APP_URL ?? ""}/xac-nhan/${token}`;
  await sendMail({
    to: u.email,
    subject: `[MKT OS] Việc mới: ${task.title}`,
    text: `Bạn được giao: ${task.title}\nHạn: ${task.dueDate ?? "chưa có"}\n\nXác nhận đã xong / báo vướng (không cần đăng nhập): ${link}\n(Liên kết hết hạn sau 7 ngày, chỉ dùng được 1 lần.)`,
  });
}

/** SPEC Mục 5.1 — chuyển trạng thái tự do, nhưng mọi thay đổi ghi activity_log. */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
] as const;

/** SPEC Mục 4.2 — overdue luôn suy ra, không lưu cột. */
export function isOverdue(
  t: Pick<Task, "status" | "dueDate" | "dueTime">,
  nowVnDay: string = todayVnDayStr(),
  nowVnTime?: string,
): boolean {
  if (t.status === "done" || t.status === "cancelled") return false;
  if (!t.dueDate) return false;
  if (t.dueDate < nowVnDay) return true;
  if (t.dueDate === nowVnDay && t.dueTime && nowVnTime) return t.dueTime < nowVnTime;
  return false;
}

/** SQL fragment dùng trong `where()` của các truy vấn danh sách — cùng định nghĩa overdue. */
export function overdueSqlFragment(today: string) {
  return sql`${tasks.status} not in ('done','cancelled') and ${tasks.dueDate} is not null and ${tasks.dueDate} < ${today}`;
}

async function logActivity(
  db: DB,
  taskId: string,
  actorId: string | null,
  field: string,
  fromValue: unknown,
  toValue: unknown,
) {
  if (JSON.stringify(fromValue ?? null) === JSON.stringify(toValue ?? null)) return;
  await db.insert(activityLog).values({ taskId, actorId, field, fromValue: fromValue ?? null, toValue: toValue ?? null });
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  type?: Task["type"];
  priority?: Task["priority"];
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  timeSlot?: Task["timeSlot"];
  estimateHours?: string | null;
  parentId?: string | null;
  campaignId?: string | null;
  brandId?: string | null;
  workstream?: string | null;
  channel?: string | null;
  referenceUrl?: string | null;
  isMilestone?: boolean;
  sourceType?: Task["sourceType"];
  sourceId?: string | null;
  recurringRuleId?: string | null;
  occurrenceDate?: string | null;
  scopeKey?: string | null;
  externalKey?: string | null;
  importScope?: string | null;
  importBatchId?: string | null;
  collaboratorIds?: string[];
  sbuIds?: string[];
  labels?: string[];
  checklist?: string[];
}

export async function createTask(
  db: DB,
  input: CreateTaskInput,
  actorId: string | null,
): Promise<Task> {
  if (!input.title?.trim()) throw new ServiceError("Tiêu đề bắt buộc.", "TITLE_REQUIRED");
  const code = await nextTaskCode(db);
  const values: NewTask = {
    code,
    title: input.title.trim(),
    description: input.description ?? null,
    type: input.type ?? "general",
    priority: input.priority ?? "medium",
    assigneeId: input.assigneeId ?? null,
    creatorId: actorId,
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    timeSlot: input.timeSlot ?? null,
    estimateHours: input.estimateHours ?? null,
    parentId: input.parentId ?? null,
    campaignId: input.campaignId ?? null,
    brandId: input.brandId ?? null,
    workstream: input.workstream ?? null,
    channel: input.channel ?? null,
    referenceUrl: input.referenceUrl ?? null,
    isMilestone: input.isMilestone ?? false,
    sourceType: input.sourceType ?? "manual",
    sourceId: input.sourceId ?? null,
    recurringRuleId: input.recurringRuleId ?? null,
    occurrenceDate: input.occurrenceDate ?? null,
    scopeKey: input.scopeKey ?? null,
    externalKey: input.externalKey ?? null,
    importScope: input.importScope ?? null,
    importBatchId: input.importBatchId ?? null,
    createdBy: actorId,
  };
  const [task] = await db.insert(tasks).values(values).returning();

  if (input.collaboratorIds?.length) {
    await db
      .insert(taskCollaborators)
      .values(input.collaboratorIds.map((userId) => ({ taskId: task.id, userId })))
      .onConflictDoNothing();
  }
  if (input.sbuIds?.length) {
    await db
      .insert(taskSbus)
      .values(input.sbuIds.map((sbuId) => ({ taskId: task.id, sbuId })))
      .onConflictDoNothing();
  }
  if (input.labels?.length) {
    await db
      .insert(taskLabels)
      .values(input.labels.map((label) => ({ taskId: task.id, label })))
      .onConflictDoNothing();
  }
  if (input.checklist?.length) {
    await db
      .insert(checklistItems)
      .values(input.checklist.map((text, i) => ({ taskId: task.id, text, sortOrder: String(i) })));
  }

  await writeAudit(db, { actorId, entity: "tasks", entityId: task.id, action: "CREATE" });

  if (task.assigneeId && task.assigneeId !== actorId) {
    await notify(db, {
      userId: task.assigneeId,
      kind: "assigned",
      taskId: task.id,
      title: `Bạn được giao task: ${task.title}`,
      dedupeKey: `task:${task.id}:assigned:${task.assigneeId}`,
    });
    await maybeSendCenterContributorLink(db, task.assigneeId, task);
  }
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  type?: Task["type"];
  status?: Task["status"];
  blockedReason?: string | null;
  priority?: Task["priority"];
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  timeSlot?: Task["timeSlot"];
  estimateHours?: string | null;
  campaignId?: string | null;
  brandId?: string | null;
  workstream?: string | null;
  channel?: string | null;
  deliverableUrl?: string | null;
  referenceUrl?: string | null;
  sortOrder?: string;
}

const MANUAL_EDIT_FIELDS = new Set([
  "title",
  "description",
  "dueDate",
  "dueTime",
  "assigneeId",
  "priority",
  "status",
  "campaignId",
  "workstream",
]);

export async function updateTask(
  db: DB,
  id: string,
  patch: UpdateTaskInput,
  actorId: string | null,
  opts: { trackManualEdit?: boolean; ignoreDependencies?: boolean } = {},
): Promise<Task> {
  const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!before) throw new ServiceError("Không tìm thấy task.", "NOT_FOUND");

  if (patch.status === "blocked" && !patch.blockedReason && !before.blockedReason) {
    throw new ServiceError("Phải nhập lý do khi chuyển sang Đang bị chặn.", "BLOCKED_REASON_REQUIRED");
  }

  if (
    (patch.status === "in_progress" || patch.status === "done") &&
    !opts.ignoreDependencies
  ) {
    const preds = await db
      .select({ predecessorId: taskDependencies.predecessorId })
      .from(taskDependencies)
      .where(eq(taskDependencies.successorId, id));
    if (preds.length) {
      const predStatuses = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(
          inArray(
            tasks.id,
            preds.map((p) => p.predecessorId),
          ),
        );
      const stillOpen = predStatuses.some((p) => p.status !== "done" && p.status !== "cancelled");
      if (stillOpen) {
        throw new ServiceError(
          "Task tiền nhiệm chưa xong. Dùng cờ bỏ qua phụ thuộc nếu muốn tiếp tục.",
          "DEPENDENCY_BLOCKED",
        );
      }
    }
  }

  const set: Partial<NewTask> = { ...patch, updatedBy: actorId };
  if (patch.status === "done" && before.status !== "done") set.completedAt = new Date();
  if (patch.status && patch.status !== "done" && before.status === "done") set.completedAt = null;
  if (patch.status && patch.status !== "blocked") set.blockedReason = null;

  const manualFields = opts.trackManualEdit === false ? [] : Object.keys(patch).filter((k) => MANUAL_EDIT_FIELDS.has(k));
  if (manualFields.length) {
    const merged = Array.from(new Set([...(before.manuallyEditedFields ?? []), ...manualFields]));
    set.manuallyEditedFields = merged;
  }

  const [after] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();

  for (const [field, toValue] of Object.entries(patch)) {
    await logActivity(db, id, actorId, field, (before as Record<string, unknown>)[field], toValue);
  }
  await writeAudit(db, {
    actorId,
    entity: "tasks",
    entityId: id,
    action: "UPDATE",
    changes: Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, { from: (before as Record<string, unknown>)[k], to: v }]),
    ),
  });

  if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId) {
    if (patch.assigneeId) {
      await notify(db, {
        userId: patch.assigneeId,
        kind: "assigned",
        taskId: id,
        title: `Bạn được giao task: ${after.title}`,
        dedupeKey: `task:${id}:assigned:${patch.assigneeId}`,
      });
      await maybeSendCenterContributorLink(db, patch.assigneeId, after);
    }
    if (before.assigneeId) {
      await notify(db, {
        userId: before.assigneeId,
        kind: "assignee_change",
        taskId: id,
        title: `Task đã chuyển người phụ trách: ${after.title}`,
        dedupeKey: `task:${id}:unassigned:${before.assigneeId}:${Date.now()}`,
      });
    }
  }

  if (patch.status === "blocked" && before.status !== "blocked") {
    const watchers = await db.select({ userId: taskWatchers.userId }).from(taskWatchers).where(eq(taskWatchers.taskId, id));
    for (const w of watchers) {
      await notify(db, {
        userId: w.userId,
        kind: "blocked",
        taskId: id,
        title: `Task bị chặn: ${after.title}`,
        body: after.blockedReason,
        dedupeKey: `task:${id}:blocked:${w.userId}`,
      });
    }
  }

  if (patch.status === "done" && before.status !== "done") {
    await clearSuccessorDependencies(db, id, after.title);
    if (before.parentId) await recomputeParentStatus(db, before.parentId, actorId);
  }
  if (patch.status && patch.status !== "done" && before.status === "done" && before.parentId) {
    await recomputeParentStatus(db, before.parentId, actorId);
  }

  return after;
}

async function clearSuccessorDependencies(db: DB, predecessorId: string, predecessorTitle: string) {
  const rows = await db
    .select({ successorId: taskDependencies.successorId })
    .from(taskDependencies)
    .where(eq(taskDependencies.predecessorId, predecessorId));
  for (const r of rows) {
    const [succ] = await db.select().from(tasks).where(eq(tasks.id, r.successorId)).limit(1);
    if (succ?.assigneeId) {
      await notify(db, {
        userId: succ.assigneeId,
        kind: "dependency_cleared",
        taskId: succ.id,
        title: `Task tiền nhiệm "${predecessorTitle}" đã xong — có thể bắt đầu "${succ.title}"`,
        dedupeKey: `task:${succ.id}:dep-cleared:${predecessorId}`,
      });
    }
  }
}

/** SPEC Mục 5.2 — task cha tự done khi mọi con done/cancelled. */
export async function recomputeParentStatus(db: DB, parentId: string, actorId: string | null) {
  const children = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.parentId, parentId), isNull(tasks.deletedAt)));
  if (!children.length) return;
  const allDone = children.every((c) => c.status === "done" || c.status === "cancelled");
  const [parent] = await db.select().from(tasks).where(eq(tasks.id, parentId)).limit(1);
  if (!parent) return;
  if (allDone && parent.status !== "done") {
    await updateTask(db, parentId, { status: "done" }, actorId, { trackManualEdit: false });
  } else if (!allDone && parent.status === "done") {
    await updateTask(db, parentId, { status: "in_progress" }, actorId, { trackManualEdit: false });
  }
}

export async function bulkUpdateTasks(
  db: DB,
  ids: string[],
  patch: UpdateTaskInput,
  actorId: string | null,
) {
  const results: Task[] = [];
  for (const id of ids) results.push(await updateTask(db, id, patch, actorId));
  return results;
}

export async function duplicateTask(db: DB, id: string, actorId: string | null, dayOffset = 0) {
  const [src] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!src) throw new ServiceError("Không tìm thấy task.", "NOT_FOUND");
  const shift = (d: string | null) => (d ? sqlAddDays(d, dayOffset) : d);
  return createTask(
    db,
    {
      title: `${src.title} (bản sao)`,
      description: src.description,
      type: src.type,
      priority: src.priority,
      assigneeId: src.assigneeId,
      startDate: shift(src.startDate),
      dueDate: shift(src.dueDate),
      dueTime: src.dueTime,
      timeSlot: src.timeSlot,
      campaignId: src.campaignId,
      brandId: src.brandId,
      workstream: src.workstream,
      channel: src.channel,
    },
    actorId,
  );
}

function sqlAddDays(dayStr: string, days: number): string {
  if (!days) return dayStr;
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function softDeleteTask(db: DB, id: string, actorId: string | null) {
  await db.update(tasks).set({ deletedAt: new Date(), updatedBy: actorId }).where(eq(tasks.id, id));
  await writeAudit(db, { actorId, entity: "tasks", entityId: id, action: "DELETE" });
}

export async function addComment(db: DB, taskId: string, authorId: string, body: string, mentionedUserIds: string[] = []) {
  const [c] = await db.insert(comments).values({ taskId, authorId, body, mentionedUserIds }).returning();
  const [task] = await db.select({ title: tasks.title, watchersTaskId: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  for (const uid of mentionedUserIds) {
    if (uid === authorId) continue;
    await notify(db, {
      userId: uid,
      kind: "mention",
      taskId,
      title: `Bạn được nhắc tới trong task: ${task?.title ?? ""}`,
      body,
      dedupeKey: `comment:${c.id}:${uid}`,
    });
  }
  const watchers = await db.select({ userId: taskWatchers.userId }).from(taskWatchers).where(eq(taskWatchers.taskId, taskId));
  for (const w of watchers) {
    if (w.userId === authorId || mentionedUserIds.includes(w.userId)) continue;
    await notify(db, {
      userId: w.userId,
      kind: "comment",
      taskId,
      title: `Bình luận mới ở task đang theo dõi: ${task?.title ?? ""}`,
      body,
      dedupeKey: `comment:${c.id}:${w.userId}`,
    });
  }
  return c;
}

/** SPEC Mục 6.5/6.6 — tick checklist, cascade cập nhật sbu_item_status + tự done task fan-out. */
export async function toggleChecklistItem(
  db: DB,
  itemId: string,
  done: boolean,
  actorId: string | null,
  opts: { note?: string; photoUrl?: string } = {},
) {
  const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
  if (!item) throw new ServiceError("Không tìm thấy mục checklist.", "NOT_FOUND");

  await db
    .update(checklistItems)
    .set({
      done,
      doneBy: done ? actorId : null,
      doneAt: done ? new Date() : null,
      note: opts.note ?? item.note,
      photoUrl: opts.photoUrl ?? item.photoUrl,
    })
    .where(eq(checklistItems.id, itemId));

  if (item.sbuId) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId)).limit(1);
    if (task?.recurringRuleId && task.occurrenceDate) {
      const period = task.occurrenceDate.slice(0, 7);
      // cascade: nếu rule gắn với hạng mục catalog (default_recurring_rule_id), upsert trạng thái
      // (Mục 6.6) — chưa có dòng sẵn cho (hạng mục, SBU, kỳ) nên phải insert-or-update, không thể update suông.
      const catalogMatches = await db
        .select({ id: sbuCatalogItems.id })
        .from(sbuCatalogItems)
        .where(eq(sbuCatalogItems.defaultRecurringRuleId, task.recurringRuleId));
      for (const { id: catalogItemId } of catalogMatches) {
        await db
          .insert(sbuItemStatus)
          .values({
            catalogItemId,
            sbuId: item.sbuId,
            period,
            status: done ? "done" : "in_progress",
            statusSource: "derived_from_task",
            taskId: task.id,
          })
          .onConflictDoUpdate({
            target: [sbuItemStatus.catalogItemId, sbuItemStatus.sbuId, sbuItemStatus.period],
            set: { status: done ? "done" : "in_progress", statusSource: "derived_from_task", taskId: task.id, updatedBy: actorId },
          });
      }
    }
  }

  const all = await db.select({ done: checklistItems.done }).from(checklistItems).where(eq(checklistItems.taskId, item.taskId));
  const allDone = all.length > 0 && all.every((r) => r.done);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, item.taskId)).limit(1);
  if (task) {
    if (allDone && task.status !== "done") {
      await updateTask(db, task.id, { status: "done" }, actorId, { trackManualEdit: false });
    } else if (!allDone && task.status === "done") {
      await updateTask(db, task.id, { status: "in_progress" }, actorId, { trackManualEdit: false });
    }
  }
}

export async function listOverdueForUser(db: DB, userId: string, today = todayVnDayStr()) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.assigneeId, userId), isNull(tasks.deletedAt), overdueSqlFragment(today)));
}
