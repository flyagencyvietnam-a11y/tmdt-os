import { and, eq, isNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { enrollments, leads, products, users } from "@/lib/db/schema";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

/**
 * Bàn giao học viên sang DotB EMS — SPEC Mục 2.3 ("chỉ export").
 * Điểm bàn giao = thời điểm chốt học viên.
 */
export async function listHandoff(db: AnyDb, opts: { onlyPending?: boolean } = {}) {
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      leadCode: leads.code,
      fullName: leads.fullName,
      phone: leads.phone,
      email: leads.email,
      productCode: products.code,
      contractDate: enrollments.contractDate,
      grossAmount: enrollments.grossAmount,
      netAmount: enrollments.netAmount,
      collectedAmount: enrollments.collectedAmount,
      studentCount: enrollments.studentCount,
      creditedTo: users.fullName,
      emsStudentId: enrollments.emsStudentId,
      classAssigned: leads.classAssigned,
      preferredSchedule: leads.preferredSchedule,
    })
    .from(enrollments)
    .innerJoin(leads, eq(leads.id, enrollments.leadId))
    .leftJoin(products, eq(products.id, enrollments.productId))
    .leftJoin(users, eq(users.id, enrollments.creditedTo))
    .where(
      and(
        isNull(enrollments.deletedAt),
        isNull(leads.deletedAt),
        opts.onlyPending ? isNull(enrollments.emsStudentId) : undefined,
      ),
    )
    .orderBy(sql`${enrollments.contractDate} desc`);
  return rows.map((r) => ({
    ...r,
    grossAmount: Number(r.grossAmount),
    netAmount: Number(r.netAmount ?? 0),
    collectedAmount: Number(r.collectedAmount),
  }));
}

export async function setEmsStudentId(
  db: AnyDb,
  enrollmentId: string,
  emsStudentId: string,
  actor: Actor,
) {
  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
  if (!row) throw new ServiceError("Không tìm thấy bản ghi doanh thu.", "NOT_FOUND");
  await db
    .update(enrollments)
    .set({ emsStudentId: emsStudentId.trim() || null, updatedBy: actor.id })
    .where(eq(enrollments.id, enrollmentId));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "enrollments",
    entityId: enrollmentId,
    action: "UPDATE",
    changes: { ems_student_id: { from: null, to: emsStudentId } },
  });
}
