import { and, eq, isNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { enrollments, leadStageHistory, leads } from "@/lib/db/schema";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";
import { assertNotLocked } from "./period-lock";

export interface CreateEnrollmentInput {
  leadId: string;
  productId: string;
  contractDate: string; // YYYY-MM-DD
  grossAmount: number;
  discountAmount?: number;
  collectedAmount?: number;
  studentCount?: number;
  note?: string | null;
  emsStudentId?: string | null;
}

/**
 * Tạo doanh thu — SPEC Mục 7.8 / V04 / V11 / QĐ05.
 * Enrollment ĐẦU TIÊN của lead => lead tự chuyển WON, stage=WON, won_at=contract_date.
 */
export async function createEnrollment(
  db: AnyDb,
  input: CreateEnrollmentInput,
  actor: Actor,
): Promise<{ id: string; leadBecameWon: boolean }> {
  const gross = Math.round(input.grossAmount);
  const discount = Math.round(input.discountAmount ?? 0);
  const collected = Math.round(input.collectedAmount ?? 0);
  const students = input.studentCount ?? 1;

  if (gross <= 0) throw new ServiceError("Doanh thu gộp phải > 0.", "GROSS_POSITIVE");
  if (discount < 0 || collected < 0)
    throw new ServiceError("Giảm trừ / tiền thu không được âm.", "NONNEG");
  if (collected > gross - discount)
    throw new ServiceError(
      "Tiền thực thu không được vượt doanh thu ròng (V11).",
      "V11",
    );
  if (students < 1) throw new ServiceError("Số HVM phải >= 1.", "STUDENT_COUNT");

  await assertNotLocked(db, input.contractDate, actor.role);

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, input.leadId), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) throw new ServiceError("Không tìm thấy lead.", "NOT_FOUND");

  const [existing] = await db
    .select({ c: sql<number>`count(*)` })
    .from(enrollments)
    .where(and(eq(enrollments.leadId, input.leadId), isNull(enrollments.deletedAt)));
  const isFirst = Number(existing?.c ?? 0) === 0;

  const [row] = await db
    .insert(enrollments)
    .values({
      leadId: input.leadId,
      productId: input.productId,
      contractDate: input.contractDate,
      grossAmount: gross,
      discountAmount: discount,
      collectedAmount: collected,
      studentCount: students,
      creditedTo: lead.assignedTo, // QĐ05
      emsStudentId: input.emsStudentId?.trim() || null,
      note: input.note?.trim() || null,
      createdBy: actor.id,
      updatedBy: actor.id,
    })
    .returning({ id: enrollments.id });

  await writeAudit(db, {
    actorId: actor.id,
    entity: "enrollments",
    entityId: row.id,
    action: "CREATE",
    changes: {
      lead_id: { from: null, to: input.leadId },
      gross_amount: { from: null, to: gross },
      contract_date: { from: null, to: input.contractDate },
    },
  });

  let leadBecameWon = false;
  if (isFirst && lead.outcome !== "WON") {
    const wonAt = new Date(`${input.contractDate}T00:00:00+07:00`);
    await db
      .update(leads)
      .set({
        outcome: "WON",
        stage: "WON",
        maxStage: "WON",
        wonAt,
        updatedBy: actor.id,
      })
      .where(eq(leads.id, input.leadId));

    await db.insert(leadStageHistory).values({
      leadId: input.leadId,
      fromStage: lead.stage,
      toStage: "WON",
      fromOutcome: lead.outcome,
      toOutcome: "WON",
      changedBy: actor.id,
      reason: `Tạo doanh thu (enrollment ${row.id})`,
    });

    await writeAudit(db, {
      actorId: actor.id,
      entity: "leads",
      entityId: input.leadId,
      action: "UPDATE",
      changes: {
        outcome: { from: lead.outcome, to: "WON" },
        stage: { from: lead.stage, to: "WON" },
      },
    });
    leadBecameWon = true;
  }

  return { id: row.id, leadBecameWon };
}

export async function listEnrollments(db: AnyDb, leadId: string) {
  return db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.leadId, leadId), isNull(enrollments.deletedAt)))
    .orderBy(enrollments.contractDate);
}

/** Xóa mềm — SPEC Mục 5.2(4). */
export async function softDeleteEnrollment(
  db: AnyDb,
  id: string,
  actor: Actor,
) {
  const [row] = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, id))
    .limit(1);
  if (!row) throw new ServiceError("Không tìm thấy bản ghi doanh thu.", "NOT_FOUND");
  await assertNotLocked(db, row.contractDate, actor.role);
  await db
    .update(enrollments)
    .set({ deletedAt: new Date(), updatedBy: actor.id })
    .where(eq(enrollments.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "enrollments",
    entityId: id,
    action: "DELETE",
    changes: { gross_amount: { from: row.grossAmount, to: null } },
  });
}
