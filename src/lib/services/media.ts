import { and, asc, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { mediaDeliverables, mediaShoots, type MediaShoot } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { nextShootCode } from "./codes";
import { createTask } from "./tasks";
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
