import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { importBatches, importRows, requests, sbus } from "@/lib/db/schema";
import { nextRequestCode } from "../codes";
import type { ParsedRow } from "./parse";

const IMPORT_SCOPE = "T5";
const SOURCE_CHANNELS = new Set(["misa", "email", "zalo", "direct", "meeting", "other"]);
const REQUEST_TYPES = new Set(["design", "ads", "content", "media", "posm", "event", "consulting", "other"]);

function parseDate(s: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export interface T5Row {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  requestKey: string;
  result: "created" | "updated" | "skipped" | "error" | "conflict";
  existingId?: string;
}

/** SPEC Mục 10.1/10.4 — T5 Request hàng loạt (Phase 2), sheet REQUESTS. */
export async function validateT5(db: DB, rows: ParsedRow[]): Promise<T5Row[]> {
  const allSbus = await db.select({ code: sbus.code }).from(sbus);
  const sbuCodes = new Set(allSbus.map((s) => s.code));
  const existing = await db
    .select({ id: requests.id, externalKey: requests.externalKey })
    .from(requests)
    .where(and(eq(requests.importScope, IMPORT_SCOPE), isNull(requests.deletedAt)));
  const existingByKey = new Map(existing.map((r) => [r.externalKey, r.id]));

  const seen = new Set<string>();
  const out: T5Row[] = [];
  for (const r of rows) {
    const errors: string[] = [];
    const requestKey = r.data.request_key?.trim();
    const receivedDate = parseDate(r.data.received_date);
    const requesterName = r.data.requester_name?.trim();
    const description = r.data.description?.trim();
    const sourceChannel = r.data.source_channel?.trim().toLowerCase();
    const requestType = r.data.request_type?.trim().toLowerCase();
    const sbuCode = r.data.requester_sbu_code?.trim();

    if (!requestKey) errors.push("Thiếu request_key");
    else if (seen.has(requestKey)) errors.push("request_key trùng trong file");
    else seen.add(requestKey);
    if (!r.data.received_date) errors.push("Thiếu received_date");
    else if (!receivedDate) errors.push(`received_date sai định dạng: ${r.data.received_date}`);
    if (!requesterName) errors.push("Thiếu requester_name");
    if (!description) errors.push("Thiếu description");
    if (sourceChannel && !SOURCE_CHANNELS.has(sourceChannel)) errors.push(`source_channel không hợp lệ: ${sourceChannel}`);
    if (requestType && !REQUEST_TYPES.has(requestType)) errors.push(`request_type không hợp lệ: ${requestType}`);
    if (sbuCode && !sbuCodes.has(sbuCode)) errors.push(`requester_sbu_code không tồn tại: ${sbuCode}`);

    const existingId = requestKey ? existingByKey.get(requestKey) : undefined;
    out.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      requestKey: requestKey ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }
  return out;
}

export async function createPendingBatchT5(db: DB, fileName: string, uploadedBy: string, rows: T5Row[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T5",
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
      sheet: "REQUESTS",
      rawData: r.raw,
      result: r.result,
      entityType: "request",
      entityId: r.existingId ?? null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

export async function confirmT5Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const allSbus = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  let created = 0;
  let updated = 0;
  for (const row of rows.filter((r) => r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const sbu = raw.requester_sbu_code ? allSbus.find((s) => s.code === raw.requester_sbu_code.trim()) : undefined;
    const values = {
      receivedDate: parseDate(raw.received_date) as string,
      sourceChannel: (raw.source_channel?.trim().toLowerCase() || "other") as never,
      requesterName: raw.requester_name.trim(),
      requesterSbuId: sbu?.id ?? null,
      requestType: (raw.request_type?.trim().toLowerCase() || "other") as never,
      description: raw.description.trim(),
      referenceUrl: raw.reference_url || null,
      priority: raw.priority || null,
      desiredDate: raw.desired_date ? parseDate(raw.desired_date) : null,
    };
    if (row.entityId) {
      await db.update(requests).set({ ...values, updatedBy: actorId }).where(eq(requests.id, row.entityId));
      updated++;
    } else {
      const code = await nextRequestCode(db);
      const [inserted] = await db
        .insert(requests)
        .values({ code, ...values, externalKey: raw.request_key.trim(), importScope: IMPORT_SCOPE, createdBy: actorId })
        .returning();
      await db.update(importRows).set({ entityId: inserted.id }).where(eq(importRows.id, row.id));
      created++;
    }
  }
  await db.update(importBatches).set({ summary: { created, updated } }).where(eq(importBatches.id, batchId));
  return { created, updated };
}
