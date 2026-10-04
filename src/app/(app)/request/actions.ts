"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { acceptRequest, createRequest, updateRequestStatus, type CreateRequestInput } from "@/lib/services/requests";
import { todayVnDayStr } from "@/lib/time";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createRequestAction(input: CreateRequestInput): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
    await createRequest(db, input, user.id);
    revalidatePath("/request");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function acceptRequestAction(id: string, committedDate: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "manager")) return { ok: false, error: "Chỉ admin/manager được nhận request." };
    if (!committedDate) return { ok: false, error: "Phải nhập hạn cam kết." };
    await acceptRequest(db, id, committedDate, user.id);
    revalidatePath("/request");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function updateRequestStatusAction(
  id: string,
  status: "in_progress" | "in_review" | "done" | "rejected" | "postponed",
  rejectReason?: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
    await updateRequestStatus(db, id, status, user.id, { rejectReason, completedDate: status === "done" ? todayVnDayStr() : undefined });
    revalidatePath("/request");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
