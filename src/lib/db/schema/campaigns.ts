import { date, index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import { campaignStatusEnum, campaignTypeEnum } from "./enums";
import { brands } from "./brands";
import { sbus } from "./sbus";
import { users } from "./users";

/** SPEC Mục 4.2 `campaigns`. "Action plan" = các `tasks` có `campaign_id` (Mục 4.1). */
export const campaigns = pgTable(
  "campaigns",
  {
    id: pkUuid(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    type: campaignTypeEnum("type").notNull().default("other"),
    tagline: text("tagline"),
    occasion: text("occasion"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: campaignStatusEnum("status").notNull().default("planned"),
    ownerId: uuid("owner_id").references(() => users.id),
    targetAudience: text("target_audience"),
    insightMessage: text("insight_message"),
    objective: text("objective"),
    heroActivity: text("hero_activity"),
    cta: text("cta"),
    channels: text("channels"),
    roleSplit: text("role_split"),
    budgetNote: text("budget_note"),
    kpiNote: text("kpi_note"),
    sourceNote: text("source_note"),
    notes: text("notes"),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("campaigns_status_idx").on(t.status),
    index("campaigns_start_idx").on(t.startDate),
  ],
);

export const campaignBrands = pgTable(
  "campaign_brands",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.brandId] })],
);

/** Campaign phục vụ trung tâm/chi nhánh nào (nhiều-nhiều). Không có dòng nào = campaign toàn hệ thống. */
export const campaignSbus = pgTable(
  "campaign_sbus",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.sbuId] })],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
