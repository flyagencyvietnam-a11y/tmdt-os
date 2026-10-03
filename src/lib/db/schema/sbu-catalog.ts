import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { sbuCatalogGroupEnum, sbuItemStatusEnum, sbuItemStatusSourceEnum } from "./enums";
import { recurringRules } from "./recurring-rules";
import { sbus } from "./sbus";
import { tasks } from "./tasks";

/** SPEC Mục 4.2 / 9.3 `sbu_catalog_items` — ma trận hạng mục x SBU. */
export const sbuCatalogItems = pgTable("sbu_catalog_items", {
  id: pkUuid(),
  code: text("code").notNull().unique(),
  group: sbuCatalogGroupEnum("group").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  hoPlan: boolean("ho_plan").notNull().default(false),
  hoExecute: boolean("ho_execute").notNull().default(false),
  hoControl: boolean("ho_control").notNull().default(false),
  centerRole: text("center_role"),
  cycle: text("cycle"),
  priority: text("priority"),
  referenceText: text("reference_text"),
  defaultRecurringRuleId: uuid("default_recurring_rule_id").references(
    () => recurringRules.id,
  ),
  ...auditColumns,
});

export const sbuItemStatus = pgTable(
  "sbu_item_status",
  {
    id: pkUuid(),
    catalogItemId: uuid("catalog_item_id")
      .notNull()
      .references(() => sbuCatalogItems.id),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
    /** "2026-10" */
    period: text("period").notNull(),
    status: sbuItemStatusEnum("status").notNull().default("not_started"),
    statusSource: sbuItemStatusSourceEnum("status_source")
      .notNull()
      .default("derived_from_task"),
    taskId: uuid("task_id").references(() => tasks.id),
    note: text("note"),
    ...auditColumns,
  },
  (t) => [
    index("sbu_item_status_period_idx").on(t.period),
    uniqueIndex("sbu_item_status_catalog_sbu_uniq").on(t.catalogItemId, t.sbuId, t.period),
  ],
);

export type SbuCatalogItem = typeof sbuCatalogItems.$inferSelect;
export type SbuItemStatus = typeof sbuItemStatus.$inferSelect;
