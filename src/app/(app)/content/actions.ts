"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { createContentItem, deleteContentItems, updateContentItem, type CreateContentItemInput } from "@/lib/services/content";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireContentEditor() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin" || user.role === "manager" || user.role === "member") return user;
  return null;
}

export async function createContentItemAction(input: CreateContentItemInput): Promise<Result<{ id: string }>> {
  const user = await requireContentEditor();
  if (!user) return { ok: false, error: "Không có quyền tạo content." };
  try {
    const item = await createContentItem(db, input, user.id);
    return { ok: true, data: { id: item.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function updateContentItemAction(
  id: string,
  patch: Partial<CreateContentItemInput> & { status?: string; postUrl?: string | null },
): Promise<Result> {
  const user = await requireContentEditor();
  if (!user) return { ok: false, error: "Không có quyền sửa content." };
  try {
    await updateContentItem(db, id, patch as never, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

/** Xoá (mềm) bài content kèm task đăng bài + các bước con. */
export async function deleteContentItemsAction(ids: string[]): Promise<Result<{ deleted: number }>> {
  const user = await requireContentEditor();
  if (!user) return { ok: false, error: "Không có quyền xoá content." };
  try {
    const deleted = await deleteContentItems(db, ids, user.id);
    revalidatePath("/content");
    revalidatePath("/task");
    return { ok: true, data: { deleted } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
