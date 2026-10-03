"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isAiAssistConfigured, parsePlanTextToActions, type SuggestedAction } from "@/lib/services/ai-assist";
import { createTask } from "@/lib/services/tasks";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireManagerLike() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
  return user;
}

export async function analyzeplanTextAction(planText: string): Promise<Result<{ actions: SuggestedAction[]; configured: boolean }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Không có quyền." };
  if (!isAiAssistConfigured()) {
    return { ok: false, error: "Chưa cấu hình ANTHROPIC_API_KEY trong môi trường — tính năng Trợ lý AI chưa bật." };
  }
  try {
    const actions = await parsePlanTextToActions(planText);
    return { ok: true, data: { actions, configured: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export interface ApprovedAction {
  title: string;
  dueDate: string | null;
  assigneeId: string | null;
  priority: "urgent" | "high" | "medium" | "low";
  channel: string | null;
}

/** SPEC Mục 14.4 — LUÔN có bước người duyệt: chỉ ghi task sau khi người dùng xem/sửa và bấm xác nhận ở đây. */
export async function createTasksFromAiSuggestionsAction(actions: ApprovedAction[]): Promise<Result<{ created: number }>> {
  const user = await requireManagerLike();
  if (!user) return { ok: false, error: "Không có quyền." };
  let created = 0;
  for (const a of actions) {
    await createTask(
      db,
      {
        title: a.title,
        type: "general",
        assigneeId: a.assigneeId,
        dueDate: a.dueDate,
        priority: a.priority,
        channel: a.channel,
        sourceType: "manual",
      },
      user.id,
    );
    created++;
  }
  return { ok: true, data: { created } };
}
