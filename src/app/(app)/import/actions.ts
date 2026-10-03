"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseSheet } from "@/lib/services/import/parse";
import { confirmT3Import, createPendingBatch, undoImportBatch, validateT3Rows, type T3ValidatedRow } from "@/lib/services/import/t3-tasks";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdminOrManager() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
  return user;
}

export async function uploadAndValidateT3(formData: FormData): Promise<Result<{ batchId: string; rows: T3ValidatedRow[] }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Chỉ admin/manager được nạp file." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Chưa chọn file." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File quá lớn (>5MB)." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSheet(buf, file.name);
    if (parsed.length > 200) {
      return { ok: false, error: `File có ${parsed.length} dòng, vượt trần 200 (SPEC Mục 7.7). Tách nhỏ file.` };
    }
    const rows = await validateT3Rows(db, parsed);
    const batch = await createPendingBatch(db, file.name, user.id, rows);
    return { ok: true, data: { batchId: batch.id, rows } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được file." };
  }
}

export async function confirmT3Action(batchId: string): Promise<Result<{ created: number; updated: number }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const r = await confirmT3Import(db, batchId, user.id);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi ghi dữ liệu." };
  }
}

export async function undoT3Action(batchId: string): Promise<Result<{ undone: number }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const r = await undoImportBatch(db, batchId, user.id);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi hoàn tác." };
  }
}
