import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, pkUuid, softDeleteColumn } from "./_shared";
import { taskPriorityEnum, taskStatusEnum, taskTypeEnum } from "./enums";
import { leads } from "./leads";
import { products } from "./products";
import { users } from "./users";

/** SPEC Mục 7.9 / 13. */
export const tasks = pgTable(
  "tasks",
  {
    id: pkUuid(),
    title: text("title").notNull(),
    description: text("description"),
    /** Nhóm công việc, ví dụ "A. QUY TRÌNH CHUNG". */
    groupCode: text("group_code"),
    productId: uuid("product_id").references(() => products.id),
    type: taskTypeEnum("type").notNull().default("PROJECT"),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    coAssignees: uuid("co_assignees").array(),
    /** Mục tiêu / KPI của đầu việc, dạng chữ. */
    goalKpi: text("goal_kpi"),
    dueDate: date("due_date"),
    status: taskStatusEnum("status").notNull().default("TODO"),
    priority: taskPriorityEnum("priority").notNull().default("NORMAL"),
    progressPct: integer("progress_pct").notNull().default(0),
    /** Chuỗi RRULE nếu type = RECURRING. */
    recurrenceRule: text("recurrence_rule"),
    /** Cho task con sinh từ task định kỳ. */
    parentTaskId: uuid("parent_task_id"),
    /** Lead gắn với việc chăm sóc (type = LEAD_CARE). */
    leadId: uuid("lead_id").references(() => leads.id),
    /** Link tài liệu ngoài (Canva, Drive). */
    linkUrl: text("link_url"),
    /** Bắt buộc khi status = BLOCKED. */
    blockedReason: text("blocked_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Đã lưu trữ (ẩn khỏi bảng Công việc). Chỉ đặt được khi status = DONE. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
    ...softDeleteColumn,
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_status_idx").on(t.status),
    index("tasks_archived_idx").on(t.archivedAt),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_lead_idx").on(t.leadId),
    check("tasks_progress_range", sql`${t.progressPct} between 0 and 100`),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
