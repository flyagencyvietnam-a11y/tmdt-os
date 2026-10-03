"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createMonitoringItem, markMonitoringRefreshed, runMonitoringAlerts, type CreateMonitoringInput } from "@/lib/services/monitoring";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin" || user.role === "manager" || user.role === "member") return user;
  return null;
}

export async function createMonitoringItemAction(input: CreateMonitoringInput): Promise<Result<{ id: string }>> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    const row = await createMonitoringItem(db, input, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function markMonitoringRefreshedAction(
  id: string,
  input: { lastUpdatedDate: string; photoUrl?: string | null; note?: string | null },
): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { ok: false, error: "Không có quyền." };
  try {
    await markMonitoringRefreshed(db, id, input, user.id);
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

export async function runMonitoringAlertsNowAction(): Promise<Result<{ created: number }>> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return { ok: false, error: "Không có quyền." };
  const r = await runMonitoringAlerts(db);
  return { ok: true, data: r };
}
