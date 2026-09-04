"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import {
  createTask,
  setTaskArchived,
  softDeleteTask,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskPatch,
} from "@/lib/services/tasks";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (isServiceError(e)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Có lỗi xảy ra." };
}

export async function createTaskAction(input: CreateTaskInput): Promise<Result> {
  const user = await requireUser();
  // Giao cho người khác cần quyền taskAssignOthers (SPEC 3.2).
  if (
    input.assigneeId !== user.id &&
    !can(user.role, "taskAssignOthers", "create")
  )
    return { ok: false, error: "Bạn chỉ tạo được việc cho chính mình." };
  try {
    const data = await createTask(db, input, { id: user.id, role: user.role });
    revalidatePath("/cong-viec");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTaskAction(
  id: string,
  patch: UpdateTaskPatch,
): Promise<Result> {
  const user = await requireUser();
  try {
    await updateTask(db, id, patch, { id: user.id, role: user.role });
    revalidatePath("/cong-viec");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setTaskArchivedAction(
  id: string,
  archived: boolean,
): Promise<Result> {
  const user = await requireUser();
  try {
    await setTaskArchived(db, id, archived, { id: user.id, role: user.role });
    revalidatePath("/cong-viec");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTaskAction(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.role, "taskAssignOthers", "delete"))
    return { ok: false, error: "Không có quyền xóa việc." };
  try {
    await softDeleteTask(db, id, { id: user.id, role: user.role });
    revalidatePath("/cong-viec");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
