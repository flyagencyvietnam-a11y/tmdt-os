import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { monitoringItems, sbus, tasks, type MonitoringItem } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { createTask, updateTask } from "./tasks";
import { addDaysStr, todayVnDayStr } from "@/lib/time";

export type MonitoringAlert = "overdue" | "due_soon" | "ok" | "no_data";

/** SPEC Mục 9.5 — cảnh báo suy ra từ `lastUpdatedDate + cycleMonths`, không lưu cột. */
export function nextDueDate(item: Pick<MonitoringItem, "lastUpdatedDate" | "cycleMonths">): string | null {
  if (!item.lastUpdatedDate) return null;
  const [y, m, d] = item.lastUpdatedDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + item.cycleMonths, d));
  return dt.toISOString().slice(0, 10);
}

export function computeAlert(
  item: Pick<MonitoringItem, "lastUpdatedDate" | "cycleMonths">,
  today: string = todayVnDayStr(),
): MonitoringAlert {
  const due = nextDueDate(item);
  if (!due) return "no_data";
  if (due < today) return "overdue";
  if (due <= addDaysStr(today, 30)) return "due_soon";
  return "ok";
}

export const ALERT_LABELS: Record<MonitoringAlert, string> = {
  overdue: "Quá hạn",
  due_soon: "Sắp đến hạn trong 30 ngày",
  ok: "Còn hạn",
  no_data: "Chưa có dữ liệu",
};

export async function listMonitoringItems(db: DB) {
  return db.select().from(monitoringItems);
}

export interface CreateMonitoringInput {
  sbuId: string;
  kind: MonitoringItem["kind"];
  title: string;
  currentStateNote?: string | null;
  lastUpdatedDate?: string | null;
  cycleMonths?: number;
  photoUrl?: string | null;
}

export async function createMonitoringItem(db: DB, input: CreateMonitoringInput, actorId: string | null) {
  const [row] = await db
    .insert(monitoringItems)
    .values({
      sbuId: input.sbuId,
      kind: input.kind,
      title: input.title,
      currentStateNote: input.currentStateNote ?? null,
      lastUpdatedDate: input.lastUpdatedDate ?? null,
      cycleMonths: input.cycleMonths ?? 12,
      photoUrl: input.photoUrl ?? null,
      createdBy: actorId,
    })
    .returning();
  await writeAudit(db, { actorId, entity: "monitoring_items", entityId: row.id, action: "CREATE" });
  return row;
}

export async function markMonitoringRefreshed(
  db: DB,
  id: string,
  input: { lastUpdatedDate: string; photoUrl?: string | null; note?: string | null },
  actorId: string | null,
) {
  const [item] = await db.select().from(monitoringItems).where(eq(monitoringItems.id, id)).limit(1);
  if (!item) return;
  await db
    .update(monitoringItems)
    .set({
      lastUpdatedDate: input.lastUpdatedDate,
      photoUrl: input.photoUrl ?? item.photoUrl,
      currentStateNote: input.note ?? item.currentStateNote,
      updatedBy: actorId,
    })
    .where(eq(monitoringItems.id, id));
  // Đã cập nhật -> nếu có task đang mở gắn với mục này thì đóng lại.
  if (item.lastTaskId) {
    await updateTask(db, item.lastTaskId, { status: "done" }, actorId, { trackManualEdit: false }).catch(() => {});
  }
  await writeAudit(db, { actorId, entity: "monitoring_items", entityId: id, action: "UPDATE", changes: { lastUpdatedDate: input.lastUpdatedDate } });
}

/**
 * SPEC Mục 9.5 — mục Quá hạn/Sắp đến hạn tự sinh task cho HO phụ trách SBU.
 * Idempotent trong kỳ: chỉ sinh task mới nếu mục chưa có task đang mở.
 */
export async function runMonitoringAlerts(db: DB, now = new Date()) {
  const today = todayVnDayStr(now);
  const items = await db
    .select({ item: monitoringItems, hoOwnerId: sbus.hoOwnerId })
    .from(monitoringItems)
    .innerJoin(sbus, eq(sbus.id, monitoringItems.sbuId));

  let created = 0;
  for (const { item, hoOwnerId } of items) {
    const alert = computeAlert(item, today);
    if (alert !== "overdue" && alert !== "due_soon") continue;

    if (item.lastTaskId) {
      const [existing] = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(inArray(tasks.id, [item.lastTaskId]))
        .limit(1);
      if (existing && existing.status !== "done" && existing.status !== "cancelled") continue;
    }

    const task = await createTask(
      db,
      {
        title: `[${ALERT_LABELS[alert]}] ${item.title}`,
        type: "monitoring",
        assigneeId: hoOwnerId ?? null,
        dueDate: nextDueDate(item) ?? today,
        sourceType: "manual",
      },
      null,
    );
    await db.update(monitoringItems).set({ lastTaskId: task.id }).where(eq(monitoringItems.id, item.id));
    created++;
  }
  return { created };
}
