"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import { findDuplicates, mergeLead } from "@/lib/services/dedup";
import { createEnrollment } from "@/lib/services/enrollments";
import { recordInteraction } from "@/lib/services/interactions";
import {
  createLead,
  reassignLead,
  updateLead,
  type CreateLeadInput,
  type UpdateLeadPatch,
} from "@/lib/services/leads";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (isServiceError(e)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Có lỗi xảy ra. Thử lại hoặc báo quản trị." };
}

export async function checkDuplicatesAction(input: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  productId?: string | null;
  campaignId?: string | null;
}) {
  await requireUser();
  return findDuplicates(db, input);
}

export async function createLeadAction(input: CreateLeadInput): Promise<Result<{ id: string; code: string }>> {
  const user = await requireUser();
  if (!can(user.role, "lead", "create")) return { ok: false, error: "Không có quyền." };
  try {
    const data = await createLead(db, input, { id: user.id, role: user.role });
    revalidatePath("/lead");
    revalidatePath("/cong-viec");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLeadAction(
  id: string,
  patch: UpdateLeadPatch,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "lead", "update")) return { ok: false, error: "Không có quyền." };
  // MARKETING không được đổi stage/outcome (QĐ03)
  if (
    (patch.stage || patch.outcome) &&
    !can(user.role, "lead.statusChange", "update")
  )
    return { ok: false, error: "Vai trò của bạn không được đổi giai đoạn/kết quả lead." };
  try {
    await updateLead(db, id, patch, { id: user.id, role: user.role });
    revalidatePath("/lead");
    revalidatePath(`/lead/${id}`);
    revalidatePath("/cong-viec");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function recordInteractionAction(input: {
  leadId: string;
  channel: "CALL" | "ZALO" | "MESSENGER" | "EMAIL" | "SMS" | "MEET";
  direction: "OUTBOUND" | "INBOUND";
  result: "RESPONDED" | "NO_RESPONSE" | "REFUSED" | "RESCHEDULED";
  content?: string | null;
  stageAfter?: "NEW" | "NO_CONTACT" | "CONSULTING" | "MQL" | "SQL";
  stageChangeReason?: string;
  nextContactDateOverride?: string | null;
  overrideReason?: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "leadInteraction", "create"))
    return { ok: false, error: "Không có quyền." };
  try {
    const res = await recordInteraction(db, input, { id: user.id, role: user.role });
    revalidatePath(`/lead/${input.leadId}`);
    revalidatePath("/cong-viec");
    revalidatePath("/lead");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function createEnrollmentAction(input: {
  leadId: string;
  productId: string;
  contractDate: string;
  grossAmount: number;
  discountAmount?: number;
  collectedAmount?: number;
  studentCount?: number;
  note?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "lead.revenue", "create"))
    return { ok: false, error: "Không có quyền ghi doanh thu." };
  try {
    const res = await createEnrollment(db, input, { id: user.id, role: user.role });
    revalidatePath(`/lead/${input.leadId}`);
    revalidatePath("/lead");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function reassignLeadAction(
  leadId: string,
  toUserId: string,
  reason?: string,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "lead.reassign", "update"))
    return { ok: false, error: "Chỉ ADMIN/MANAGER phân công lại được." };
  try {
    await reassignLead(db, leadId, toUserId, { id: user.id, role: user.role }, reason);
    revalidatePath("/lead");
    revalidatePath(`/lead/${leadId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function mergeLeadAction(
  keepId: string,
  mergeId: string,
): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "lead", "update")) return { ok: false, error: "Không có quyền." };
  try {
    await mergeLead(db, { keepId, mergeId, actorId: user.id });
    revalidatePath("/lead");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
