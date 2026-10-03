import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { importBatches, importRows, recurringRules, sbuCatalogItems } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import type { ParsedRow } from "./parse";

const GROUPS = new Set(["online_inbound", "online_outbound", "offline_inbound", "offline_outbound", "cross"]);

function parseBool(s: string | undefined): boolean {
  const v = (s ?? "").trim().toLowerCase();
  return v === "x" || v === "true" || v === "1" || v === "yes" || v === "có";
}

export interface T9Row {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  code: string;
  result: "created" | "updated" | "error";
  existingId?: string;
}

/** SPEC Mục 10.4 / Phụ lục B7 — T9 Danh mục hạng mục SBU (sheet CATALOG), khoá `code`. */
export async function validateT9(db: DB, rows: ParsedRow[]): Promise<T9Row[]> {
  const ruleCodes = new Set(
    (await db.select({ ruleCode: recurringRules.ruleCode }).from(recurringRules))
      .map((r) => r.ruleCode)
      .filter((c): c is string => !!c),
  );
  const existing = await db.select({ id: sbuCatalogItems.id, code: sbuCatalogItems.code }).from(sbuCatalogItems);
  const existingByCode = new Map(existing.map((e) => [e.code, e.id]));

  const seen = new Set<string>();
  const out: T9Row[] = [];
  for (const r of rows) {
    const errors: string[] = [];
    const code = r.data.code?.trim();
    const group = r.data.group?.trim();
    const title = r.data.title?.trim();
    const ruleCode = r.data.default_recurring_rule_code?.trim();

    if (!code) errors.push("Thiếu code");
    else if (seen.has(code)) errors.push("code trùng trong file");
    else seen.add(code);
    if (!group || !GROUPS.has(group)) errors.push(`group không hợp lệ: ${group}`);
    if (!title) errors.push("Thiếu title");
    if (ruleCode && !ruleCodes.has(ruleCode)) errors.push(`default_recurring_rule_code không tồn tại: ${ruleCode}`);

    const existingId = code ? existingByCode.get(code) : undefined;
    out.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      code: code ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }
  return out;
}

export async function createPendingBatchT9(db: DB, fileName: string, uploadedBy: string, rows: T9Row[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T9",
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
      sheet: "CATALOG",
      rawData: r.raw,
      result: r.result,
      entityType: "sbu_catalog_item",
      entityId: r.existingId ?? null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

export async function confirmT9Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const allRules = await db.select({ id: recurringRules.id, ruleCode: recurringRules.ruleCode }).from(recurringRules);
  let created = 0;
  let updated = 0;
  for (const row of rows.filter((r) => r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const rule = raw.default_recurring_rule_code ? allRules.find((r) => r.ruleCode === raw.default_recurring_rule_code.trim()) : undefined;
    const values = {
      group: raw.group.trim() as never,
      title: raw.title.trim(),
      description: raw.description || null,
      hoPlan: parseBool(raw.ho_plan),
      hoExecute: parseBool(raw.ho_execute),
      hoControl: parseBool(raw.ho_control),
      centerRole: raw.center_role || null,
      cycle: raw.cycle || null,
      priority: raw.priority || null,
      referenceText: raw.reference_text || null,
      defaultRecurringRuleId: rule?.id ?? null,
    };
    if (row.entityId) {
      await db.update(sbuCatalogItems).set({ ...values, updatedBy: actorId }).where(eq(sbuCatalogItems.id, row.entityId));
      updated++;
    } else {
      const [inserted] = await db
        .insert(sbuCatalogItems)
        .values({ code: raw.code.trim(), ...values, createdBy: actorId })
        .returning();
      await db.update(importRows).set({ entityId: inserted.id }).where(eq(importRows.id, row.id));
      created++;
    }
  }
  await writeAudit(db, { actorId, entity: "sbu_catalog_items", action: "IMPORT", changes: { created, updated } });
  await db.update(importBatches).set({ summary: { created, updated } }).where(eq(importBatches.id, batchId));
  return { created, updated };
}
