"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  createCampaign,
  setCampaignStatus,
  type CreateCampaignInput,
} from "@/lib/services/campaigns";
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
    revalidatePath("/ads");
    return { ok: true, data };
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
    revalidatePath("/ads");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
