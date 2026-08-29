import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import {
  campaignChannelEnum,
  campaignObjectiveEnum,
  campaignStatusEnum,
} from "./enums";
import { products } from "./products";
import { users } from "./users";

/**
 * SPEC Mục 7.3. Bảng thay thế cho khóa văn bản tự do. Mỗi campaign là một thực thể có ID.
 * `internal_code` sinh tự động theo quy ước {PRODUCT}-{CHANNEL}-{OBJECTIVE}-{YYMM}-{SEQ}
 * (SPEC Mục 7.3.1) — không cho sửa tay.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: pkUuid(),
    internalCode: text("internal_code").notNull().unique(),
    displayName: text("display_name").notNull(),
    /** ID campaign trên Meta / Google, ví dụ 120247600089430044. */
    externalId: text("external_id"),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    channel: campaignChannelEnum("channel").notNull(),
    objective: campaignObjectiveEnum("objective"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    status: campaignStatusEnum("status").notNull().default("ON"),
    /** Ngân sách ngày, VND. Campaign chạy ngân sách ngày, không có ngày kết thúc định trước. */
    dailyBudget: bigint("daily_budget", { mode: "number" }),
    startedOn: date("started_on").notNull(),
    /** NULL = chưa kết thúc. Khi status -> OFF, hệ thống ghi ended_on = ngày hiện tại. */
    endedOn: date("ended_on"),
    notes: text("notes"),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("campaigns_product_idx").on(t.productId),
    index("campaigns_status_idx").on(t.status),
    index("campaigns_owner_idx").on(t.ownerId),
  ],
);

/**
 * SPEC Mục 7.4. CHỨA DUY NHẤT số liệu do Marketing Executive nhập tay.
 * KHÔNG có cột MQL/SQL/HV chốt — các số đó luôn tính từ bảng leads.
 */
export const campaignDailyMetrics = pgTable(
  "campaign_daily_metrics",
  {
    id: pkUuid(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    metricDate: date("metric_date").notNull(),
    /** Chi tiêu thực, VND. >= 0 (enforce ở service + check constraint). */
    spend: bigint("spend", { mode: "number" }).notNull(),
    /** Số tin nhắn + đăng ký form. ĐÂY là con số Lead chính thức để báo cáo. >= 0. */
    messages: integer("messages").notNull(),
    enteredBy: uuid("entered_by").references(() => users.id),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Một campaign một ngày chỉ có một dòng — SPEC Mục 7.4.
    unique("campaign_daily_metrics_campaign_date_uq").on(t.campaignId, t.metricDate),
    index("cdm_date_idx").on(t.metricDate),
    check("cdm_spend_nonneg", sql`${t.spend} >= 0`),
    check("cdm_messages_nonneg", sql`${t.messages} >= 0`),
  ],
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignDailyMetric = typeof campaignDailyMetrics.$inferSelect;
export type NewCampaignDailyMetric = typeof campaignDailyMetrics.$inferInsert;
