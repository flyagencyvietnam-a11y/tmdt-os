"use server";

import { revalidatePath } from "next/cache";
import { isStaff } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assignRequestExecutor, createRequest, updateRequest, type CreateRequestInput, type UpdateRequestInput } from "@/lib/services/requests";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Request là sổ ghi nhận task được order — nhân sự Marketing tự thêm, tự sửa, không có bước duyệt (SPEC Phụ lục D mục 25). */
async function staffOnly(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!isStaff(user.role)) return { ok: false, error: "Chỉ nhân sự Marketing được ghi nhận và cập nhật request." };
  return { ok: true, userId: user.id };
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
}

export async function createRequestAction(input: CreateRequestInput): Promise<ActionResult> {
  try {
    const g = await staffOnly();
    if (!g.ok) return g;
    await createRequest(db, input, g.userId);
    revalidatePath("/request");
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateRequestAction(id: string, patch: UpdateRequestInput): Promise<ActionResult> {
  try {
    const g = await staffOnly();
    if (!g.ok) return g;
    await updateRequest(db, id, patch, g.userId);
    revalidatePath("/request");
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Đổi người thực hiện = đổi người phụ trách của task đi kèm request. */
export async function assignRequestExecutorAction(id: string, userId: string): Promise<ActionResult> {
  try {
    const g = await staffOnly();
    if (!g.ok) return g;
    if (!userId) return { ok: false, error: "Chọn người thực hiện." };
    await assignRequestExecutor(db, id, userId, g.userId);
    revalidatePath("/request");
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
