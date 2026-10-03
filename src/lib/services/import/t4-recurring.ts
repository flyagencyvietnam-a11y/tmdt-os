import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { campaigns, importBatches, importRows, recurringRules, sbus, users } from "@/lib/db/schema";
import type { ParsedRow } from "./parse";

const FREQS = new Set(["daily", "weekly", "monthly", "yearly"]);
const ASSIGN_MODES = new Set(["fixed_user", "sbu_ho_owner", "round_robin", "unassigned"]);
const DAY_RULES = new Set(["calendar_day", "last_working_day", "first_working_day"]);
const HOLIDAY_POLICIES = new Set(["none", "shift_earlier", "shift_later"]);
const SCOPE_MODES = new Set(["single", "per_sbu"]);
const FAN_OUT_MODES = new Set(["checklist_per_owner", "task_per_sbu"]);

export interface T4Row {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  ruleCode: string;
  result: "created" | "updated" | "error";
  existingId?: string;
}

function splitList(s: string | undefined): string[] {
  return (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
}
function parseDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export async function validateT4(db: DB, rows: ParsedRow[]): Promise<T4Row[]> {
  const existing = await db.select({ id: recurringRules.id, ruleCode: recurringRules.ruleCode }).from(recurringRules);
  const byCode = new Map(existing.filter((r) => r.ruleCode).map((r) => [r.ruleCode as string, r.id]));
  const allUsers = await db.select({ email: users.email }).from(users);
  const userEmails = new Set(allUsers.map((u) => u.email.toLowerCase()));
  const allSbus = await db.select({ code: sbus.code }).from(sbus);
  const sbuCodes = new Set(allSbus.map((s) => s.code));
  const allCampaigns = await db.select({ code: campaigns.code }).from(campaigns);
  const campaignCodes = new Set(allCampaigns.map((c) => c.code));

  const out: T4Row[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const errors: string[] = [];
    const ruleCode = r.data.rule_code?.trim();
    const name = r.data.name?.trim();
    const titleTemplate = r.data.title_template?.trim();
    const freq = r.data.freq?.trim();
    const startsOn = parseDate(r.data.starts_on ?? "");
    const assignmentMode = r.data.assignment_mode?.trim();

    if (!ruleCode) errors.push("Thiếu rule_code");
    else if (seen.has(ruleCode)) errors.push("rule_code trùng trong file");
    else seen.add(ruleCode);
    if (!name) errors.push("Thiếu name");
    if (!titleTemplate) errors.push("Thiếu title_template");
    if (!freq || !FREQS.has(freq)) errors.push(`freq không hợp lệ: ${freq}`);
    if (!r.data.starts_on) errors.push("Thiếu starts_on");
    else if (!startsOn) errors.push(`starts_on sai định dạng: ${r.data.starts_on}`);
    if (!assignmentMode || !ASSIGN_MODES.has(assignmentMode)) errors.push(`assignment_mode không hợp lệ: ${assignmentMode}`);
    if (assignmentMode === "fixed_user" && (!r.data.assignee_email || !userEmails.has(r.data.assignee_email.trim().toLowerCase()))) {
      errors.push("fixed_user cần assignee_email hợp lệ");
    }
    if (r.data.day_rule && !DAY_RULES.has(r.data.day_rule.trim())) errors.push(`day_rule không hợp lệ: ${r.data.day_rule}`);
    if (r.data.holiday_policy && !HOLIDAY_POLICIES.has(r.data.holiday_policy.trim())) errors.push(`holiday_policy không hợp lệ: ${r.data.holiday_policy}`);
    if (r.data.scope_mode && !SCOPE_MODES.has(r.data.scope_mode.trim())) errors.push(`scope_mode không hợp lệ: ${r.data.scope_mode}`);
    if (r.data.fan_out_mode && !FAN_OUT_MODES.has(r.data.fan_out_mode.trim())) errors.push(`fan_out_mode không hợp lệ: ${r.data.fan_out_mode}`);
    const scopeSbuCodes = r.data.scope_sbu_codes?.trim();
    if (scopeSbuCodes && scopeSbuCodes.toUpperCase() !== "ALL") {
      for (const sc of splitList(scopeSbuCodes)) if (!sbuCodes.has(sc)) errors.push(`scope_sbu_codes không tồn tại: ${sc}`);
    }
    if (r.data.campaign_code && !campaignCodes.has(r.data.campaign_code.trim())) errors.push(`campaign_code không tồn tại: ${r.data.campaign_code}`);

    const existingId = ruleCode ? byCode.get(ruleCode) : undefined;
    out.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      ruleCode: ruleCode ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }
  return out;
}

export async function createPendingBatchT4(db: DB, fileName: string, uploadedBy: string, rows: T4Row[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T4",
      fileName,
      uploadedBy,
      createdCount: rows.filter((r) => r.result === "created").length,
      updatedCount: rows.filter((r) => r.result === "updated").length,
      errorCount: rows.filter((r) => r.result === "error").length,
    })
    .returning();
  await db.insert(importRows).values(
    rows.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: "RECURRING",
      rawData: r.raw,
      result: r.result,
      entityType: "recurring_rule",
      entityId: r.existingId ?? null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

export async function confirmT4Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  let created = 0;
  let updated = 0;
  for (const row of rows.filter((r) => r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const [assignee] = raw.assignee_email
      ? await db.select({ id: users.id }).from(users).where(eq(users.email, raw.assignee_email.trim().toLowerCase())).limit(1)
      : [];
    const [campaign] = raw.campaign_code
      ? await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.code, raw.campaign_code.trim())).limit(1)
      : [];
    const scopeSbuIds =
      raw.scope_sbu_codes && raw.scope_sbu_codes.trim().toUpperCase() !== "ALL"
        ? (await db.select({ id: sbus.id, code: sbus.code }).from(sbus)).filter((s) => splitList(raw.scope_sbu_codes).includes(s.code)).map((s) => s.id)
        : undefined;

    const values = {
      name: raw.name,
      description: raw.description_template || null,
      taskTemplate: {
        title: raw.title_template,
        description: raw.description_template || undefined,
        type: (raw.type?.trim() || undefined) as never,
        priority: (raw.priority?.trim() || undefined) as never,
        checklist: raw.checklist ? splitList(raw.checklist) : undefined,
      },
      freq: raw.freq.trim() as never,
      interval: raw.interval ? Number(raw.interval) : 1,
      byWeekday: raw.by_weekday ? splitList(raw.by_weekday).map(Number) : null,
      byMonthDay: raw.by_month_day ? Number(raw.by_month_day) : null,
      dayRule: (raw.day_rule?.trim() || "calendar_day") as never,
      holidayPolicy: (raw.holiday_policy?.trim() || "none") as never,
      dueOffsetDays: raw.due_offset_days ? Number(raw.due_offset_days) : 0,
      startOffsetDays: raw.start_offset_days ? Number(raw.start_offset_days) : 3,
      dueTime: raw.due_time || null,
      startsOn: parseDate(raw.starts_on) as string,
      endsOn: raw.ends_on ? parseDate(raw.ends_on) : null,
      assignmentMode: raw.assignment_mode.trim() as never,
      fixedAssigneeId: assignee?.id ?? null,
      scopeMode: (raw.scope_mode?.trim() || "single") as never,
      scopeSbuIds: scopeSbuIds ?? null,
      fanOutMode: (raw.fan_out_mode?.trim() || "checklist_per_owner") as never,
      campaignId: campaign?.id ?? null,
    };
    if (row.entityId) {
      await db.update(recurringRules).set(values).where(eq(recurringRules.id, row.entityId));
      updated++;
    } else {
      const [inserted] = await db
        .insert(recurringRules)
        .values({ ruleCode: raw.rule_code.trim(), ...values, createdBy: actorId })
        .returning();
      await db.update(importRows).set({ entityId: inserted.id }).where(eq(importRows.id, row.id));
      created++;
    }
  }
  await db.update(importBatches).set({ summary: { created, updated } }).where(eq(importBatches.id, batchId));
  return { created, updated };
}
