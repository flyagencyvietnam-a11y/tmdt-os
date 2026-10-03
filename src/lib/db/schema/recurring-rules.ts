import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import {
  assignmentModeEnum,
  completionBehaviorEnum,
  dayRuleEnum,
  fanOutModeEnum,
  holidayPolicyEnum,
  recurringFreqEnum,
  scopeModeEnum,
} from "./enums";
import { campaigns } from "./campaigns";
import { users } from "./users";

/** SPEC Mục 6.2 `recurring_rules` — đọc kỹ Mục 6 trước khi sửa (hay làm sai). */
export const recurringRules = pgTable("recurring_rules", {
  id: pkUuid(),
  /** Mã ổn định để seed tham chiếu (vd `CAD-09`), không bắt buộc với rule người dùng tạo. */
  ruleCode: text("rule_code").unique(),
  name: text("name").notNull(),
  description: text("description"),
  /**
   * { title, description, type, priority, channel, campaignId, labels, checklist,
   *   estimateHours, timeSlot } — hỗ trợ biến {{month}} {{year}} {{sbu_code}}... (Mục 6.2).
   */
  taskTemplate: jsonb("task_template").notNull(),
  freq: recurringFreqEnum("freq").notNull(),
  interval: integer("interval").notNull().default(1),
  byWeekday: integer("by_weekday").array(),
  byMonthDay: integer("by_month_day"),
  byNthWeekday: jsonb("by_nth_weekday"),
  dayRule: dayRuleEnum("day_rule").notNull().default("calendar_day"),
  holidayPolicy: holidayPolicyEnum("holiday_policy").notNull().default("none"),
  dueOffsetDays: integer("due_offset_days").notNull().default(0),
  startOffsetDays: integer("start_offset_days").notNull().default(3),
  dueTime: time("due_time"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  maxOccurrences: integer("max_occurrences"),
  assignmentMode: assignmentModeEnum("assignment_mode").notNull().default("fixed_user"),
  fixedAssigneeId: uuid("fixed_assignee_id").references(() => users.id),
  roundRobinUserIds: uuid("round_robin_user_ids").array(),
  scopeMode: scopeModeEnum("scope_mode").notNull().default("single"),
  scopeSbuIds: uuid("scope_sbu_ids").array(),
  fanOutMode: fanOutModeEnum("fan_out_mode").notNull().default("checklist_per_owner"),
  generationHorizonDays: integer("generation_horizon_days").notNull().default(45),
  completionBehavior: completionBehaviorEnum("completion_behavior")
    .notNull()
    .default("fixed_schedule"),
  skippedDates: date("skipped_dates").array().notNull().default([]),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  active: boolean("active").notNull().default(true),
  pausedUntil: date("paused_until"),
  ...auditColumns,
});

export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
