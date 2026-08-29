import { and, eq, isNull, or, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { saleKitItems } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

type Category =
  | "PRODUCT_INFO"
  | "PRICING"
  | "SCHEDULE"
  | "PROMO"
  | "TEMPLATE"
  | "SCRIPT"
  | "FAQ"
  | "OBJECTION";

export const SALE_KIT_CATEGORY_LABELS: Record<Category, string> = {
  PRODUCT_INFO: "Thông tin sản phẩm",
  PRICING: "Bảng giá & gói",
  SCHEDULE: "Lịch khai giảng",
  PROMO: "Khuyến mãi",
  TEMPLATE: "Sale kit / template",
  SCRIPT: "Kịch bản tư vấn",
  FAQ: "Câu hỏi thường gặp",
  OBJECTION: "Xử lý phản đối",
};

/**
 * Danh sách cho EC: chỉ APPROVED và chưa quá hạn (SPEC 15.2).
 * Cho MANAGER: tất cả, kèm cờ quá hạn.
 */
export async function listSaleKit(
  db: AnyDb,
  opts: { forEc: boolean; q?: string; productId?: string },
) {
  const today = todayVnDayStr();
  const conds = [isNull(saleKitItems.deletedAt)];
  if (opts.forEc) {
    conds.push(eq(saleKitItems.status, "APPROVED"));
    conds.push(
      or(
        isNull(saleKitItems.validUntil),
        sql`${saleKitItems.validUntil} >= ${today}`,
      )!,
    );
  }
  if (opts.productId) conds.push(eq(saleKitItems.productId, opts.productId));
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    conds.push(
      sql`(lower(${saleKitItems.title}) like ${like} or lower(coalesce(${saleKitItems.body}, '')) like ${like})`,
    );
  }
  const rows = await db
    .select()
    .from(saleKitItems)
    .where(and(...conds))
    .orderBy(saleKitItems.category, saleKitItems.title);
  return rows.map((r) => ({
    ...r,
    expired: !!r.validUntil && r.validUntil < today,
  }));
}

export interface SaleKitInput {
  category: Category;
  productId?: string | null;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  validUntil?: string | null;
}

export async function createSaleKitItem(
  db: AnyDb,
  input: SaleKitInput,
  actor: Actor,
) {
  const [row] = await db
    .insert(saleKitItems)
    .values({
      category: input.category,
      productId: input.productId ?? null,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      linkUrl: input.linkUrl?.trim() || null,
      validUntil: input.validUntil ?? null,
      status: "DRAFT",
      createdBy: actor.id,
      updatedBy: actor.id,
    })
    .returning({ id: saleKitItems.id });
  await writeAudit(db, {
    actorId: actor.id,
    entity: "sale_kit_items",
    entityId: row.id,
    action: "CREATE",
    changes: { title: { from: null, to: input.title } },
  });
  return row;
}

export async function setSaleKitStatus(
  db: AnyDb,
  id: string,
  status: "DRAFT" | "APPROVED" | "ARCHIVED",
  actor: Actor,
) {
  if (!["ADMIN", "MANAGER", "MARKETING"].includes(actor.role))
    throw new ServiceError("Không có quyền duyệt nội dung.", "FORBIDDEN");
  await db
    .update(saleKitItems)
    .set({
      status,
      approvedBy: status === "APPROVED" ? actor.id : null,
      approvedAt: status === "APPROVED" ? new Date() : null,
      updatedBy: actor.id,
    })
    .where(eq(saleKitItems.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "sale_kit_items",
    entityId: id,
    action: "UPDATE",
    changes: { status: { from: null, to: status } },
  });
}

export async function updateSaleKitItem(
  db: AnyDb,
  id: string,
  patch: Partial<SaleKitInput>,
  actor: Actor,
) {
  const set: Partial<typeof saleKitItems.$inferInsert> = { updatedBy: actor.id };
  if (patch.title) set.title = patch.title.trim();
  if (patch.body !== undefined) set.body = patch.body?.trim() || null;
  if (patch.linkUrl !== undefined) set.linkUrl = patch.linkUrl?.trim() || null;
  if (patch.validUntil !== undefined) set.validUntil = patch.validUntil;
  if (patch.category) set.category = patch.category;
  if (patch.productId !== undefined) set.productId = patch.productId;
  await db.update(saleKitItems).set(set).where(eq(saleKitItems.id, id));
}

export async function deleteSaleKitItem(db: AnyDb, id: string, actor: Actor) {
  await db
    .update(saleKitItems)
    .set({ deletedAt: new Date(), updatedBy: actor.id })
    .where(eq(saleKitItems.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "sale_kit_items",
    entityId: id,
    action: "DELETE",
  });
}
