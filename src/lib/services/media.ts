import { and, asc, eq, isNull, like } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { mediaDeliverables, mediaShoots, tasks, type MediaShoot } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { nextShootCode } from "./codes";
import { createTask, updateTask } from "./tasks";
import { ServiceError } from "./errors";
import { addDaysStr } from "@/lib/time";
import { addWorkdays, loadDeptWorkDays, loadHolidaySet } from "./workdays";

export interface CreateShootInput {
  shootDate: string;
  location?: string | null;
  sbuId?: string | null;
  brandId?: string | null;
  purpose?: string | null;
  crew?: string | null;
  equipment?: string | null;
  scriptUrl?: string | null;
  notes?: string | null;
  timeSlot?: "morning" | "afternoon" | "all_day" | null;
  responsibleId?: string | null;
}

/** SPEC Mục 7.3 — mỗi media_shoot sinh task chuẩn bị (-5 ngày làm việc) + task quay (đúng ngày). */
export async function createMediaShoot(db: DB, input: CreateShootInput, actorId: string | null): Promise<MediaShoot> {
  const code = await nextShootCode(db);
  const [shoot] = await db
    .insert(mediaShoots)
    .values({
      code,
      shootDate: input.shootDate,
      location: input.location ?? null,
      sbuId: input.sbuId ?? null,
      brandId: input.brandId ?? null,
      purpose: input.purpose ?? null,
      crew: input.crew ?? null,
      equipment: input.equipment ?? null,
      scriptUrl: input.scriptUrl ?? null,
      notes: input.notes ?? null,
      createdBy: actorId,
    })
    .returning();

  const workDays = await loadDeptWorkDays(db);
  const holidaySet = await loadHolidaySet(db);
  const prepDue = addWorkdays(shoot.shootDate, -5, workDays, holidaySet);

  await createTask(
    db,
    {
      title: `Chuẩn bị quay: ${shoot.code} — ${input.purpose ?? ""}`.trim(),
      type: "media",
      assigneeId: input.responsibleId ?? null,
      dueDate: prepDue,
      brandId: shoot.brandId,
      sourceType: "media_shoot",
      sourceId: shoot.id,
      sbuIds: shoot.sbuId ? [shoot.sbuId] : undefined,
    },
    actorId,
  );
  await createTask(
    db,
    {
      title: `Quay: ${shoot.code} — ${input.purpose ?? ""}`.trim(),
      type: "media",
      assigneeId: input.responsibleId ?? null,
      dueDate: shoot.shootDate,
      timeSlot: input.timeSlot ?? "all_day",
      brandId: shoot.brandId,
      sourceType: "media_shoot",
      sourceId: shoot.id,
      sbuIds: shoot.sbuId ? [shoot.sbuId] : undefined,
    },
    actorId,
  );

  await writeAudit(db, { actorId, entity: "media_shoots", entityId: shoot.id, action: "CREATE" });
  return shoot;
}

export interface AddDeliverableInput {
  shootId: string;
  deliverableType: string;
  quantity?: number;
  channel?: string | null;
  brandId?: string | null;
  campaignId?: string | null;
  editorId?: string | null;
  dueDate?: string | null;
}

/** SPEC Mục 7.3 — mỗi media_deliverable sinh 1 task hậu kỳ, giao editor_id, hạn due_date. */
export async function addMediaDeliverable(db: DB, input: AddDeliverableInput, actorId: string | null) {
  const [shoot] = await db.select().from(mediaShoots).where(eq(mediaShoots.id, input.shootId)).limit(1);
  if (!shoot) throw new ServiceError("Không tìm thấy đợt quay.", "NOT_FOUND");

  const [deliverable] = await db
    .insert(mediaDeliverables)
    .values({
      shootId: input.shootId,
      deliverableType: input.deliverableType,
      quantity: input.quantity ?? 1,
      channel: input.channel ?? null,
      brandId: input.brandId ?? shoot.brandId,
      campaignId: input.campaignId ?? null,
      editorId: input.editorId ?? null,
      dueDate: input.dueDate ?? null,
      createdBy: actorId,
    })
    .returning();

  const task = await createTask(
    db,
    {
      title: `Hậu kỳ: ${input.deliverableType} — ${shoot.code}`,
      type: "media",
      assigneeId: input.editorId ?? null,
      dueDate: input.dueDate ?? null,
      campaignId: input.campaignId ?? null,
      brandId: deliverable.brandId,
      sourceType: "media_shoot",
      sourceId: deliverable.id,
    },
    actorId,
  );

  return { deliverable, task };
}

/**
 * SPEC Mục 7.3 — "tạo tự động lịch quay định kỳ": nhập ngày đợt 1 và số đợt,
 * tạo các media_shoot cách nhau `intervalDays` (mặc định 14).
 */
export async function generateRecurringShoots(
  db: DB,
  input: {
    firstDate: string;
    count: number;
    intervalDays?: number;
    sbuId?: string | null;
    brandId?: string | null;
    purpose?: string | null;
    responsibleId?: string | null;
  },
  actorId: string | null,
): Promise<MediaShoot[]> {
  const interval = input.intervalDays ?? 14;
  const out: MediaShoot[] = [];
  for (let i = 0; i < input.count; i++) {
    const shoot = await createMediaShoot(
      db,
      {
        shootDate: addDaysStr(input.firstDate, i * interval),
        sbuId: input.sbuId,
        brandId: input.brandId,
        purpose: input.purpose,
        responsibleId: input.responsibleId,
      },
      actorId,
    );
    out.push(shoot);
  }
  return out;
}

