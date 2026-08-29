"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
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
    revalidatePath("/ads");
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
      if (await copyMetricFromPreviousDay(db, id, targetDate, { id: user.id, role: user.role }))
        copied++;
    }
    revalidatePath("/ads");
    return { ok: true, data: { copied } };
  } catch (e) {
    return fail(e);
  }
}
