import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  brands,
  campaignBrands,
  campaigns,
  importBatches,
  importRows,
  sbus,
  taskDependencies,
  tasks,
  users,
} from "@/lib/db/schema";
import { createTask, updateTask } from "../tasks";
import type { ParsedRow } from "./parse";

const CAMPAIGN_TYPES = new Set([
  "brand_theme",
  "product_gtm",
  "business_program",
  "rebrand",
  "data_program",
  "internal_program",
  "other",
]);

export interface T1CampaignRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  campaignCode: string;
  result: "created" | "updated" | "error";
  existingId?: string;
}

export interface T1ActionRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  campaignCode: string;
  actionCode: string;
  title: string;
  result: "created" | "updated" | "conflict" | "error";
  existingTaskId?: string;
}

function parseDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function splitList(s: string | undefined): string[] {
  return (s ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function validateT1(
  db: DB,
  campaignRows: ParsedRow[],
  actionRows: ParsedRow[],
): Promise<{ campaigns: T1CampaignRow[]; actions: T1ActionRow[] }> {
  const existingCampaigns = await db.select({ id: campaigns.id, code: campaigns.code }).from(campaigns);
  const campaignIdByCode = new Map(existingCampaigns.map((c) => [c.code, c.id]));

  const allBrands = await db.select({ code: brands.code }).from(brands);
  const brandCodes = new Set(allBrands.map((b) => b.code));

  const allUsers = await db.select({ email: users.email }).from(users);
  const userEmails = new Set(allUsers.map((u) => u.email.toLowerCase()));

  const seenCampaignCodes = new Set<string>();
  const outCampaigns: T1CampaignRow[] = [];
  for (const r of campaignRows) {
    const errors: string[] = [];
    const campaignCode = r.data.campaign_code?.trim();
    const name = r.data.name?.trim();
    const type = r.data.type?.trim() || "other";
    const startDate = parseDate(r.data.start_date ?? "");
    const endDate = parseDate(r.data.end_date ?? "");

    if (!campaignCode) errors.push("Thiếu campaign_code");
    else if (seenCampaignCodes.has(campaignCode)) errors.push("campaign_code trùng trong file");
    else seenCampaignCodes.add(campaignCode);
    if (!name) errors.push("Thiếu name");
    if (!CAMPAIGN_TYPES.has(type)) errors.push(`type không hợp lệ: ${type}`);
    if (!r.data.start_date) errors.push("Thiếu start_date");
    else if (!startDate) errors.push(`start_date sai định dạng: ${r.data.start_date}`);
    if (!r.data.end_date) errors.push("Thiếu end_date");
    else if (!endDate) errors.push(`end_date sai định dạng: ${r.data.end_date}`);
    if (startDate && endDate && endDate < startDate) errors.push("end_date trước start_date");
    for (const bc of splitList(r.data.brand_codes)) {
      if (!brandCodes.has(bc)) errors.push(`brand_code không tồn tại: ${bc}`);
    }
    if (r.data.owner_email && !userEmails.has(r.data.owner_email.toLowerCase())) {
      errors.push(`owner_email không tồn tại: ${r.data.owner_email}`);
    }

    const existingId = campaignCode ? campaignIdByCode.get(campaignCode) : undefined;
    outCampaigns.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      campaignCode: campaignCode ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }

  const campaignCodesInFile = new Set(outCampaigns.filter((c) => c.result !== "error").map((c) => c.campaignCode));
  const allSbus = await db.select({ code: sbus.code }).from(sbus);
  const sbuCodes = new Set(allSbus.map((s) => s.code));

  const seenActionKeys = new Set<string>();
  const actionCodesByCampaign = new Map<string, Set<string>>();
  for (const r of actionRows) {
    const campaignCode = r.data.campaign_code?.trim() ?? "";
    const actionCode = r.data.action_code?.trim() ?? "";
    if (!actionCodesByCampaign.has(campaignCode)) actionCodesByCampaign.set(campaignCode, new Set());
    if (actionCode) actionCodesByCampaign.get(campaignCode)!.add(actionCode);
  }

  const existingTasksByKey = new Map(
    (
      await db
        .select({ id: tasks.id, externalKey: tasks.externalKey, importScope: tasks.importScope, manuallyEditedFields: tasks.manuallyEditedFields })
        .from(tasks)
        .where(isNull(tasks.deletedAt))
    ).map((t) => [`${t.importScope}:${t.externalKey}`, t]),
  );

  const outActions: T1ActionRow[] = [];
  for (const r of actionRows) {
    const errors: string[] = [];
    const campaignCode = r.data.campaign_code?.trim();
    const actionCode = r.data.action_code?.trim();
    const title = r.data.title?.trim();
    const assigneeEmail = r.data.assignee_email?.trim().toLowerCase();
    const dueDate = parseDate(r.data.due_date ?? "");
    const key = `${campaignCode}::${actionCode}`;

    if (!campaignCode) errors.push("Thiếu campaign_code");
    else if (!campaignCodesInFile.has(campaignCode) && !campaignIdByCode.has(campaignCode)) {
      errors.push(`campaign_code không có trong sheet CAMPAIGN hoặc hệ thống: ${campaignCode}`);
    }
    if (!actionCode) errors.push("Thiếu action_code");
    else if (seenActionKeys.has(key)) errors.push("action_code trùng trong phạm vi campaign");
    else seenActionKeys.add(key);
    if (!title) errors.push("Thiếu title");
    if (!assigneeEmail) errors.push("Thiếu assignee_email");
    else if (!userEmails.has(assigneeEmail)) errors.push(`assignee_email không tồn tại: ${assigneeEmail}`);
    if (!r.data.due_date) errors.push("Thiếu due_date");
    else if (!dueDate) errors.push(`due_date sai định dạng: ${r.data.due_date}`);
    for (const sc of splitList(r.data.sbu_codes)) {
      if (sc !== "ALL" && !sbuCodes.has(sc)) errors.push(`sbu_code không tồn tại: ${sc}`);
    }
    const parent = r.data.parent_action_code?.trim();
    if (parent && !actionCodesByCampaign.get(campaignCode ?? "")?.has(parent)) {
      errors.push(`parent_action_code không có trong cùng campaign: ${parent}`);
    }
    for (const dep of splitList(r.data.depends_on)) {
      if (!actionCodesByCampaign.get(campaignCode ?? "")?.has(dep)) {
        errors.push(`depends_on không có trong cùng campaign: ${dep}`);
      }
    }

    const importScope = `T1:${campaignCode}`;
    const existing = actionCode ? existingTasksByKey.get(`${importScope}:${actionCode}`) : undefined;
    let result: T1ActionRow["result"] = "created";
    if (errors.length) result = "error";
    else if (existing) result = existing.manuallyEditedFields?.length ? "conflict" : "updated";

    outActions.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      campaignCode: campaignCode ?? "",
      actionCode: actionCode ?? "",
      title: title ?? "",
      result,
      existingTaskId: existing?.id,
    });
  }

  return { campaigns: outCampaigns, actions: outActions };
}

