"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  deleteAdsCampaign,
  deleteAdsMetric,
  deleteEcomProductPeriod,
  saveEcomProductPeriod,
  rollupCampaignsToMetric,
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
