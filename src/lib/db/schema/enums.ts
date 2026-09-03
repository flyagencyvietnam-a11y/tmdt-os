import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Toàn bộ enum của hệ thống. Thứ tự khai báo của các stage enum có ý nghĩa:
 * Postgres so sánh enum theo thứ tự khai báo, nên `max_stage >= 'MQL'` chạy đúng ở SQL.
 * Xem SPEC Mục 4.3.
 */

export const roleEnum = pgEnum("role", [
  "ADMIN",
  "MANAGER",
  "MARKETING",
  "EC",
  "VIEWER",
]);

/** Kênh của campaign trả phí — SPEC Mục 7.3 */
export const campaignChannelEnum = pgEnum("campaign_channel", [
  "FB",
  "GOOGLE",
  "TIKTOK",
  "KHAC",
]);

export const campaignObjectiveEnum = pgEnum("campaign_objective", [
  "MESSAGE",
  "LEADFORM",
  "TRAFFIC",
  "KHAC",
]);

export const campaignStatusEnum = pgEnum("campaign_status", ["ON", "OFF", "PAUSED"]);

/** Nguồn của lead — SPEC Mục 4.6. ORGANIC/REFERRAL/HOTLINE không được gán campaign trả phí. */
export const leadSourceEnum = pgEnum("lead_source", [
  "FB",
  "GOOGLE",
  "TIKTOK",
  "ZALO",
  "HOTLINE",
  "ORGANIC",
  "REFERRAL",
  "KHAC",
]);

/** Giai đoạn phễu — thứ tự tăng dần, dùng cho max_stage. SPEC Mục 4.3 / 4.4 */
export const leadStageEnum = pgEnum("lead_stage", [
  "NEW",
  "NO_CONTACT",
  "CONSULTING",
  "MQL",
  "SQL",
  "WON",
]);

/** Kết quả — không có thứ tự. SPEC Mục 4.3 / 4.4 */
export const leadOutcomeEnum = pgEnum("lead_outcome", [
  "OPEN",
  "WON",
  "LOST",
  "DISQUALIFIED",
]);

export const disqualifyReasonEnum = pgEnum("disqualify_reason", [
  "SPAM",
  "WRONG_TARGET",
  "COMPETITOR",
  "DUPLICATE",
  "KHAC",
]);

/** SPEC Mục 7.6 */
export const interactionChannelEnum = pgEnum("interaction_channel", [
  "CALL",
  "ZALO",
  "MESSENGER",
  "EMAIL",
  "SMS",
  "MEET",
]);

export const interactionDirectionEnum = pgEnum("interaction_direction", [
  "OUTBOUND",
  "INBOUND",
]);

export const interactionResultEnum = pgEnum("interaction_result", [
  "RESPONDED",
  "NO_RESPONSE",
  "REFUSED",
  "RESCHEDULED",
]);

/** SPEC Mục 7.9 */
export const taskTypeEnum = pgEnum("task_type", ["PROJECT", "RECURRING", "SYSTEM"]);

export const taskStatusEnum = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
  "CANCELLED",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);

/** SPEC Mục 7.10 */
export const kpiUnitEnum = pgEnum("kpi_unit", ["COUNT", "VND", "PERCENT", "RATIO"]);
export const kpiDirectionEnum = pgEnum("kpi_direction", [
  "HIGHER_BETTER",
  "LOWER_BETTER",
]);
export const kpiSourceEnum = pgEnum("kpi_source", ["AUTO", "MANUAL"]);
export const kpiPeriodTypeEnum = pgEnum("kpi_period_type", ["MONTH", "QUARTER", "YEAR"]);
export const kpiScopeTypeEnum = pgEnum("kpi_scope_type", ["USER", "TEAM", "PRODUCT"]);

/** SPEC Mục 7.11 */
export const savedViewEntityEnum = pgEnum("saved_view_entity", [
  "LEADS",
  "CAMPAIGNS",
  "TASKS",
  "DAILY_METRICS",
  "ENROLLMENTS",
]);
export const savedViewVisibilityEnum = pgEnum("saved_view_visibility", [
  "PRIVATE",
  "SHARED",
]);

/** SPEC Mục 7.12 */
export const auditActionEnum = pgEnum("audit_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "EXPORT",
  "LOCK",
  "UNLOCK",
]);

/** SPEC Mục 7.14 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "OVERDUE_LEADS",
  "CAMPAIGN_ALERT",
  "TASK_DUE",
  "KPI_RISK",
  "DATA_GAP",
  "ASSIGNMENT",
]);
export const notificationSeverityEnum = pgEnum("notification_severity", [
  "INFO",
  "WARNING",
  "CRITICAL",
]);

/** Loại chi phí khác — phục vụ REVENUE_AFTER_MKT (SPEC Mục 14.2, QĐ07) */
export const otherCostTypeEnum = pgEnum("other_cost_type", [
  "KOL_KOC",
  "TOOL",
  "OTHER",
]);

/** Nguồn số liệu ads: nhập tay hay tự kéo từ API (QĐ08 — sẵn sàng cho Phase 4). */
export const metricSourceEnum = pgEnum("metric_source", ["MANUAL", "API"]);

/** Trạng thái bàn giao học viên sang DotB EMS — gộp vào lead (bỏ tab Bàn giao). */
export const emsStatusEnum = pgEnum("ems_status", ["CHUA", "DA_NHAP"]);

/** Thứ hạng giai đoạn để so sánh trong TypeScript (khớp thứ tự enum Postgres). */
export const STAGE_RANK: Record<
  (typeof leadStageEnum.enumValues)[number],
  number
> = {
  NEW: 0,
  NO_CONTACT: 1,
  CONSULTING: 2,
  MQL: 3,
  SQL: 4,
  WON: 5,
};