export async function createPendingBatchT1(
  db: DB,
  fileName: string,
  uploadedBy: string,
  data: { campaigns: T1CampaignRow[]; actions: T1ActionRow[] },
) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T1",
      fileName,
      uploadedBy,
      createdCount: data.campaigns.filter((c) => c.result === "created").length + data.actions.filter((a) => a.result === "created").length,
      updatedCount: data.campaigns.filter((c) => c.result === "updated").length + data.actions.filter((a) => a.result === "updated").length,
      skippedCount: data.actions.filter((a) => a.result === "conflict").length,
      errorCount: data.campaigns.filter((c) => c.result === "error").length + data.actions.filter((a) => a.result === "error").length,
    })
    .returning();

  await db.insert(importRows).values([
    ...data.campaigns.map((c) => ({
      batchId: batch.id,
      rowNumber: c.rowNumber,
      sheet: "CAMPAIGN",
      rawData: c.raw,
      result: c.result,
      entityType: "campaign",
      entityId: c.existingId ?? null,
      message: c.errors.join("; ") || null,
    })),
    ...data.actions.map((a) => ({
      batchId: batch.id,
      rowNumber: a.rowNumber,
      sheet: "ACTIONS",
      rawData: a.raw,
      result: a.result,
      entityType: "task",
      entityId: a.existingTaskId ?? null,
      message: a.errors.join("; ") || null,
    })),
  ]);
  return batch;
}

