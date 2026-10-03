import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brands, campaigns, importBatches, importRows, sbus, tasks, users } from "@/lib/db/schema";
import { createTask, updateTask } from "../tasks";
import type { ParsedRow } from "./parse";

export interface T3ValidatedRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  taskKey: string;
  title: string;
  assigneeEmail: string;
  dueDate: string;
  result: "created" | "updated" | "skipped" | "error" | "conflict";
  existingTaskId?: string;
}

const IMPORT_SCOPE = "T3";

function parseDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** SPEC Mục 10.1 bước 2 — kiểm tra từng dòng (Phụ lục B3). Không ghi DB. */
export async function validateT3Rows(db: DB, rows: ParsedRow[]): Promise<T3ValidatedRow[]> {
  const emails = new Set<string>();
  for (const r of rows) if (r.data.assignee_email) emails.add(r.data.assignee_email.toLowerCase());
  const userRows = emails.size
    ? await db.select({ id: users.id, email: users.email }).from(users)
    : [];
  const userByEmail = new Map(userRows.map((u) => [u.email.toLowerCase(), u.id]));

  const existing = await db
    .select({ id: tasks.id, externalKey: tasks.externalKey, manuallyEditedFields: tasks.manuallyEditedFields })
    .from(tasks)
    .where(and(eq(tasks.importScope, IMPORT_SCOPE), isNull(tasks.deletedAt)));
  const existingByKey = new Map(existing.map((t) => [t.externalKey, t]));

  const seenKeys = new Set<string>();
  const out: T3ValidatedRow[] = [];
  for (const r of rows) {
    const errors: string[] = [];
    const taskKey = r.data.task_key?.trim();
    const title = r.data.title?.trim();
    const assigneeEmail = r.data.assignee_email?.trim().toLowerCase();
    const dueDateRaw = r.data.due_date?.trim();
    const dueDate = dueDateRaw ? parseDate(dueDateRaw) : null;

    if (!taskKey) errors.push("Thiếu task_key");
    else if (seenKeys.has(taskKey)) errors.push("task_key trùng trong file");
    else seenKeys.add(taskKey);
    if (!title) errors.push("Thiếu title");
    if (!assigneeEmail) errors.push("Thiếu assignee_email");
    else if (!userByEmail.has(assigneeEmail)) errors.push(`Email không tồn tại: ${assigneeEmail}`);
    if (!dueDateRaw) errors.push("Thiếu due_date");
    else if (!dueDate) errors.push(`due_date sai định dạng (cần dd/mm/yyyy): ${dueDateRaw}`);

    const existingRow = taskKey ? existingByKey.get(taskKey) : undefined;
    let result: T3ValidatedRow["result"] = "created";
    if (errors.length) result = "error";
    else if (existingRow) {
      result = existingRow.manuallyEditedFields?.length ? "conflict" : "updated";
    }

    out.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      taskKey: taskKey ?? "",
      title: title ?? "",
      assigneeEmail: assigneeEmail ?? "",
      dueDate: dueDate ?? "",
      result,
      existingTaskId: existingRow?.id,
    });
  }
  return out;
}

