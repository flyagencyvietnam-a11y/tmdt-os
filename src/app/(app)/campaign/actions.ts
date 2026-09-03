"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  createCampaign,
  setCampaignStatus,
  updateCampaign,
  type CreateCampaignInput,
  type UpdateCampaignPatch,
} from "@/lib/services/campaigns";
import {
  copyMetricFromPreviousDay,
  upsertDailyMetric,
} from "@/lib/services/daily-metrics";
import { isServiceError } from "@/lib/services/errors";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (isServiceError(e)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Có lỗi xảy ra." };
}

export async function createCampaignAction(
  input: CreateCampaignInput,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "campaign", "create"))
    return { ok: false, error: "Không có quyền tạo campaign." };
  try {
    const data = await createCampaign(db, input, { id: user.id, role: user.role });
    revalidatePath("/campaign");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCampaignAction(
  id: string,
  patch: UpdateCampaignPatch,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "campaign", "update"))
    return { ok: false, error: "Không có quyền sửa campaign." };
  try {
    await updateCampaign(db, id, patch, { id: user.id, role: user.role });
    revalidatePath("/campaign");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCampaignStatusAction(
  id: string,
  status: "ON" | "OFF" | "PAUSED",
  reason?: string,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "campaign", "update"))
    return { ok: false, error: "Không có quyền." };
  try {
    await setCampaignStatus(db, id, status, { id: user.id, role: user.role }, reason);
    revalidatePath("/campaign");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Nhập / sửa spend + messages một ngày cho 1 campaign (gộp từ tab "Nhập số liệu ads"). */
export async function upsertDailyMetricAction(input: {
  campaignId: string;
  metricDate: string;
  spend: number;
  messages: number;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "campaignDailyMetric", "create"))
    return { ok: false, error: "Không có quyền nhập số liệu." };
  try {
    const res = await upsertDailyMetric(db, input, { id: user.id, role: user.role });
    revalidatePath("/campaign");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function copyYesterdayAction(
  campaignIds: string[],
  targetDate: string,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "campaignDailyMetric", "create"))
    return { ok: false, error: "Không có quyền." };
  try {
    let copied = 0;
    for (const id of campaignIds) {
      if (
        await copyMetricFromPreviousDay(db, id, targetDate, {
          id: user.id,
          role: user.role,
        })
      )
        copied++;
    }
    revalidatePath("/campaign");
    return { ok: true, data: { copied } };
  } catch (e) {
    return fail(e);
  }
}
