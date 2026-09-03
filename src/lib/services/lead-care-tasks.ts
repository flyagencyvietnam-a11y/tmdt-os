import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { leads, tasks } from "@/lib/db/schema";
import { todayVnDayStr, vnDayStr } from "@/lib/time";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

const OPEN_STATUSES = ["TODO", "IN_PROGRESS"] as const;

/**
 * "1 lead cần chăm sóc = 1 bản ghi task" (gộp màn hình "Hôm nay" vào Công việc).
 *
 * Sinh 1 task type=LEAD_CARE cho mỗi lead OPEN, đã có người phụ trách, đang:
 *   - quá hạn / đến hẹn chăm sóc (next_contact_date <= hôm nay), hoặc
 *   - lead mới chưa xử lý (stage = NEW)
 * ...mà chưa có task LEAD_CARE nào đang mở gắn lead đó.
 * 1 task = 1 phiên: ghi tương tác / đóng lead sẽ hoàn thành task (xem
 * completeLeadCareTasks), sáng hôm sau nếu vẫn đến hẹn thì sinh task mới.
 */
export async function spawnLeadCareTasks(
  db: AnyDb,
  now = new Date(),
): Promise<{ created: number }> {
  const today = todayVnDayStr(now);

  const due = await db
    .select({
      id: leads.id,
      code: leads.code,
      fullName: leads.fullName,
      assignedTo: leads.assignedTo,
      stage: leads.stage,
      nextContactDate: leads.nextContactDate,
      receivedAt: leads.receivedAt,
      silenceCount: leads.silenceCount,
      createdBy: leads.createdBy,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        eq(leads.outcome, "OPEN"),
        sql`${leads.assignedTo} is not null`,
        or(lte(leads.nextContactDate, today), eq(leads.stage, "NEW")),
      ),
    );
  if (due.length === 0) return { created: 0 };

  const openTasks = await db
    .select({ leadId: tasks.leadId })
    .from(tasks)
    .where(
      and(
        eq(tasks.type, "LEAD_CARE"),
        isNull(tasks.deletedAt),
        inArray(tasks.status, [...OPEN_STATUSES]),
        inArray(
          tasks.leadId,
          due.map((l) => l.id),
        ),
      ),
    );
  const haveTask = new Set(openTasks.map((t) => t.leadId));

  const rows = due
    .filter((l) => l.assignedTo && !haveTask.has(l.id))
    .map((l) => {
      const isNew = l.stage === "NEW";
      const hrsSinceRecv =
        (now.getTime() - new Date(l.receivedAt).getTime()) / 3_600_000;
      const priority =
        isNew && hrsSinceRecv >= 24
          ? "URGENT"
          : l.silenceCount >= 4
            ? "HIGH"
            : "NORMAL";
      return {
        title: `Chăm sóc: ${l.code} — ${l.fullName}`,
        type: "LEAD_CARE" as const,
        assigneeId: l.assignedTo!,
        leadId: l.id,
        dueDate: l.nextContactDate ?? vnDayStr(new Date(l.receivedAt)),
        priority: priority as "URGENT" | "HIGH" | "NORMAL",
        goalKpi: isNew ? "Phản hồi lead mới trong 15 phút (V12)" : null,
        linkUrl: `/lead/${l.id}`,
        createdBy: l.createdBy,
        updatedBy: l.createdBy,
      };
    });
  if (rows.length === 0) return { created: 0 };

  // Chèn 1 lần (backlog lần đầu có thể vài trăm dòng).
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(tasks).values(rows.slice(i, i + 200));
  }
  return { created: rows.length };
}

/**
 * Hoàn thành mọi task LEAD_CARE đang mở của 1 lead (khi ghi tương tác, hoặc khi
 * lead chuyển sang WON/LOST/DISQUALIFIED).
 */
export async function completeLeadCareTasks(
  db: AnyDb,
  leadId: string,
  actor: Actor,
  reason: string,
  now = new Date(),
): Promise<number> {
  const open = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.type, "LEAD_CARE"),
        eq(tasks.leadId, leadId),
        isNull(tasks.deletedAt),
        inArray(tasks.status, [...OPEN_STATUSES]),
      ),
    );
  if (open.length === 0) return 0;

  await db
    .update(tasks)
    .set({
      status: "DONE",
      progressPct: 100,
      completedAt: now,
      updatedBy: actor.id,
    })
    .where(
      inArray(
        tasks.id,
        open.map((t) => t.id),
      ),
    );

  for (const t of open) {
    await writeAudit(db, {
      actorId: actor.id,
      entity: "tasks",
      entityId: t.id,
      action: "UPDATE",
      changes: { status: { from: "open", to: "DONE" }, reason: { from: null, to: reason } },
    });
  }
  return open.length;
}