/** SPEC Mục 10.1 bước 1+3 — tạo import_batch ở trạng thái "chờ xác nhận" kèm các dòng đã validate. */
export async function createPendingBatch(db: DB, fileName: string, uploadedBy: string, rows: T3ValidatedRow[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T3",
      fileName,
      uploadedBy,
      createdCount: rows.filter((r) => r.result === "created").length,
      updatedCount: rows.filter((r) => r.result === "updated").length,
      skippedCount: rows.filter((r) => r.result === "conflict").length,
      errorCount: rows.filter((r) => r.result === "error").length,
    })
    .returning();

  await db.insert(importRows).values(
    rows.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: "TASKS",
      rawData: r.raw,
      result: r.result,
      entityType: "task",
      entityId: r.existingTaskId ?? null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

/** SPEC Mục 10.1 bước 4 — ghi thật. Dòng lỗi/xung đột bị bỏ qua (giữ nguyên bản hệ thống). */
export async function confirmT3Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    if (row.result === "error" || row.result === "conflict") continue;
    const raw = row.rawData as Record<string, string>;
    const taskKey = raw.task_key?.trim();
    const assigneeEmail = raw.assignee_email?.trim().toLowerCase();
    const [assignee] = assigneeEmail ? await db.select({ id: users.id }).from(users).where(eq(users.email, assigneeEmail)).limit(1) : [];
    const dueDate = parseDate(raw.due_date ?? "");
    const campaignCode = raw.campaign_code?.trim();
    const [campaign] = campaignCode ? await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.code, campaignCode)).limit(1) : [];
    const brandCode = raw.brand_code?.trim();
    const [brand] = brandCode ? await db.select({ id: brands.id }).from(brands).where(eq(brands.code, brandCode)).limit(1) : [];

    if (row.result === "created") {
      const task = await createTask(
        db,
        {
          title: raw.title,
          description: raw.description || null,
          assigneeId: assignee?.id ?? null,
          startDate: raw.start_date ? parseDate(raw.start_date) : null,
          dueDate,
          priority: (raw.priority?.trim() as never) || undefined,
          campaignId: campaign?.id ?? null,
          brandId: brand?.id ?? null,
          channel: raw.channel || null,
          referenceUrl: raw.reference_url || null,
          externalKey: taskKey,
          importScope: IMPORT_SCOPE,
          importBatchId: batchId,
          sourceType: "import",
          checklist: raw.checklist ? raw.checklist.split(";").map((s) => s.trim()).filter(Boolean) : undefined,
          sbuIds: raw.sbu_codes
            ? await resolveSbuIds(db, raw.sbu_codes)
            : undefined,
        },
        actorId,
      );
      await db.update(importRows).set({ entityId: task.id }).where(eq(importRows.id, row.id));
      created++;
    } else if (row.result === "updated" && row.entityId) {
      await updateTask(
        db,
        row.entityId,
        {
          title: raw.title,
          description: raw.description || null,
          dueDate,
          priority: (raw.priority?.trim() as never) || undefined,
          campaignId: campaign?.id ?? null,
          channel: raw.channel || null,
        },
        actorId,
        { trackManualEdit: false },
      );
      updated++;
    }
  }
  await db.update(importBatches).set({ summary: { created, updated } }).where(eq(importBatches.id, batchId));
  return { created, updated };
}

async function resolveSbuIds(db: DB, codes: string): Promise<string[]> {
  if (codes.trim().toUpperCase() === "ALL") {
    const all = await db.select({ id: sbus.id }).from(sbus);
    return all.map((s) => s.id);
  }
  const list = codes.split(";").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return [];
  const rows = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  const set = new Set(list);
  return rows.filter((r) => set.has(r.code)).map((r) => r.id);
}

/** Hoàn tác cả đợt trong 72h (Mục 10.1) — chỉ xoá mềm bản ghi do chính batch này tạo. */
export async function undoImportBatch(db: DB, batchId: string, actorId: string) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new Error("Không tìm thấy batch.");
  const hoursSince = (Date.now() - batch.createdAt.getTime()) / 3_600_000;
  if (hoursSince > 72) throw new Error("Đã quá 72 giờ, không thể hoàn tác.");

  const createdRows = await db.select().from(tasks).where(and(eq(tasks.importBatchId, batchId), isNull(tasks.deletedAt)));
  for (const t of createdRows) {
    if (t.manuallyEditedFields?.length) continue; // đã bị sửa tay sau đó — không đụng vào
    await db.update(tasks).set({ deletedAt: new Date(), updatedBy: actorId }).where(eq(tasks.id, t.id));
  }
  await db.update(importBatches).set({ undoneAt: new Date() }).where(eq(importBatches.id, batchId));
  return { undone: createdRows.length };
}
