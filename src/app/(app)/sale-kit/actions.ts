"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import {
  createSaleKitItem,
  deleteSaleKitItem,
  setSaleKitStatus,
  updateSaleKitItem,
  type SaleKitInput,
} from "@/lib/services/sale-kit";

type Result = { ok: true } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  if (isServiceError(e)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Có lỗi xảy ra." };
}

async function guard() {
  const user = await requireUser();
  if (!can(user.role, "saleEnablement", "create"))
    throw Object.assign(new Error("forbidden"), { __forbidden: true });
  return user;
}

export async function createSaleKitAction(input: SaleKitInput): Promise<Result> {
  try {
    const user = await guard();
    await createSaleKitItem(db, input, { id: user.id, role: user.role });
    revalidatePath("/sale-kit");
    return { ok: true };
  } catch (e) {
    if ((e as { __forbidden?: boolean }).__forbidden)
      return { ok: false, error: "Không có quyền." };
    return fail(e);
  }
}

export async function updateSaleKitAction(
  id: string,
  patch: Partial<SaleKitInput>,
): Promise<Result> {
  try {
    const user = await guard();
    await updateSaleKitItem(db, id, patch, { id: user.id, role: user.role });
    revalidatePath("/sale-kit");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setSaleKitStatusAction(
  id: string,
  status: "DRAFT" | "APPROVED" | "ARCHIVED",
): Promise<Result> {
  try {
    const user = await guard();
    await setSaleKitStatus(db, id, status, { id: user.id, role: user.role });
    revalidatePath("/sale-kit");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSaleKitAction(id: string): Promise<Result> {
  try {
    const user = await guard();
    await deleteSaleKitItem(db, id, { id: user.id, role: user.role });
    revalidatePath("/sale-kit");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
