"use server";

import { revalidatePath } from "next/cache";
import { isStaff } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requests } from "@/lib/db/schema";
import { updateTask } from "@/lib/services/tasks";
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
    if (!user || !isStaff(user.role)) return { ok: false, error: "Chỉ nhân sự Marketing được nhận request." };
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

/** Đổi người thực hiện = đổi người phụ trách của task sinh ra khi nhận request. */
export async function assignRequestExecutorAction(id: string, userId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user || !isStaff(user.role)) return { ok: false, error: "Chỉ nhân sự Marketing được giao người thực hiện." };
    const [req] = await db.select({ taskId: requests.taskId }).from(requests).where(eq(requests.id, id)).limit(1);
    if (!req) return { ok: false, error: "Không tìm thấy request." };
    if (!req.taskId) return { ok: false, error: "Request chưa được nhận — bấm “Nhận” (nhập hạn cam kết) trước, hệ thống sẽ tự giao theo bảng định tuyến." };
    if (!userId) return { ok: false, error: "Chọn người thực hiện." };
    await updateTask(db, req.taskId, { assigneeId: userId }, user.id);
    revalidatePath("/request");
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
