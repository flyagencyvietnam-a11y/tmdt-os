"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseSheet, parseWorkbookSheets } from "@/lib/services/import/parse";
import { confirmT3Import, createPendingBatch, undoImportBatch, validateT3Rows, type T3ValidatedRow } from "@/lib/services/import/t3-tasks";
import {
  confirmT1Import,
  createPendingBatchT1,
  undoT1Batch,
  validateT1,
  type T1ActionRow,
  type T1CampaignRow,
} from "@/lib/services/import/t1-campaign-plan";
import { confirmT2Import, createPendingBatchT2, validateT2, type T2Row } from "@/lib/services/import/t2-users-sbus";
import { confirmT4Import, createPendingBatchT4, validateT4, type T4Row } from "@/lib/services/import/t4-recurring";

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

// ---------------------------------------------------------------------------
// T1 — Plan campaign tháng (CAMPAIGN + ACTIONS)
// ---------------------------------------------------------------------------

export async function uploadAndValidateT1(
  formData: FormData,
): Promise<Result<{ batchId: string; campaigns: T1CampaignRow[]; actions: T1ActionRow[] }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Chỉ admin/manager được nạp file." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Chưa chọn file." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "T1 chỉ nhận file .xlsx (2 sheet CAMPAIGN + ACTIONS)." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File quá lớn (>5MB)." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const sheets = await parseWorkbookSheets(buf, ["CAMPAIGN", "ACTIONS"]);
    if (sheets.ACTIONS.length > 200) {
      return { ok: false, error: `File có ${sheets.ACTIONS.length} action, vượt trần 200 (SPEC Mục 7.7). Tách nhỏ file.` };
    }
    const data = await validateT1(db, sheets.CAMPAIGN, sheets.ACTIONS);
    const batch = await createPendingBatchT1(db, file.name, user.id, data);
    return { ok: true, data: { batchId: batch.id, ...data } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được file." };
  }
}

export async function confirmT1Action(
  batchId: string,
): Promise<Result<{ campaignsCreated: number; campaignsUpdated: number; actionsCreated: number; actionsUpdated: number }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const r = await confirmT1Import(db, batchId, user.id);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi ghi dữ liệu." };
  }
}

export async function undoT1Action(batchId: string): Promise<Result<{ undone: number }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const r = await undoT1Batch(db, batchId, user.id);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi hoàn tác." };
  }
}

// ---------------------------------------------------------------------------
// T2 — Người dùng và SBU (USERS + SBUS)
// ---------------------------------------------------------------------------

export async function uploadAndValidateT2(formData: FormData): Promise<Result<{ batchId: string; rows: T2Row[] }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Chỉ admin được nạp file." };
  if (user.role !== "admin") return { ok: false, error: "Chỉ admin được nạp người dùng/SBU." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Chưa chọn file." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "T2 chỉ nhận file .xlsx (2 sheet USERS + SBUS)." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const sheets = await parseWorkbookSheets(buf, ["USERS", "SBUS"]);
    const rows = await validateT2(db, sheets.USERS, sheets.SBUS);
    if (rows.length > 200) return { ok: false, error: `File có ${rows.length} dòng, vượt trần 200.` };
    const batch = await createPendingBatchT2(db, file.name, user.id, rows);
    return { ok: true, data: { batchId: batch.id, rows } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được file." };
  }
}

export async function confirmT2Action(
  batchId: string,
): Promise<Result<{ usersCreated: number; usersUpdated: number; sbusCreated: number; sbusUpdated: number }>> {
  const user = await requireAdminOrManager();
  if (!user || user.role !== "admin") return { ok: false, error: "Chỉ admin được xác nhận." };
  try {
    const r = await confirmT2Import(db, batchId);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi ghi dữ liệu." };
  }
}

// ---------------------------------------------------------------------------
// T4 — Quy tắc lặp (RECURRING)
// ---------------------------------------------------------------------------

export async function uploadAndValidateT4(formData: FormData): Promise<Result<{ batchId: string; rows: T4Row[] }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Chỉ admin/manager được nạp file." };
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Chưa chọn file." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = file.name.toLowerCase().endsWith(".xlsx")
      ? (await parseWorkbookSheets(buf, ["RECURRING"])).RECURRING
      : await parseSheet(buf, file.name);
    if (parsed.length > 200) return { ok: false, error: `File có ${parsed.length} dòng, vượt trần 200.` };
    const rows = await validateT4(db, parsed);
    const batch = await createPendingBatchT4(db, file.name, user.id, rows);
    return { ok: true, data: { batchId: batch.id, rows } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được file." };
  }
}

export async function confirmT4Action(batchId: string): Promise<Result<{ created: number; updated: number }>> {
  const user = await requireAdminOrManager();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const r = await confirmT4Import(db, batchId, user.id);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi ghi dữ liệu." };
  }
}
