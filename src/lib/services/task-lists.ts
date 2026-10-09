import { and, asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { taskSbus, tasks, type Task } from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";
import { ARCHIVE_AFTER_DAYS, FOCUS_DAYS, RECENT_DAYS, TASK_VIEWS, type TaskView } from "@/lib/task-view";
import { overdueSqlFragment } from "./tasks";

/**
 * Danh sách task có PHẠM VI + phân trang phía server — để trang /task không phải tải cả nghìn task.
 * Task đã xong/huỷ chỉ hiện trong 7 ngày gần nhất (RECENT_DAYS) ở view mặc định; quá 90 ngày thì job `archive-old-tasks`
 * đưa vào "Lưu trữ" (vẫn tra cứu được, vẫn tính vào báo cáo).
 */

export { ARCHIVE_AFTER_DAYS, clampLimit, defaultTaskView, MAX_LIMIT, PAGE_SIZE, parseTaskView, RECENT_DAYS, TASK_VIEW_LABEL, TASK_VIEWS, type TaskView } from "@/lib/task-view";

export interface TaskScope {
  userId: string;
  /** center_contributor chỉ thấy task gắn SBU của mình; null = không giới hạn; "none" = không có SBU → không thấy gì. */
  sbuId: string | null | "none";
  today: string;
  now?: Date;
}

const isOpen = sql`${tasks.status} not in ('done','cancelled')`;
const closedAt = sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt})`;

function baseWhere(scope: TaskScope): SQL[] {
  const conds: SQL[] = [isNull(tasks.deletedAt)];
  if (scope.sbuId === "none") conds.push(sql`false`);
  else if (scope.sbuId) conds.push(sql`exists (select 1 from ${taskSbus} where ${taskSbus.taskId} = ${tasks.id} and ${taskSbus.sbuId} = ${scope.sbuId})`);
  return conds;
}

function viewCondition(view: TaskView, scope: TaskScope): SQL | undefined {
  const now = scope.now ?? new Date();
  const recentCut = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const recentClosed = sql`(${tasks.status} in ('done','cancelled') and ${closedAt} >= ${recentCut.toISOString()})`;
  const active = and(isNull(tasks.archivedAt), or(isOpen, recentClosed));
  switch (view) {
    case "focus":
      // Việc cần chú ý: quá hạn, hạn trong FOCUS_DAYS ngày tới, đang làm dở (đang làm/chờ duyệt/bị chặn), + vừa xong gần đây.
      return and(
        isNull(tasks.archivedAt),
        or(
          overdueSqlFragment(scope.today),
          and(isOpen, sql`${tasks.dueDate} <= ${addDaysStr(scope.today, FOCUS_DAYS)}`),
          sql`${tasks.status} in ('in_progress','in_review','blocked')`,
          recentClosed,
        ),
      );
    case "active":
      return active;
    case "mine":
      return and(eq(tasks.assigneeId, scope.userId), active);
    case "overdue":
      return and(isNull(tasks.archivedAt), overdueSqlFragment(scope.today));
    case "week":
      return and(isNull(tasks.archivedAt), isOpen, sql`${tasks.dueDate} between ${scope.today} and ${addDaysStr(scope.today, 7)}`);
    case "done":
      return and(isNull(tasks.archivedAt), sql`${tasks.status} in ('done','cancelled')`);
    case "archived":
      return isNotNull(tasks.archivedAt);
    case "all":
      return isNull(tasks.archivedAt);
  }
}

export async function listTasksScoped(
  db: DB,
  scope: TaskScope,
  q: { view: TaskView; assigneeId?: string | null; limit: number },
): Promise<{ rows: Task[]; total: number }> {
  const where = and(...baseWhere(scope), viewCondition(q.view, scope), q.assigneeId ? eq(tasks.assigneeId, q.assigneeId) : undefined);
  const closedView = q.view === "done" || q.view === "archived";
  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(...(closedView ? [desc(closedAt)] : [sql`(${tasks.status} in ('done','cancelled'))`, sql`${tasks.dueDate} asc nulls last`, asc(tasks.priority)]))
      .limit(q.limit),
    db.select({ n: sql<number>`count(*)::int` }).from(tasks).where(where),
  ]);
  return { rows, total: Number(n) };
}

/** Số task của từng view (hiện trên chip). Một truy vấn duy nhất. */
export async function taskViewCounts(db: DB, scope: TaskScope): Promise<Record<TaskView, number>> {
  const out = {} as Record<TaskView, number>;
  const cols = Object.fromEntries(
    TASK_VIEWS.map((v) => [v, sql<number>`count(*) filter (where ${viewCondition(v, scope) ?? sql`true`})::int`]),
  );
  const [row] = await db
    .select(cols as Record<TaskView, SQL<number>>)
    .from(tasks)
    .where(and(...baseWhere(scope)));
  for (const v of TASK_VIEWS) out[v] = Number(row?.[v] ?? 0);
  return out;
}

/**
 * Lưu trữ task đã xong/huỷ quá `days` ngày (tính từ lúc xong, hoặc lần sửa cuối với task huỷ).
 * Idempotent: chỉ đụng task chưa lưu trữ. Không xoá gì — chỉ đặt `archived_at`.
 */
export async function archiveOldTasks(db: DB, days = ARCHIVE_AFTER_DAYS, now = new Date()): Promise<number> {
  const cut = new Date(now.getTime() - days * 86_400_000);
  const res = await db
    .update(tasks)
    .set({ archivedAt: now })
    .where(and(isNull(tasks.deletedAt), isNull(tasks.archivedAt), sql`${tasks.status} in ('done','cancelled')`, sql`${closedAt} < ${cut.toISOString()}`))
    .returning({ id: tasks.id });
  return res.length;
}
