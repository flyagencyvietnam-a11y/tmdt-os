"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import {
  addOtherCost,
  createKpiAssignment,
  deleteKpiAssignment,
  deleteOtherCost,
  updateKpiAssignment,
  type KpiAssignmentInput,
} from "@/lib/services/kpi";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (isServiceError(e)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Có lỗi xảy ra." };
}

export async function createKpiAssignmentAction(
  input: KpiAssignmentInput,
): Promise<Result> {
  const user = await requireUser();
  try {
    const data = await createKpiAssignment(db, input, { id: user.id, role: user.role });
    revalidatePath("/kpi");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function updateKpiAssignmentAction(
  id: string,
  patch: { targetValue?: number; weightPct?: number; manualActual?: number | null; note?: string | null },
  reason?: string,
): Promise<Result> {
  const user = await requireUser();
  try {
    await updateKpiAssignment(db, id, patch, { id: user.id, role: user.role }, reason);
    revalidatePath("/kpi");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteKpiAssignmentAction(id: string): Promise<Result> {
  const user = await requireUser();
  try {
    await deleteKpiAssignment(db, id, { id: user.id, role: user.role });
    revalidatePath("/kpi");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addOtherCostAction(input: {
  costType: "KOL_KOC" | "TOOL" | "OTHER";
  incurredOn: string;
  productId?: string | null;
  amount: number;
  note?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  try {
    await addOtherCost(db, input, { id: user.id, role: user.role });
    revalidatePath("/kpi");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOtherCostAction(id: string): Promise<Result> {
  const user = await requireUser();
  try {
    await deleteOtherCost(db, id, { id: user.id, role: user.role });
    revalidatePath("/kpi");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
