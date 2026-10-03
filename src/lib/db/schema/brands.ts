import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { brandKindEnum, foundationStatusEnum } from "./enums";
import { users } from "./users";

/** SPEC Mục 4.2 `brands`. */
export const brands = pgTable("brands", {
  id: pkUuid(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: brandKindEnum("kind").notNull().default("product"),
  color: text("color"),
  /** VMT: false cho đến khi có quyết định rebrand — SPEC Mục 4.2. */
  publicNameAllowed: boolean("public_name_allowed").notNull().default(true),
  ...auditColumns,
});

/**
 * SPEC Mục 4.2 / 9.2 `brand_foundation_entries` — lưới Foundation (Phase 2 UI,
 * bảng tạo sẵn ở Phase 0 để có FK ổn định cho "tạo task từ 1 ô").
 */
export const brandFoundationEntries = pgTable(
  "brand_foundation_entries",
  {
    id: pkUuid(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    /** A..I */
    sectionCode: text("section_code").notNull(),
    /** A1, B1, C1... */
    componentCode: text("component_code").notNull(),
    componentLabel: text("component_label").notNull(),
    content: text("content"),
    status: foundationStatusEnum("status").notNull().default("needs_confirmation"),
    version: integer("version").notNull().default(1),
    ...auditColumns,
  },
  (t) => [
    index("brand_foundation_brand_idx").on(t.brandId),
    index("brand_foundation_component_idx").on(t.brandId, t.componentCode),
  ],
);

export const brandFoundationHistory = pgTable(
  "brand_foundation_history",
  {
    id: pkUuid(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => brandFoundationEntries.id),
    content: text("content"),
    status: foundationStatusEnum("status").notNull(),
    version: integer("version").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    ...auditColumns,
  },
  (t) => [index("brand_foundation_history_entry_idx").on(t.entryId)],
);

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;
export type BrandFoundationEntry = typeof brandFoundationEntries.$inferSelect;
