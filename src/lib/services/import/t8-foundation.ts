import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brands, importBatches, importRows } from "@/lib/db/schema";
import { upsertFoundationEntry } from "../foundation";
import type { ParsedRow } from "./parse";

const FOUNDATION_STATUSES = new Set(["confirmed", "needs_confirmation", "proposed"]);

export interface T8Row {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  key: string;
  result: "created" | "updated" | "error";
}

/** SPEC Mục 10.4 / Phụ lục B7 — T8 Foundation (sheet FOUNDATION), khoá tự nhiên brand_code+component_code. */
export async function validateT8(db: DB, rows: ParsedRow[]): Promise<T8Row[]> {
  const brandCodes = new Set((await db.select({ code: brands.code }).from(brands)).map((b) => b.code));
  const seen = new Set<string>();
  const out: T8Row[] = [];
  for (const r of rows) {
    const errors: string[] = [];
    const brandCode = r.data.brand_code?.trim();
    const sectionCode = r.data.section_code?.trim();
    const componentCode = r.data.component_code?.trim();
    const componentLabel = r.data.component_label?.trim();
    const status = r.data.status?.trim().toLowerCase();
    const key = `${brandCode}::${componentCode}`;

    if (!brandCode) errors.push("Thiếu brand_code");
    else if (!brandCodes.has(brandCode)) errors.push(`brand_code không tồn tại: ${brandCode}`);
    if (!sectionCode) errors.push("Thiếu section_code");
    if (!componentCode) errors.push("Thiếu component_code");
    else if (seen.has(key)) errors.push("brand_code+component_code trùng trong file");
    else seen.add(key);
    if (!componentLabel) errors.push("Thiếu component_label");
    if (status && !FOUNDATION_STATUSES.has(status)) errors.push(`status không hợp lệ: ${status}`);

    out.push({ rowNumber: r.rowNumber, raw: r.data, errors, key, result: errors.length ? "error" : "created" });
  }
  return out;
}

export async function createPendingBatchT8(db: DB, fileName: string, uploadedBy: string, rows: T8Row[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T8",
      fileName,
      uploadedBy,
      createdCount: rows.filter((r) => r.result !== "error").length,
      errorCount: rows.filter((r) => r.result === "error").length,
    })
    .returning();
  await db.insert(importRows).values(
    rows.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: "FOUNDATION",
      rawData: r.raw,
      result: r.result,
      entityType: "brand_foundation_entry",
      entityId: null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

export async function confirmT8Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const allBrands = await db.select({ id: brands.id, code: brands.code }).from(brands);
  let count = 0;
  for (const row of rows.filter((r) => r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const brand = allBrands.find((b) => b.code === raw.brand_code.trim());
    if (!brand) continue;
    const entry = await upsertFoundationEntry(
      db,
      {
        brandId: brand.id,
        sectionCode: raw.section_code.trim(),
        componentCode: raw.component_code.trim(),
        componentLabel: raw.component_label.trim(),
        content: raw.content || null,
        status: (raw.status?.trim().toLowerCase() as never) || undefined,
      },
      actorId,
    );
    await db.update(importRows).set({ entityId: entry.id }).where(eq(importRows.id, row.id));
    count++;
  }
  await db.update(importBatches).set({ summary: { count } }).where(eq(importBatches.id, batchId));
  return { count };
}
