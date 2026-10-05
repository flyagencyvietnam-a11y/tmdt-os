"use server";

import { revalidatePath } from "next/cache";
import { isManagerLike, isStaff } from "@/lib/auth/permissions";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  addComment,
  bulkUpdateTasks,
  createTask,
  duplicateTask,
  softDeleteTasks,
  toggleChecklistItem,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/lib/services/tasks";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function requireSessionUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Phiên đăng nhập đã hết hạn.");
  return user;
}

export async function createTaskAction(input: CreateTaskInput): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    if (
      input.assigneeId &&
      input.assigneeId !== user.id &&
      !user.canAssign &&
      user.role !== "admin" &&
      user.role !== "manager"
    ) {
      return { ok: false, error: "Bạn chưa được cấp quyền giao task cho người khác (can_assign)." };
    }
    const task = await createTask(db, input, user.id);
    revalidatePath("/task");
    revalidatePath("/");
    return { ok: true, id: task.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function updateTaskAction(id: string, patch: UpdateTaskInput): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    await updateTask(db, id, patch, user.id);
    revalidatePath("/task");
    revalidatePath(`/task/${id}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function bulkUpdateTasksAction(ids: string[], patch: UpdateTaskInput): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    if (!isManagerLike(user.role) && !user.canAssign && patch.assigneeId) {
      return { ok: false, error: "Bạn chưa được cấp quyền giao task cho người khác (can_assign)." };
    }
    await bulkUpdateTasks(db, ids, patch, user.id);
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  return deleteTasksAction([id]);
}

/** Xoá (mềm) nhiều task. Việc lặp được chuyển sang Lưu trữ thay vì xoá hẳn (xem softDeleteTasks). */
export async function deleteTasksAction(ids: string[]): Promise<ActionResult & { deleted?: number; archivedRecurring?: number }> {
  try {
    const user = await requireSessionUser();
    if (!isStaff(user.role)) return { ok: false, error: "Không có quyền xoá task." };
    const r = await softDeleteTasks(db, ids, user.id);
    revalidatePath("/task");
    revalidatePath("/");
    revalidatePath("/content");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function duplicateTaskAction(id: string, dayOffset = 0): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    const t = await duplicateTask(db, id, user.id, dayOffset);
    revalidatePath("/task");
    return { ok: true, id: t.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    await toggleChecklistItem(db, itemId, done, user.id);
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

const commentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().min(1),
  mentionedUserIds: z.array(z.string().uuid()).default([]),
});

export async function addCommentAction(input: z.infer<typeof commentSchema>): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    const d = commentSchema.parse(input);
    await addComment(db, d.taskId, user.id, d.body, d.mentionedUserIds);
    revalidatePath(`/task/${d.taskId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
