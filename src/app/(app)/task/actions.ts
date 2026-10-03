"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  addComment,
  bulkUpdateTasks,
  createTask,
  duplicateTask,
  softDeleteTask,
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
    if (!["admin", "manager"].includes(user.role) && patch.assigneeId) {
      return { ok: false, error: "Chỉ admin/manager được giao hàng loạt cho người khác." };
    }
    await bulkUpdateTasks(db, ids, patch, user.id);
    revalidatePath("/task");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireSessionUser();
    if (!["admin", "manager"].includes(user.role)) return { ok: false, error: "Chỉ admin/manager được xoá task." };
    await softDeleteTask(db, id, user.id);
    revalidatePath("/task");
    return { ok: true };
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
