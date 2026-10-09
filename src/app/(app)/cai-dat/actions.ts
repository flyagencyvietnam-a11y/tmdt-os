"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appSettings, contentWorkflowTemplates } from "@/lib/db/schema";
import { runAllNightlyJobs, runMonitoringAlertsJob, runWeeklyReportExport, runWeeklySummary } from "@/lib/services/jobs";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

/** SPEC Mục 6.3/11.2 — nút "chạy ngay" cho admin, dùng khi cần sinh/nhắc ngay không chờ lịch đêm. */
export async function runNightlyJobsNowAction(): Promise<Result<Awaited<ReturnType<typeof runAllNightlyJobs>>>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Chỉ admin được chạy job." };
  const r = await runAllNightlyJobs(db);
  return { ok: true, data: r };
}

export async function runWeeklyJobsNowAction(): Promise<Result<{ summary: unknown; reportExport: unknown }>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Chỉ admin được chạy job." };
  const [summary, reportExport] = await Promise.all([runWeeklySummary(db), runWeeklyReportExport(db)]);
  return { ok: true, data: { summary, reportExport } };
}

export async function runMonitoringJobNowAction(): Promise<Result<{ created: number }>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Chỉ admin được chạy job." };
  const r = await runMonitoringAlertsJob(db);
  return { ok: true, data: { created: r.affected } };
}

// ---------------------------------------------------------------------------
// SPEC Mục 13.4 — cấu hình chung (app_settings) sửa trực tiếp dạng JSON.
// ---------------------------------------------------------------------------

export async function updateAppSettingAction(key: string, rawValue: string): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Chỉ admin được sửa cấu hình." };
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    return { ok: false, error: "Giá trị phải là JSON hợp lệ (ví dụ số, chuỗi có ngoặc kép, mảng, object)." };
  }
  const [before] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  await db.update(appSettings).set({ value, updatedBy: user.id }).where(eq(appSettings.key, key));
  await writeAudit(db, { actorId: user.id, entity: "app_settings", entityId: key, action: "UPDATE", changes: { value: { from: before?.value, to: value } } });
  revalidatePath("/cai-dat");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// SPEC Mục 7.2/13.4 — quy trình content (content_workflow_templates).
// ---------------------------------------------------------------------------

const stepSchema = z.object({
  label: z.string().min(1),
  offsetWorkdaysBeforePublish: z.coerce.number().int().min(0),
  roleHint: z.enum(["owner", "designer", "approver", "fixed"]),
  assigneeId: z.string().uuid().optional(),
});

const workflowSchema = z.object({
  brandId: z.string().uuid().optional().or(z.literal("")),
  channel: z.string().optional(),
  steps: z.array(stepSchema).min(1),
});

export async function createContentWorkflowTemplateAction(input: z.infer<typeof workflowSchema>): Promise<Result<{ id: string }>> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Chỉ admin được sửa quy trình content." };
  const parsed = workflowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  const d = parsed.data;
  const [row] = await db
    .insert(contentWorkflowTemplates)
    .values({ brandId: d.brandId || null, channel: d.channel || null, steps: d.steps, createdBy: user.id })
    .returning();
  await writeAudit(db, { actorId: user.id, entity: "content_workflow_templates", entityId: row.id, action: "CREATE" });
  revalidatePath("/cai-dat");
  return { ok: true, data: { id: row.id } };
}

export async function deleteContentWorkflowTemplateAction(id: string): Promise<Result> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Chỉ admin được sửa quy trình content." };
  await db.delete(contentWorkflowTemplates).where(eq(contentWorkflowTemplates.id, id));
  await writeAudit(db, { actorId: user.id, entity: "content_workflow_templates", entityId: id, action: "DELETE" });
  revalidatePath("/cai-dat");
  return { ok: true, data: undefined };
}
