import { desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { monitoringChecks, monitoringItems, monitoringPhotos, sbus, tasks, type MonitoringItem } from "@/lib/db/schema";
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
  area?: string | null;
  quantity?: number | null;
  sizeText?: string | null;
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
      area: input.area ?? null,
      quantity: input.quantity ?? null,
      sizeText: input.sizeText ?? null,
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
  // Nhật ký rà soát: mỗi lần ghi nhận = 1 dòng (kể cả "đã rà review Google Maps ngày …").
  await db.insert(monitoringChecks).values({ itemId: id, checkedOn: input.lastUpdatedDate, note: input.note ?? null, createdBy: actorId });
  // Đã cập nhật -> nếu có task đang mở gắn với mục này thì đóng lại.
  if (item.lastTaskId) {
    await updateTask(db, item.lastTaskId, { status: "done" }, actorId, { trackManualEdit: false }).catch(() => {});
  }
  await writeAudit(db, { actorId, entity: "monitoring_items", entityId: id, action: "UPDATE", changes: { lastUpdatedDate: input.lastUpdatedDate } });
}

export interface UpdateMonitoringInput {
  title?: string;
  kind?: MonitoringItem["kind"];
  currentStateNote?: string | null;
  cycleMonths?: number;
  photoUrl?: string | null;
  lastUpdatedDate?: string | null;
  area?: string | null;
  quantity?: number | null;
  sizeText?: string | null;
}

export async function updateMonitoringItem(db: DB, id: string, patch: UpdateMonitoringInput, actorId: string | null) {
  const set: Partial<typeof monitoringItems.$inferInsert> = { updatedBy: actorId };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.currentStateNote !== undefined) set.currentStateNote = patch.currentStateNote;
  if (patch.cycleMonths !== undefined) set.cycleMonths = Math.max(1, Math.round(patch.cycleMonths));
  if (patch.photoUrl !== undefined) set.photoUrl = patch.photoUrl;
  if (patch.lastUpdatedDate !== undefined) set.lastUpdatedDate = patch.lastUpdatedDate;
  if (patch.area !== undefined) set.area = patch.area;
  if (patch.quantity !== undefined) set.quantity = patch.quantity;
  if (patch.sizeText !== undefined) set.sizeText = patch.sizeText;
  await db.update(monitoringItems).set(set).where(eq(monitoringItems.id, id));
  await writeAudit(db, { actorId, entity: "monitoring_items", entityId: id, action: "UPDATE", changes: patch as Record<string, unknown> });
}

export async function deleteMonitoringItem(db: DB, id: string, actorId: string | null) {
  // Ảnh + nhật ký rà soát xoá theo (ON DELETE CASCADE). Task cảnh báo cũ giữ nguyên.
  await db.delete(monitoringItems).where(eq(monitoringItems.id, id));
  await writeAudit(db, { actorId, entity: "monitoring_items", entityId: id, action: "DELETE" });
}

/** Thêm nhanh nhiều hạng mục cùng loại cho 1 SBU (mỗi tên 1 dòng). Bỏ qua tên trống / đã có sẵn. */
export async function bulkCreateMonitoringItems(
  db: DB,
  input: { sbuId: string; kind: MonitoringItem["kind"]; titles: string[]; cycleMonths?: number },
  actorId: string | null,
): Promise<number> {
  const existing = await db.select({ title: monitoringItems.title }).from(monitoringItems).where(eq(monitoringItems.sbuId, input.sbuId));
  const have = new Set(existing.map((e) => e.title.trim().toLowerCase()));
  const seen = new Set<string>();
  const titles = input.titles
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const k = t.toLowerCase();
      if (have.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (titles.length === 0) return 0;
  const rows = await db
    .insert(monitoringItems)
    .values(titles.map((title) => ({ sbuId: input.sbuId, kind: input.kind, title, cycleMonths: input.cycleMonths ?? 12, createdBy: actorId })))
    .returning({ id: monitoringItems.id });
  for (const r of rows) await writeAudit(db, { actorId, entity: "monitoring_items", entityId: r.id, action: "CREATE" });
  return rows.length;
}

export interface PhotoMeta {
  id: string;
  itemId: string;
  caption: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

/** Siêu dữ liệu ảnh (KHÔNG kèm nội dung ảnh) để trang liệt kê nhẹ. */
export async function listPhotoMeta(db: DB): Promise<PhotoMeta[]> {
  return db
    .select({
      id: monitoringPhotos.id,
      itemId: monitoringPhotos.itemId,
      caption: monitoringPhotos.caption,
      bytes: monitoringPhotos.bytes,
      width: monitoringPhotos.width,
      height: monitoringPhotos.height,
      createdAt: monitoringPhotos.createdAt,
    })
    .from(monitoringPhotos)
    .orderBy(monitoringPhotos.createdAt);
}

export async function addMonitoringPhoto(
  db: DB,
  input: { itemId: string; mime: string; data: Buffer; thumb: Buffer; width?: number | null; height?: number | null; caption?: string | null },
  actorId: string | null,
) {
  const [row] = await db
    .insert(monitoringPhotos)
    .values({
      itemId: input.itemId,
      mime: input.mime,
      data: input.data,
      thumb: input.thumb,
      width: input.width ?? null,
      height: input.height ?? null,
      bytes: input.data.length,
      caption: input.caption ?? null,
      createdBy: actorId,
    })
    .returning({ id: monitoringPhotos.id });
  return row;
}

export async function getMonitoringPhotoBytes(db: DB, id: string, size: "thumb" | "full") {
  const [row] = await db
    .select({ mime: monitoringPhotos.mime, data: size === "thumb" ? monitoringPhotos.thumb : monitoringPhotos.data })
    .from(monitoringPhotos)
    .where(eq(monitoringPhotos.id, id))
    .limit(1);
  return row ?? null;
}

export async function updatePhotoCaption(db: DB, id: string, caption: string | null) {
  await db.update(monitoringPhotos).set({ caption }).where(eq(monitoringPhotos.id, id));
}

export async function deleteMonitoringPhoto(db: DB, id: string) {
  await db.delete(monitoringPhotos).where(eq(monitoringPhotos.id, id));
}

export async function listMonitoringChecks(db: DB, itemId: string, limit = 30) {
  return db.select().from(monitoringChecks).where(eq(monitoringChecks.itemId, itemId)).orderBy(desc(monitoringChecks.checkedOn), desc(monitoringChecks.createdAt)).limit(limit);
}

/** Số lần rà soát gần nhất của mỗi hạng mục (cho danh sách). */
export async function lastCheckNotes(db: DB): Promise<Map<string, { checkedOn: string; note: string | null; n: number }>> {
  const rows = await db
    .select({
      itemId: monitoringChecks.itemId,
      n: sql<number>`count(*)::int`,
      checkedOn: sql<string>`max(${monitoringChecks.checkedOn})`,
    })
    .from(monitoringChecks)
    .groupBy(monitoringChecks.itemId);
  return new Map(rows.map((r) => [r.itemId, { checkedOn: r.checkedOn, note: null, n: Number(r.n) }]));
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