export async function listShoots(db: DB) {
  return db
    .select()
    .from(mediaShoots)
    .where(isNull(mediaShoots.deletedAt))
    .orderBy(asc(mediaShoots.shootDate));
}

export async function listDeliverables(db: DB, shootId?: string) {
  return db
    .select()
    .from(mediaDeliverables)
    .where(shootId ? eq(mediaDeliverables.shootId, shootId) : undefined)
    .orderBy(asc(mediaDeliverables.dueDate));
}

export async function updateShootStatus(db: DB, id: string, status: MediaShoot["status"], actorId: string | null) {
  await db.update(mediaShoots).set({ status, updatedBy: actorId }).where(eq(mediaShoots.id, id));
  await writeAudit(db, { actorId, entity: "media_shoots", entityId: id, action: "UPDATE", changes: { status } });
}

export async function deleteShoot(db: DB, id: string, actorId: string | null) {
  await db.update(mediaShoots).set({ deletedAt: new Date(), updatedBy: actorId }).where(and(eq(mediaShoots.id, id)));
  await writeAudit(db, { actorId, entity: "media_shoots", entityId: id, action: "DELETE" });
}

export interface UpdateShootInput {
  shootDate?: string;
  location?: string | null;
  purpose?: string | null;
  sbuId?: string | null;
  brandId?: string | null;
  status?: MediaShoot["status"];
}

/**
 * Sửa đợt quay ngay trên bảng. Đổi ngày quay → dời luôn task "Quay" (đúng ngày) và task "Chuẩn bị quay"
 * (-5 ngày làm việc); đổi mục đích → đổi tiêu đề 2 task đó cho khớp.
 */
export async function updateMediaShoot(db: DB, id: string, patch: UpdateShootInput, actorId: string | null) {
  const [before] = await db.select().from(mediaShoots).where(eq(mediaShoots.id, id)).limit(1);
  if (!before) throw new ServiceError("Không tìm thấy đợt quay.", "NOT_FOUND");
  const set: Partial<typeof mediaShoots.$inferInsert> = { updatedBy: actorId };
  for (const k of ["shootDate", "location", "purpose", "sbuId", "brandId", "status"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.shootDate !== undefined && !patch.shootDate) throw new ServiceError("Ngày quay không được để trống.", "VALIDATION");
  const [after] = await db.update(mediaShoots).set(set).where(eq(mediaShoots.id, id)).returning();

  const dateChanged = patch.shootDate !== undefined && patch.shootDate !== before.shootDate;
  const purposeChanged = patch.purpose !== undefined && patch.purpose !== before.purpose;
  if (dateChanged || purposeChanged) {
    const linked = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.sourceType, "media_shoot"), eq(tasks.sourceId, id), isNull(tasks.deletedAt), like(tasks.title, "%: " + before.code + "%")));
    const workDays = await loadDeptWorkDays(db);
    const holidaySet = await loadHolidaySet(db);
    for (const t of linked) {
      const isPrep = t.title.startsWith("Chuẩn bị quay");
      const isShoot = t.title.startsWith("Quay:");
      if (!isPrep && !isShoot) continue;
      const taskPatch: { dueDate?: string; title?: string } = {};
      if (dateChanged) taskPatch.dueDate = isPrep ? addWorkdays(after.shootDate, -5, workDays, holidaySet) : after.shootDate;
      if (purposeChanged) taskPatch.title = `${isPrep ? "Chuẩn bị quay" : "Quay"}: ${after.code} — ${after.purpose ?? ""}`.trim();
      await updateTask(db, t.id, taskPatch, actorId, { trackManualEdit: false });
    }
  }
  await writeAudit(db, { actorId, entity: "media_shoots", entityId: id, action: "UPDATE", changes: patch as Record<string, unknown> });
  return after;
}

export interface UpdateDeliverableInput {
  deliverableType?: string;
  channel?: string | null;
  editorId?: string | null;
  dueDate?: string | null;
  resultUrl?: string | null;
  quantity?: number;
}

/** Sửa deliverable trên bảng; đổi editor/hạn → task hậu kỳ tương ứng đổi theo. */
export async function updateMediaDeliverable(db: DB, id: string, patch: UpdateDeliverableInput, actorId: string | null) {
  const set: Partial<typeof mediaDeliverables.$inferInsert> = { updatedBy: actorId };
  for (const k of ["deliverableType", "channel", "editorId", "dueDate", "resultUrl", "quantity"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (patch.deliverableType !== undefined && !patch.deliverableType.trim()) throw new ServiceError("Loại deliverable không được để trống.", "VALIDATION");
  const [row] = await db.update(mediaDeliverables).set(set).where(eq(mediaDeliverables.id, id)).returning();
  if (!row) throw new ServiceError("Không tìm thấy deliverable.", "NOT_FOUND");
  if (patch.editorId !== undefined || patch.dueDate !== undefined) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.sourceType, "media_shoot"), eq(tasks.sourceId, id), isNull(tasks.deletedAt))).limit(1);
    if (t) {
      await updateTask(
        db,
        t.id,
        { ...(patch.editorId !== undefined ? { assigneeId: patch.editorId } : {}), ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}) },
        actorId,
        { trackManualEdit: false },
      );
    }
  }
  await writeAudit(db, { actorId, entity: "media_deliverables", entityId: id, action: "UPDATE", changes: patch as Record<string, unknown> });
  return row;
}
