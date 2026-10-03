import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Toàn bộ enum hệ thống MKT OS. Xem SPEC `docs/SPEC.md` Mục 3–7.
 */

export const roleEnum = pgEnum("role", [
  "admin",
  "manager",
  "member",
  "center_contributor",
  "viewer",
]);

export const teamEnum = pgEnum("team", ["ho_marketing", "center", "bod", "other"]);

export const sbuKindEnum = pgEnum("sbu_kind", ["center", "online_center", "group"]);
export const sbuRegionEnum = pgEnum("sbu_region", [
  "KV1",
  "KV2",
  "KV3",
  "KV2_KV3",
  "ONLINE",
  "RND",
]);

export const brandKindEnum = pgEnum("brand_kind", ["product", "group"]);

export const foundationStatusEnum = pgEnum("foundation_status", [
  "confirmed",
  "needs_confirmation",
  "proposed",
]);

export const campaignTypeEnum = pgEnum("campaign_type", [
  "brand_theme",
  "product_gtm",
  "business_program",
  "rebrand",
  "data_program",
  "internal_program",
  "other",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "planned",
  "preparing",
  "running",
  "paused",
  "done",
  "cancelled",
  "needs_confirmation",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "campaign_action",
  "content",
  "media",
  "request",
  "monitoring",
  "ads",
  "report",
  "meeting",
  "general",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "urgent",
  "high",
  "medium",
  "low",
]);

export const taskSourceEnum = pgEnum("task_source", [
  "manual",
  "import",
  "recurring",
  "content_item",
  "media_shoot",
  "request",
  "campaign_template",
]);

export const timeSlotEnum = pgEnum("time_slot", ["morning", "afternoon", "all_day"]);

export const dependencyTypeEnum = pgEnum("dependency_type", ["finish_to_start"]);

export const recurringFreqEnum = pgEnum("recurring_freq", [
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

export const dayRuleEnum = pgEnum("day_rule", [
  "calendar_day",
  "last_working_day",
  "first_working_day",
]);

export const holidayPolicyEnum = pgEnum("holiday_policy", [
  "none",
  "shift_earlier",
  "shift_later",
]);

export const assignmentModeEnum = pgEnum("assignment_mode", [
  "fixed_user",
  "sbu_ho_owner",
  "round_robin",
  "unassigned",
]);

export const scopeModeEnum = pgEnum("scope_mode", ["single", "per_sbu"]);

export const fanOutModeEnum = pgEnum("fan_out_mode", [
  "checklist_per_owner",
  "task_per_sbu",
]);

export const completionBehaviorEnum = pgEnum("completion_behavior", [
  "fixed_schedule",
  "after_completion",
]);

export const requestSourceChannelEnum = pgEnum("request_source_channel", [
  "misa",
  "email",
  "zalo",
  "direct",
  "meeting",
  "other",
]);

export const requestTypeEnum = pgEnum("request_type", [
  "design",
  "ads",
  "content",
  "media",
  "posm",
  "event",
  "consulting",
  "other",
]);

export const requestInScopeEnum = pgEnum("request_in_scope", ["yes", "no", "needs_review"]);

export const requestStatusEnum = pgEnum("request_status", [
  "new",
  "accepted",
  "in_progress",
  "in_review",
  "done",
  "rejected",
  "postponed",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "brief",
  "drafting",
  "designing",
  "in_review",
  "approved",
  "published",
  "cancelled",
]);

export const shootStatusEnum = pgEnum("shoot_status", [
  "planned",
  "prepared",
  "shot",
  "editing",
  "done",
  "cancelled",
]);

export const sbuCatalogGroupEnum = pgEnum("sbu_catalog_group", [
  "online_inbound",
  "online_outbound",
  "offline_inbound",
  "offline_outbound",
  "cross",
]);

export const sbuItemStatusEnum = pgEnum("sbu_item_status_value", [
  "not_started",
  "in_progress",
  "done",
  "blocked",
  "not_applicable",
]);

export const sbuItemStatusSourceEnum = pgEnum("sbu_item_status_source", [
  "derived_from_task",
  "manual",
]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "assigned",
  "due_soon",
  "due_today",
  "overdue",
  "escalation",
  "mention",
  "comment",
  "status_change",
  "due_change",
  "assignee_change",
  "blocked",
  "dependency_cleared",
  "request_new",
  "request_due_soon",
  "import_done",
  "digest_daily",
  "digest_weekly",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "email",
  "push",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "EXPORT",
  "IMPORT",
]);

export const importTemplateEnum = pgEnum("import_template", [
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "T7",
  "T8",
  "T9",
]);

export const monitoringKindEnum = pgEnum("monitoring_kind", [
  "posm",
  "signage",
  "ooh",
  "google_maps",
  "vmp_booth",
  "exam_room",
  "other",
]);

export const monitoringAlertEnum = pgEnum("monitoring_alert", [
  "overdue",
  "due_soon",
  "ok",
  "no_data",
]);

export const adsStatusEnum = pgEnum("ads_status", [
  "planned",
  "running",
  "done",
  "cancelled",
]);

/**
 * 6 mảng digital ads thực tế VMG đang report (file VMG_Digital_Tracker —
 * sheet "Tổng hợp", Mục 1-6). b2c_system = Mục 1 (ngân sách hệ thống, không
 * theo SBU); b2c_center = Mục 2 (theo từng trung tâm — NS Trung tâm order +
 * NS P.MKT thêm tách riêng); ecom/b2b/osir/vmp = Mục 3-6, không theo SBU.
 */
export const adsLineEnum = pgEnum("ads_line", [
  "b2c_system",
  "b2c_center",
  "ecom",
  "b2b",
  "osir",
  "vmp",
]);

/** Chu kỳ report ads thực tế: tuần (Thứ 7 → hết Thứ 6, xem reportWeekBounds) hoặc tháng. */
export const adsPeriodTypeEnum = pgEnum("ads_period_type", ["week", "month"]);

export const reportExportKindEnum = pgEnum("report_export_kind", [
  "weekly_summary",
  "monthly_summary",
  "bod_schedule",
]);

export const importRowResultEnum = pgEnum("import_row_result", [
  "created",
  "updated",
  "skipped",
  "error",
  "conflict",
]);

export const savedViewEntityEnum = pgEnum("saved_view_entity", ["tasks"]);
export const savedViewVisibilityEnum = pgEnum("saved_view_visibility", [
  "private",
  "shared",
]);
