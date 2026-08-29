"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import { lockPeriod, unlockPeriod } from "@/lib/services/period-lock";

type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (isServiceError(e)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Có lỗi xảy ra." };
}

export async function lockPeriodAction(
  periodStart: string,
  periodEnd: string,
  note?: string,
): Promise<Result> {
  const user = await requireRole("ADMIN");
  try {
    await lockPeriod(db, { periodStart, periodEnd, note }, { id: user.id, role: user.role });
    revalidatePath("/khoa-so");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function unlockPeriodAction(id: string, reason: string): Promise<Result> {
  const user = await requireRole("ADMIN");
  try {
    await unlockPeriod(db, id, { id: user.id, role: user.role }, reason);
    revalidatePath("/khoa-so");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
