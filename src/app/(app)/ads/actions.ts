"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteAdsMonthly, upsertAdsMonthly, type UpsertAdsMonthlyInput } from "@/lib/services/ads";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireManagerLike() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
  return user;
}

export async function upsertAdsMonthlyAction(input: UpsertAdsMonthlyInput): Promise<Result<{ id: string }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa." };
  try {
    const row = await upsertAdsMonthly(db, input, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function deleteAdsMonthlyAction(id: string): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được xoá." };
  try {
    await deleteAdsMonthly(db, id, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
