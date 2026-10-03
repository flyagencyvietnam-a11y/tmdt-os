import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brandFoundationEntries, brandFoundationHistory, brands, type BrandFoundationEntry } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { createTask } from "./tasks";
import { ServiceError } from "./errors";

/** SPEC Mục 9.2 — lưới Foundation: cột brand, dòng cấu phần (A1..I2). */
export async function listFoundationGrid(db: DB) {
  const [allBrands, entries] = await Promise.all([
    db.select().from(brands).orderBy(asc(brands.code)),
    db.select().from(brandFoundationEntries).orderBy(asc(brandFoundationEntries.sectionCode), asc(brandFoundationEntries.componentCode)),
  ]);
  return { brands: allBrands, entries };
}

export interface UpsertFoundationInput {
  brandId: string;
  sectionCode: string;
  componentCode: string;
  componentLabel: string;
  content?: string | null;
  status?: BrandFoundationEntry["status"];
}

/** Tạo mới hoặc cập nhật 1 ô (khoá tự nhiên brandId+componentCode) — mỗi lần sửa lưu bản lịch sử (Mục 4.2). */
export async function upsertFoundationEntry(db: DB, input: UpsertFoundationInput, actorId: string | null) {
  const [existing] = await db
    .select()
    .from(brandFoundationEntries)
    .where(
      and(
        eq(brandFoundationEntries.brandId, input.brandId),
        eq(brandFoundationEntries.componentCode, input.componentCode),
      ),
    )
    .limit(1);

  if (existing) {
    await db.insert(brandFoundationHistory).values({
      entryId: existing.id,
      content: existing.content,
      status: existing.status,
      version: existing.version,
      changedBy: actorId,
    });
    const [after] = await db
      .update(brandFoundationEntries)
      .set({
        content: input.content ?? existing.content,
        status: input.status ?? existing.status,
        version: existing.version + 1,
        updatedBy: actorId,
      })
      .where(eq(brandFoundationEntries.id, existing.id))
      .returning();
    await writeAudit(db, { actorId, entity: "brand_foundation_entries", entityId: after.id, action: "UPDATE" });
    return after;
  }

  const [created] = await db
    .insert(brandFoundationEntries)
    .values({
      brandId: input.brandId,
      sectionCode: input.sectionCode,
      componentCode: input.componentCode,
      componentLabel: input.componentLabel,
      content: input.content ?? null,
      status: input.status ?? "needs_confirmation",
      createdBy: actorId,
    })
    .returning();
  await writeAudit(db, { actorId, entity: "brand_foundation_entries", entityId: created.id, action: "CREATE" });
  return created;
}

/** Sửa trực tiếp 1 ô đã có theo id (đường dùng chính từ UI lưới). */
export async function updateFoundationCell(
  db: DB,
  entryId: string,
  patch: { content?: string | null; status?: BrandFoundationEntry["status"] },
  actorId: string | null,
) {
  const [existing] = await db.select().from(brandFoundationEntries).where(eq(brandFoundationEntries.id, entryId)).limit(1);
  if (!existing) throw new ServiceError("Không tìm thấy ô Foundation.", "NOT_FOUND");

  await db.insert(brandFoundationHistory).values({
    entryId: existing.id,
    content: existing.content,
    status: existing.status,
    version: existing.version,
    changedBy: actorId,
  });
  const [after] = await db
    .update(brandFoundationEntries)
    .set({
      content: patch.content !== undefined ? patch.content : existing.content,
      status: patch.status ?? existing.status,
      version: existing.version + 1,
      updatedBy: actorId,
    })
    .where(eq(brandFoundationEntries.id, entryId))
    .returning();
  await writeAudit(db, { actorId, entity: "brand_foundation_entries", entityId: entryId, action: "UPDATE" });
  return after;
}

/** SPEC Mục 9.2 — "Làm rõ ô C1 - VMT": biến 1 ô needs_confirmation thành task cụ thể. */
export async function createTaskFromFoundationCell(db: DB, entryId: string, actorId: string | null) {
  const [entry] = await db.select().from(brandFoundationEntries).where(eq(brandFoundationEntries.id, entryId)).limit(1);
  if (!entry) throw new ServiceError("Không tìm thấy ô Foundation.", "NOT_FOUND");
  const [brand] = await db.select({ code: brands.code }).from(brands).where(eq(brands.id, entry.brandId)).limit(1);

  return createTask(
    db,
    {
      title: `Làm rõ ${entry.componentCode} (${entry.componentLabel}) — ${brand?.code ?? ""}`,
      type: "general",
      brandId: entry.brandId,
      description: entry.content ?? undefined,
      referenceUrl: undefined,
    },
    actorId,
  );
}

export async function entryHistory(db: DB, entryId: string) {
  return db
    .select()
    .from(brandFoundationHistory)
    .where(eq(brandFoundationHistory.entryId, entryId))
    .orderBy(asc(brandFoundationHistory.version));
}