export async function confirmT1Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const campaignRows = rows.filter((r) => r.sheet === "CAMPAIGN" && r.result !== "error");
  const actionRows = rows.filter((r) => r.sheet === "ACTIONS" && r.result !== "error" && r.result !== "conflict");

  const campaignIdByCode = new Map<string, string>();
  let campaignsCreated = 0;
  let campaignsUpdated = 0;
  for (const row of campaignRows) {
    const raw = row.rawData as Record<string, string>;
    const code = raw.campaign_code.trim();
    const [owner] = raw.owner_email
      ? await db.select({ id: users.id }).from(users).where(eq(users.email, raw.owner_email.trim().toLowerCase())).limit(1)
      : [];
    const values = {
      name: raw.name,
      type: (raw.type?.trim() || "other") as never,
      startDate: parseDate(raw.start_date) as string,
      endDate: parseDate(raw.end_date) as string,
      status: (raw.status?.trim() || undefined) as never,
      ownerId: owner?.id ?? null,
      tagline: raw.tagline || null,
      occasion: raw.occasion || null,
      targetAudience: raw.target_audience || null,
      insightMessage: raw.insight_message || null,
      objective: raw.objective || null,
      heroActivity: raw.hero_activity || null,
      cta: raw.cta || null,
      channels: raw.channels || null,
      roleSplit: raw.role_split || null,
      budgetNote: raw.budget_note || null,
      kpiNote: raw.kpi_note || null,
      notes: raw.notes || null,
    };
    let campaignId: string;
    if (row.entityId) {
      await db.update(campaigns).set({ ...values, updatedBy: actorId }).where(eq(campaigns.id, row.entityId));
      campaignId = row.entityId;
      campaignsUpdated++;
    } else {
      const [created] = await db.insert(campaigns).values({ code, ...values, createdBy: actorId }).returning();
      campaignId = created.id;
      campaignsCreated++;
    }
    campaignIdByCode.set(code, campaignId);
    await db.update(importRows).set({ entityId: campaignId }).where(eq(importRows.id, row.id));

    const brandCodes = splitList(raw.brand_codes);
    await db.delete(campaignBrands).where(eq(campaignBrands.campaignId, campaignId));
    if (brandCodes.length) {
      const brandRows = await db.select({ id: brands.id, code: brands.code }).from(brands);
      const ids = brandRows.filter((b) => brandCodes.includes(b.code)).map((b) => b.id);
      if (ids.length) await db.insert(campaignBrands).values(ids.map((brandId) => ({ campaignId, brandId })));
    }
  }

  // campaign_code có thể đã tồn tại sẵn trong hệ thống (không nằm trong sheet CAMPAIGN của file này).
  for (const row of actionRows) {
    const raw = row.rawData as Record<string, string>;
    const code = raw.campaign_code.trim();
    if (!campaignIdByCode.has(code)) {
      const [existing] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.code, code)).limit(1);
      if (existing) campaignIdByCode.set(code, existing.id);
    }
  }

  const taskIdByKey = new Map<string, string>();
  let actionsCreated = 0;
  let actionsUpdated = 0;
  for (const row of actionRows) {
    const raw = row.rawData as Record<string, string>;
    const campaignCode = raw.campaign_code.trim();
    const actionCode = raw.action_code.trim();
    const campaignId = campaignIdByCode.get(campaignCode) ?? null;
    const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.email, raw.assignee_email.trim().toLowerCase())).limit(1);
    const importScope = `T1:${campaignCode}`;
    const sbuIds = raw.sbu_codes ? await resolveSbuIds(db, raw.sbu_codes) : undefined;
    const checklist = raw.checklist ? splitList(raw.checklist) : undefined;

    let taskId: string;
    if (row.entityId) {
      await updateTask(
        db,
        row.entityId,
        {
          title: raw.title,
          description: raw.description || null,
          assigneeId: assignee?.id ?? null,
          startDate: raw.start_date ? parseDate(raw.start_date) : null,
          dueDate: parseDate(raw.due_date),
          priority: (raw.priority?.trim() as never) || undefined,
          campaignId,
          workstream: raw.workstream || null,
          channel: raw.channel || null,
          referenceUrl: raw.reference_url || null,
        },
        actorId,
        { trackManualEdit: false },
      );
      taskId = row.entityId;
      actionsUpdated++;
    } else {
      const task = await createTask(
        db,
        {
          title: raw.title,
          description: raw.description || null,
          type: (raw.type?.trim() || "campaign_action") as never,
          priority: (raw.priority?.trim() as never) || undefined,
          assigneeId: assignee?.id ?? null,
          startDate: raw.start_date ? parseDate(raw.start_date) : null,
          dueDate: parseDate(raw.due_date),
          campaignId,
          workstream: raw.workstream || null,
          channel: raw.channel || null,
          referenceUrl: raw.reference_url || null,
          isMilestone: raw.is_milestone?.trim().toLowerCase() === "x",
          externalKey: actionCode,
          importScope,
          importBatchId: batchId,
          sourceType: "import",
          sbuIds,
          checklist,
          collaboratorIds: await resolveUserIds(db, raw.collaborator_emails),
        },
        actorId,
      );
      taskId = task.id;
      actionsCreated++;
    }
    taskIdByKey.set(`${campaignCode}::${actionCode}`, taskId);
    await db.update(importRows).set({ entityId: taskId }).where(eq(importRows.id, row.id));
  }

  // Pass 2: parent_id + task_dependencies (cần toàn bộ action đã có task_id).
  for (const row of actionRows) {
    const raw = row.rawData as Record<string, string>;
    const campaignCode = raw.campaign_code.trim();
    const actionCode = raw.action_code.trim();
    const taskId = taskIdByKey.get(`${campaignCode}::${actionCode}`);
    if (!taskId) continue;

    const parent = raw.parent_action_code?.trim();
    if (parent) {
      const parentId = taskIdByKey.get(`${campaignCode}::${parent}`);
      if (parentId) await db.update(tasks).set({ parentId }).where(eq(tasks.id, taskId));
    }
    for (const dep of splitList(raw.depends_on)) {
      const predecessorId = taskIdByKey.get(`${campaignCode}::${dep}`);
      if (predecessorId) {
        await db
          .insert(taskDependencies)
          .values({ predecessorId, successorId: taskId })
          .onConflictDoNothing();
      }
    }
  }

  await db
    .update(importBatches)
    .set({ summary: { campaignsCreated, campaignsUpdated, actionsCreated, actionsUpdated } })
    .where(eq(importBatches.id, batchId));
  return { campaignsCreated, campaignsUpdated, actionsCreated, actionsUpdated };
}

