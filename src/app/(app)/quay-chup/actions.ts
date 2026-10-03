"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  addMediaDeliverable,
  createMediaShoot,
  generateRecurringShoots,
  updateShootStatus,
  type AddDeliverableInput,
  type CreateShootInput,
} from "@/lib/services/media";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin" || user.role === "manager" || user.role === "member") return user;
  return null;
}

export async function createMediaShootAction(input: CreateShootInput): Promise<Result<{ id: string }>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const shoot = await createMediaShoot(db, input, user.id);
    return { ok: true, data: { id: shoot.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function generateRecurringShootsAction(input: {
  firstDate: string;
  count: number;
  intervalDays?: number;
  sbuId?: string | null;
  brandId?: string | null;
  purpose?: string | null;
  responsibleId?: string | null;
}): Promise<Result<{ count: number }>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const rows = await generateRecurringShoots(db, input, user.id);
    return { ok: true, data: { count: rows.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function addMediaDeliverableAction(input: AddDeliverableInput): Promise<Result<{ id: string }>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const { deliverable } = await addMediaDeliverable(db, input, user.id);
    return { ok: true, data: { id: deliverable.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function updateShootStatusAction(id: string, status: string): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await updateShootStatus(db, id, status as never, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
