import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import { campaigns } from "./campaigns";
import {
  disqualifyReasonEnum,
  emsStatusEnum,
  interactionChannelEnum,
  interactionDirectionEnum,
  interactionResultEnum,
  leadOutcomeEnum,
  leadSourceEnum,
  leadStageEnum,
} from "./enums";
import { products } from "./products";
import { users } from "./users";

/** SPEC Mục 7.5. Bảng trung tâm của hệ thống. */
export const leads = pgTable(
  "leads",
  {
    id: pkUuid(),
    /** Mã lead dạng L-2608-0421, sinh tự động, dùng khi trao đổi nội bộ. */
    code: text("code").notNull().unique(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    fullName: text("full_name").notNull(),
    /** Tên đã chuẩn hóa để dò trùng — SPEC Mục 8.3. */
    nameNormalized: text("name_normalized"),
    /** Chuẩn hóa về dạng 0xxxxxxxxx. Có thể NULL. */
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    email: text("email"),
    /** Link hoặc tên page/profile Facebook. */
    fbProfile: text("fb_profile"),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Sản phẩm khách nói, dạng thô. */
    productRaw: text("product_raw"),
    source: leadSourceEnum("source").notNull(),
    /** NULL nếu nguồn organic/referral/hotline. */
    campaignId: uuid("campaign_id").references(() => campaigns.id),

    stage: leadStageEnum("stage").notNull().default("NEW"),
    /** Do hệ thống tính, KHÔNG cho sửa tay. max_stage = GREATEST(cũ, stage mới). */
    maxStage: leadStageEnum("max_stage").notNull().default("NEW"),
    outcome: leadOutcomeEnum("outcome").notNull().default("OPEN"),

    /** E-Commerce Executive phụ trách hiện tại. */
    assignedTo: uuid("assigned_to").references(() => users.id),
    /** QĐ05: người nhận đầu tiên — để tra tranh chấp khi lead chuyển tay. */
    originallyAssignedTo: uuid("originally_assigned_to").references(() => users.id),

    /** "Ngày LH lại" — trường điều phối trung tâm (SPEC Mục 8.2). */
    nextContactDate: date("next_contact_date"),
    /** Số lần khách im lặng liên tiếp — SPEC Mục 8.2. */
    silenceCount: integer("silence_count").notNull().default(0),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),

    /** Mốc quy kết — SPEC Mục 4.3 / 9.3. Báo cáo theo tháng dùng các mốc này. */
    mqlAt: timestamp("mql_at", { withTimezone: true }),
    sqlAt: timestamp("sql_at", { withTimezone: true }),
    wonAt: timestamp("won_at", { withTimezone: true }),

    /** Bắt buộc khi outcome = LOST (>= 10 ký tự) — V03. */
    lostReason: text("lost_reason"),
    disqualifyReason: disqualifyReasonEnum("disqualify_reason"),
    isCold: boolean("is_cold").notNull().default(false),

    /** Ghi chú tư vấn tổng hợp, dạng markdown. */
    consultNote: text("consult_note"),
    placementTestResult: text("placement_test_result"),
    classAssigned: text("class_assigned"),
    preferredSchedule: text("preferred_schedule"),
    desiredStartDate: date("desired_start_date"),

    /** Nếu được xác nhận là trùng — trỏ về bản chính (SPEC Mục 8.3). */
    duplicateOf: uuid("duplicate_of"),

    /** Dữ liệu di chuyển từ sheet — SPEC Mục 19.2 bước 4. */
    migrated: boolean("migrated").notNull().default(false),

    /** Bàn giao DotB EMS (gộp từ tab "Bàn giao EMS" cũ) — SPEC Mục 2.3. */
    emsStatus: emsStatusEnum("ems_status").notNull().default("CHUA"),
    /** Link hồ sơ học viên trên EMS. */
    emsLink: text("ems_link"),

    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("leads_next_contact_outcome_idx").on(t.nextContactDate, t.outcome),
    index("leads_campaign_maxstage_idx").on(t.campaignId, t.maxStage),
    index("leads_assigned_next_idx").on(t.assignedTo, t.nextContactDate),
    index("leads_mql_at_idx").on(t.mqlAt),
    index("leads_won_at_idx").on(t.wonAt),
    index("leads_sql_at_idx").on(t.sqlAt),
    index("leads_name_normalized_idx").on(t.nameNormalized),
    index("leads_phone_normalized_idx").on(t.phoneNormalized),
    index("leads_product_idx").on(t.productId),
  ],
);

/**
 * SPEC Mục 7.6. Nhật ký chăm sóc — điều kiện để quy tắc escalate 5 bước vận hành được.
 */
export const leadInteractions = pgTable(
  "lead_interactions",
  {
    id: pkUuid(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    channel: interactionChannelEnum("channel").notNull(),
    direction: interactionDirectionEnum("direction").notNull(),
    result: interactionResultEnum("result").notNull(),
    content: text("content"),
    /** Ghi nhận tự động khi chuyển giai đoạn kèm interaction. */
    stageBefore: leadStageEnum("stage_before"),
    stageAfter: leadStageEnum("stage_after"),
    nextContactDateSet: date("next_contact_date_set"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_interactions_lead_idx").on(t.leadId),
    index("lead_interactions_occurred_idx").on(t.occurredAt),
  ],
);

/**
 * SPEC Mục 7.7. Ghi mọi lần chuyển giai đoạn. Tách riêng khỏi lead_interactions vì
 * giai đoạn có thể đổi mà không có tương tác (ví dụ hệ thống tự chuyển Cold Data).
 */
export const leadStageHistory = pgTable(
  "lead_stage_history",
  {
    id: pkUuid(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    fromStage: leadStageEnum("from_stage"),
    toStage: leadStageEnum("to_stage"),
    fromOutcome: leadOutcomeEnum("from_outcome"),
    toOutcome: leadOutcomeEnum("to_outcome"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL nếu do hệ thống. */
    changedBy: uuid("changed_by").references(() => users.id),
    reason: text("reason"),
  },
  (t) => [index("lead_stage_history_lead_idx").on(t.leadId)],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadInteraction = typeof leadInteractions.$inferSelect;
export type NewLeadInteraction = typeof leadInteractions.$inferInsert;
export type LeadStageHistory = typeof leadStageHistory.$inferSelect;
