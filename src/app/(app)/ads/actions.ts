"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applyAdsImport, planAdsImport, type AdsImportKind, type AdsImportPreviewRow } from "@/lib/services/import/ads-import";
import {
  deleteAdsCampaign,
  deleteAdsMetric,
  deleteEcomProductPeriod,
  saveEcomProductPeriod,
  rollupCampaignsToMetric,
  patchAdsCampaign,
  upsertAdsCampaign,
  upsertAdsMetric,
  upsertDisbursementPlan,
  type UpsertAdsCampaignInput,
  type EcomProductRowInput,
  type UpsertAdsMetricInput,
} from "@/lib/services/ads";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireManagerLike() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
  return user;
}

export async function upsertAdsMetricAction(input: UpsertAdsMetricInput): Promise<Result<{ id: string }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa." };
  try {
    const row = await upsertAdsMetric(db, input, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function deleteAdsMetricAction(id: string): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được xoá." };
  try {
    await deleteAdsMetric(db, id, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function upsertAdsCampaignAction(input: UpsertAdsCampaignInput): Promise<Result<{ id: string }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa." };
  try {
    const row = await upsertAdsCampaign(db, input, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

/** Sửa 1 ô của request ngay trên bảng. */
export async function patchAdsCampaignAction(id: string, patch: Partial<UpsertAdsCampaignInput>): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa." };
  try {
    if (patch.campaignName !== undefined && !patch.campaignName.trim()) return { ok: false, error: "Tên request không được để trống." };
    if (patch.spend !== undefined && patch.spend !== "" && !Number.isFinite(Number(patch.spend))) return { ok: false, error: "Chi tiêu phải là số." };
    if (patch.period !== undefined && !/^d{4}-d{2}$/.test(patch.period)) return { ok: false, error: "Kỳ phải dạng tháng, vd 10/2026." };
    await patchAdsCampaign(db, id, patch, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function deleteAdsCampaignAction(id: string): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được xoá." };
  try {
    await deleteAdsCampaign(db, id, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function rollupCampaignsAction(sbuId: string, period: string): Promise<Result<{ id: string }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được cộng dồn." };
  try {
    const row = await rollupCampaignsToMetric(db, sbuId, period, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function upsertDisbursementPlanAction(input: {
  id?: string;
  line: "b2c_system" | "ecom" | "osir";
  period: string;
  plannedAmount: string;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa." };
  try {
    const row = await upsertDisbursementPlan(db, input, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function saveEcomProductPeriodAction(input: { period: string; periodEnd?: string | null; rows: EcomProductRowInput[] }): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được sửa." };
  if (!/^d{4}-d{2}$/.test(input.period)) return { ok: false, error: "Kỳ không hợp lệ." };
  if (input.periodEnd && (!/^d{4}-d{2}$/.test(input.periodEnd) || input.periodEnd < input.period)) return { ok: false, error: "Tháng kết thúc phải sau hoặc bằng tháng bắt đầu." };
  try {
    await saveEcomProductPeriod(db, input, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function deleteEcomProductPeriodAction(period: string): Promise<Result> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được xoá." };
  try {
    await deleteEcomProductPeriod(db, period, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

// ---------------------------------------------------------------------------
// Import Excel (hàng tuần / hàng tháng / theo request)
// ---------------------------------------------------------------------------

async function readImportForm(formData: FormData) {
  const kind = formData.get("kind");
  if (kind !== "week" && kind !== "month" && kind !== "request") return { ok: false as const, error: "Loại import không hợp lệ." };
  const file = formData.get("file") as File | null;
  if (!file || typeof file === "string") return { ok: false as const, error: "Chưa chọn file." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false as const, error: "Chỉ nhận file .xlsx (dùng đúng template)." };
  if (file.size > 5 * 1024 * 1024) return { ok: false as const, error: "File quá lớn (>5MB)." };
  return { ok: true as const, kind: kind as AdsImportKind, buf: Buffer.from(await file.arrayBuffer()) };
}

/** Bước 1: đọc + kiểm tra, KHÔNG ghi gì — trả về từng dòng sẽ tạo/cập nhật/bỏ qua/lỗi. */
export async function previewAdsImportAction(formData: FormData): Promise<Result<{ rows: AdsImportPreviewRow[] }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được nạp file." };
  const f = await readImportForm(formData);
  if (!f.ok) return { ok: false, error: f.error };
  try {
    const plan = await planAdsImport(db, f.kind, f.buf);
    return { ok: true, data: { rows: plan.rows } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không đọc được file." };
  }
}

/** Bước 2: kiểm tra lại file rồi ghi các dòng hợp lệ (dòng lỗi/bỏ qua không ghi). */
export async function commitAdsImportAction(formData: FormData): Promise<Result<{ created: number; updated: number; skipped: number; errors: number }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Chỉ admin/manager được nạp file." };
  const f = await readImportForm(formData);
  if (!f.ok) return { ok: false, error: f.error };
  try {
    const plan = await planAdsImport(db, f.kind, f.buf);
    const res = await applyAdsImport(db, f.kind, plan, user.id);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi ghi dữ liệu." };
  }
}