async function resolveSbuIds(db: DB, codes: string): Promise<string[]> {
  if (codes.trim().toUpperCase() === "ALL") {
    const all = await db.select({ id: sbus.id }).from(sbus);
    return all.map((s) => s.id);
  }
  const list = splitList(codes);
  if (!list.length) return [];
  const rows = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  const set = new Set(list);
  return rows.filter((r) => set.has(r.code)).map((r) => r.id);
}

async function resolveUserIds(db: DB, emails: string | undefined): Promise<string[]> {
  const list = splitList(emails).map((e) => e.toLowerCase());
  if (!list.length) return [];
  const rows = await db.select({ id: users.id, email: users.email }).from(users);
  const set = new Set(list);
  return rows.filter((r) => set.has(r.email.toLowerCase())).map((r) => r.id);
}

/** Hoàn tác đợt T1 trong 72h — chỉ xoá mềm task do chính batch tạo; campaign giữ nguyên (không xoá kế hoạch). */
export async function undoT1Batch(db: DB, batchId: string, actorId: string) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("Không tìm thấy batch.");
  const hoursSince = (Date.now() - batch.createdAt.getTime()) / 3_600_000;
  if (hoursSince > 72) throw new Error("Đã quá 72 giờ, không thể hoàn tác.");

  const createdTasks = await db.select().from(tasks).where(and(eq(tasks.importBatchId, batchId), isNull(tasks.deletedAt)));
  let undone = 0;
  for (const t of createdTasks) {
    if (t.manuallyEditedFields?.length) continue;
    await db.update(tasks).set({ deletedAt: new Date(), updatedBy: actorId }).where(eq(tasks.id, t.id));
    undone++;
  }
  await db.update(importBatches).set({ undoneAt: new Date() }).where(eq(importBatches.id, batchId));
  return { undone };
}
