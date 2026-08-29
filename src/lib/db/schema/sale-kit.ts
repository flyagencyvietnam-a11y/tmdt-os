import {
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import { products } from "./products";
import { users } from "./users";

/** SPEC Mục 15 — Sale Enablement. */
export const saleKitCategoryEnum = pgEnum("sale_kit_category", [
  "PRODUCT_INFO",
  "PRICING",
  "SCHEDULE",
  "PROMO",
  "TEMPLATE",
  "SCRIPT",
  "FAQ",
  "OBJECTION",
]);

export const saleKitStatusEnum = pgEnum("sale_kit_status", [
  "DRAFT",
  "APPROVED",
  "ARCHIVED",
]);

export const saleKitItems = pgTable(
  "sale_kit_items",
  {
    id: pkUuid(),
    category: saleKitCategoryEnum("category").notNull(),
    productId: uuid("product_id").references(() => products.id),
    title: text("title").notNull(),
    /** Nội dung dạng markdown/plain — nút sao chép dán thẳng vào Zalo/Messenger. */
    body: text("body"),
    /** Link Canva / Drive cho hình ảnh báo giá, sale kit. */
    linkUrl: text("link_url"),
    /** Quá hạn -> tự ẩn khỏi EC + cảnh báo người phụ trách (SPEC 15.2). */
    validUntil: date("valid_until"),
    /** Chỉ APPROVED mới hiển thị cho EC (SPEC 15.2). */
    status: saleKitStatusEnum("status").notNull().default("DRAFT"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("sale_kit_category_idx").on(t.category),
    index("sale_kit_product_idx").on(t.productId),
    index("sale_kit_status_idx").on(t.status),
  ],
);

export type SaleKitItem = typeof saleKitItems.$inferSelect;
