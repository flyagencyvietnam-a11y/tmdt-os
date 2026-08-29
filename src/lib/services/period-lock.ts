import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { periodLocks } from "@/lib/db/schema";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

/**
 * Kiểm tra một ngày (YYYY-MM-DD local VN) có nằm trong kỳ đã khóa sổ không.
 * SPEC Mục 7.13 / 18.2 — sau khi khóa, dữ liệu trong kỳ chỉ đọc với mọi vai trò trừ ADMIN.
 */
export async function isDateLocked(db: AnyDb, dayStr: string): Promise<boolean> {
  const [row] = await db
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        isNull(periodLocks.unlockedAt),
        lte(periodLocks.periodStart, dayStr),
        gte(periodLocks.periodEnd, dayStr),
      ),
    )
    .limit(1);
  return !!row;
}

export async function assertNotLocked(
  db: AnyDb,
  dayStr: string,
  role: string,
): Promise<void> {
  if (role === "ADMIN") return;
  if (await isDateLocked(db, dayStr)) {
    throw new ServiceError(
      `Ngày ${dayStr} thuộc kỳ đã khóa sổ — chỉ ADMIN mới sửa được (SPEC Mục 18.2).`,
      "PERIOD_LOCKED",
    );
  }
}

export async function listPeriodLocks(db: AnyDb) {
  return db.select().from(periodLocks).orderBy(desc(periodLocks.periodStart));
}

/** Khóa sổ một kỳ — chỉ ADMIN (SPEC Mục 7.13). */
export async function lockPeriod(
  db: AnyDb,
  opts: { periodStart: string; periodEnd: string; note?: string },
  actor: Actor,
): Promise<void> {
  if (actor.role !== "ADMIN")
    throw new ServiceError("Chỉ ADMIN được khóa sổ.", "FORBIDDEN");
  const [existing] = await db
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        isNull(periodLocks.unlockedAt),
        eq(periodLocks.periodStart, opts.periodStart),
        eq(periodLocks.periodEnd, opts.periodEnd),
      ),
    )
    .limit(1);
  if (existing) return;

  const [row] = await db
    .insert(periodLocks)
    .values({
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      lockedBy: actor.id,
      note: opts.note ?? null,
    })
    .returning({ id: periodLocks.id });

  await writeAudit(db, {
    actorId: actor.id,
    entity: "period_locks",
    entityId: row.id,
    action: "LOCK",
    changes: { period: { from: null, to: `${opts.periodStart}..${opts.periodEnd}` } },
  });
}

/** Mở khóa — chỉ ADMIN, ghi audit (SPEC Mục 7.13). */
export async function unlockPeriod(
  db: AnyDb,
  id: string,
  actor: Actor,
  reason: string,
): Promise<void> {
  if (actor.role !== "ADMIN")
    throw new ServiceError("Chỉ ADMIN được mở khóa sổ.", "FORBIDDEN");
  if (!reason?.trim())
    throw new ServiceError("Mở khóa sổ phải kèm lý do.", "NEED_REASON");

  await db
    .update(periodLocks)
    .set({ unlockedAt: new Date(), unlockedBy: actor.id, note: reason })
    .where(eq(periodLocks.id, id));

  await writeAudit(db, {
    actorId: actor.id,
    entity: "period_locks",
    entityId: id,
    action: "UNLOCK",
    changes: { reason: { from: null, to: reason } },
  });
}
