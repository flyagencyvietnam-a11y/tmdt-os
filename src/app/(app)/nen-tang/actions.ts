"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  createTaskFromFoundationCell,
  entryHistory,
  updateFoundationCell,
  upsertFoundationEntry,
} from "@/lib/services/foundation";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireManagerLike() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
  return user;
}

export async function upsertFoundationEntryAction(input: {
  brandId: string;
  sectionCode: string;
  componentCode: string;
  componentLabel: string;
  content?: string | null;
  status?: "confirmed" | "needs_confirmation" | "proposed";
}): Promise<Result<{ id: string }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa Foundation." };
  try {
    const row = await upsertFoundationEntry(db, input, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function updateFoundationCellAction(
  entryId: string,
  patch: { content?: string | null; status?: "confirmed" | "needs_confirmation" | "proposed" },
): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa Foundation." };
  try {
    await updateFoundationCell(db, entryId, patch, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function createTaskFromFoundationCellAction(entryId: string): Promise<Result<{ taskId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập." };
  try {
    const task = await createTaskFromFoundationCell(db, entryId, user.id);
    return { ok: true, data: { taskId: task.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function foundationHistoryAction(entryId: string) {
  return entryHistory(db, entryId);
}
