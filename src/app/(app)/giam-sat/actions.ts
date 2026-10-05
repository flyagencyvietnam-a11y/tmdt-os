"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  bulkCreateMonitoringItems,
  createMonitoringItem,
  deleteMonitoringItem,
  deleteMonitoringPhoto,
  listMonitoringChecks,
  markMonitoringRefreshed,
  runMonitoringAlerts,
  updateMonitoringItem,
  updatePhotoCaption,
  type CreateMonitoringInput,
  type UpdateMonitoringInput,
} from "@/lib/services/monitoring";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin" || user.role === "manager" || user.role === "member") return user;
  return null;
}
async function requireManager() {
  const user = await getCurrentUser();
  return user && (user.role === "admin" || user.role === "manager") ? user : null;
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
}

export async function createMonitoringItemAction(input: CreateMonitoringInput): Promise<Result<{ id: string }>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const row = await createMonitoringItem(db, input, user.id);
    revalidatePath("/giam-sat");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Thêm nhanh nhiều hạng mục (mỗi dòng 1 tên) vào 1 SBU. */
export async function bulkCreateMonitoringItemsAction(input: { sbuId: string; kind: CreateMonitoringInput["kind"]; titles: string[]; cycleMonths?: number }): Promise<Result<{ created: number }>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const created = await bulkCreateMonitoringItems(db, input, user.id);
    revalidatePath("/giam-sat");
    return { ok: true, data: { created } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMonitoringItemAction(id: string, patch: UpdateMonitoringInput): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  if (patch.title !== undefined && !patch.title.trim()) return { ok: false, error: "Tên hạng mục không được để trống." };
  try {
    await updateMonitoringItem(db, id, { ...patch, title: patch.title?.trim() }, user.id);
    revalidatePath("/giam-sat");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMonitoringItemAction(id: string): Promise<Result> {
  const user = await requireManager();
  if (!user) return { ok: false, error: "Chỉ admin/manager được xoá hạng mục." };
  try {
    await deleteMonitoringItem(db, id, user.id);
    revalidatePath("/giam-sat");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function markMonitoringRefreshedAction(
  id: string,
  input: { lastUpdatedDate: string; photoUrl?: string | null; note?: string | null },
): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  if (!input.lastUpdatedDate) return { ok: false, error: "Chọn ngày rà soát." };
  try {
    await markMonitoringRefreshed(db, id, input, user.id);
    revalidatePath("/giam-sat");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function listMonitoringChecksAction(itemId: string): Promise<Result<{ id: string; checkedOn: string; note: string | null }[]>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  const rows = await listMonitoringChecks(db, itemId);
  return { ok: true, data: rows.map((r) => ({ id: r.id, checkedOn: r.checkedOn, note: r.note })) };
}

export async function deleteMonitoringPhotoAction(id: string): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await deleteMonitoringPhoto(db, id);
    revalidatePath("/giam-sat");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function captionMonitoringPhotoAction(id: string, caption: string): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await updatePhotoCaption(db, id, caption.trim() || null);
    revalidatePath("/giam-sat");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function runMonitoringAlertsNowAction(): Promise<Result<{ created: number }>> {
  const user = await requireManager();
  if (!user) return { ok: false, error: "Không có quyền." };
  const r = await runMonitoringAlerts(db);
  revalidatePath("/giam-sat");
  return { ok: true, data: r };
}
