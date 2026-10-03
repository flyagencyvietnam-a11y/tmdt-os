"use server";

import { db } from "@/lib/db";
import { consumeConfirmationToken, getConfirmationToken } from "@/lib/services/confirmation-tokens";
import { updateTask } from "@/lib/services/tasks";

type Result = { ok: true } | { ok: false; error: string };

async function validate(token: string): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const row = await getConfirmationToken(db, token);
  if (!row) return { ok: false, error: "Liên kết không hợp lệ." };
  if (row.usedAt) return { ok: false, error: "Liên kết đã được dùng." };
  if (row.expiresAt < new Date()) return { ok: false, error: "Liên kết đã hết hạn (7 ngày)." };
  return { ok: true, taskId: row.taskId };
}

export async function confirmDoneAction(token: string): Promise<Result> {
  const v = await validate(token);
  if (!v.ok) return v;
  await updateTask(db, v.taskId, { status: "done" }, null, { trackManualEdit: false });
  await consumeConfirmationToken(db, token);
  return { ok: true };
}

export async function reportBlockedAction(token: string, reason: string): Promise<Result> {
  const v = await validate(token);
  if (!v.ok) return v;
  if (!reason.trim()) return { ok: false, error: "Phải nhập lý do vướng." };
  await updateTask(db, v.taskId, { status: "blocked", blockedReason: reason }, null, { trackManualEdit: false });
  await consumeConfirmationToken(db, token);
  return { ok: true };
}
