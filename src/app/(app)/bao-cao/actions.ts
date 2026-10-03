"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generatePeriodicReport } from "@/lib/services/reports";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function generateReportNowAction(period: string): Promise<Result<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return { ok: false, error: "Không có quyền." };
  try {
    const row = await generatePeriodicReport(db, "monthly_summary", period, user.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
