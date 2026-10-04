import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import {
  taskPriorityEnum,
  taskSourceEnum,
  taskStatusEnum,
  taskTypeEnum,
  timeSlotEnum,
} from "./enums";
import { brands } from "./brands";
import { campaigns } from "./campaigns";
import { importBatches } from "./system";
import { recurringRules } from "./recurring-rules";
import { users } from "./users";

/**
 * SPEC Mục 4.2 / Phụ lục A `tasks` — thực thể trung tâm của MKT OS.
 * `overdue` KHÔNG lưu cột — luôn suy ra ở tầng truy vấn (Mục 4.2):
 *   overdue = status NOT IN (done,cancelled) AND (due_date < hôm nay
 *             OR (due_date = hôm nay AND due_time < bây giờ))
 */
export const tasks = pgTable(
  "tasks",
  {
    id: pkUuid(),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    type: taskTypeEnum("type").notNull().default("general"),
    status: taskStatusEnum("status").notNull().default("todo"),
    blockedReason: text("blocked_reason"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    creatorId: uuid("creator_id").references(() => users.id),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    dueTime: time("due_time"),
    timeSlot: timeSlotEnum("time_slot"),
    estimateHours: numeric("estimate_hours", { precision: 6, scale: 2 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Tự lưu trữ task đã xong/huỷ quá lâu (job archive-old-tasks) — ẩn khỏi danh sách mặc định, vẫn tra cứu ở view "Lưu trữ" và vẫn tính vào báo cáo. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    parentId: uuid("parent_id"),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    brandId: uuid("brand_id").references(() => brands.id),
    workstream: text("workstream"),
    channel: text("channel"),
    deliverableUrl: text("deliverable_url"),
    referenceUrl: text("reference_url"),
    isMilestone: boolean("is_milestone").notNull().default(false),
    sourceType: taskSourceEnum("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id),
    occurrenceDate: date("occurrence_date"),
    /** sbu_id (task_per_sbu) hoặc owner_id (checklist_per_owner) khi sinh từ recurring. */
    scopeKey: text("scope_key"),
    externalKey: text("external_key"),
    importScope: text("import_scope"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    manuallyEditedFields: text("manually_edited_fields").array().notNull().default([]),
    sortOrder: numeric("sort_order").notNull().default("0"),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    uniqueIndex("tasks_recurring_uniq")
      .on(t.recurringRuleId, t.occurrenceDate, sql`coalesce(${t.scopeKey}, '')`)
      .where(sql`${t.recurringRuleId} is not null and ${t.deletedAt} is null`),
    uniqueIndex("tasks_import_uniq")
      .on(t.importScope, t.externalKey)
      .where(sql`${t.externalKey} is not null and ${t.deletedAt} is null`),
    index("tasks_assignee_due_idx").on(t.assigneeId, t.dueDate),
    index("tasks_campaign_idx").on(t.campaignId),
    index("tasks_status_idx").on(t.status),
    index("tasks_archived_idx").on(t.archivedAt),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_source_idx").on(t.sourceType, t.sourceId),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
