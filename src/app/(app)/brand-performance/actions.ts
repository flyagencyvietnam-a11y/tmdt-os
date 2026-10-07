"use server";

import { revalidatePath } from "next/cache";
import { isStaff } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { MetricKey } from "@/lib/brand-perf";
import { addBrandChannel, removeBrandChannel, setBrandPerfValue, updateBrandChannel } from "@/lib/services/brand-perf";

type Result = { ok: true } | { ok: false; error: string };

async function requireStaff() {
  const user = await getCurrentUser();
  return user && isStaff(user.role) ? user : null;
}
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." });

export async function setBrandPerfValueAction(input: { sbuId: string; channel: string; account?: string; period: string; metric: MetricKey; value: number | null }): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền nhập số liệu." };
  try {
    await setBrandPerfValue(db, input, user.id);
    revalidatePath("/brand-performance");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addBrandChannelAction(input: { sbuId: string; channel: string; label?: string | null; url?: string | null }): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await addBrandChannel(db, input, user.id);
    revalidatePath("/brand-performance");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBrandChannelAction(id: string, patch: { label?: string | null; url?: string | null; active?: boolean }): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await updateBrandChannel(db, id, patch, user.id);
    revalidatePath("/brand-performance");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeBrandChannelAction(id: string): Promise<Result> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await removeBrandChannel(db, id, user.id);
    revalidatePath("/brand-performance");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
