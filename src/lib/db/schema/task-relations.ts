import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";
import { dependencyTypeEnum } from "./enums";
import { sbus } from "./sbus";
import { tasks } from "./tasks";
import { users } from "./users";

/** SPEC Mục 4.2 — bảng phụ thuộc `tasks`. */

export const taskCollaborators = pgTable(
  "task_collaborators",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const taskSbus = pgTable(
  "task_sbus",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.sbuId] })],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.label] })],
);

/**
 * Checklist — dùng cho cả checklist thường và fan-out `checklist_per_owner`
 * (SPEC Mục 6.5): mỗi dòng gắn `sbuId` để biết SBU nào đã xong.
 */
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: pkUuid(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    sbuId: uuid("sbu_id").references(() => sbus.id),
    note: text("note"),
    photoUrl: text("photo_url"),
    doneBy: uuid("done_by").references(() => users.id),
    doneAt: timestamp("done_at", { withTimezone: true }),
    sortOrder: text("sort_order").notNull().default("0"),
  },
  (t) => [
    index("checklist_items_task_idx").on(t.taskId),
    index("checklist_items_sbu_idx").on(t.sbuId),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    predecessorId: uuid("predecessor_id")
      .notNull()
      .references(() => tasks.id),
    successorId: uuid("successor_id")
      .notNull()
      .references(() => tasks.id),
    kind: dependencyTypeEnum("kind").notNull().default("finish_to_start"),
  },
  (t) => [primaryKey({ columns: [t.predecessorId, t.successorId] })],
);

export const taskWatchers = pgTable(
  "task_watchers",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: pkUuid(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    mentionedUserIds: uuid("mentioned_user_ids").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: pkUuid(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    url: text("url").notNull(),
    label: text("label"),
    addedBy: uuid("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_task_idx").on(t.taskId)],
);

/** Nhật ký mọi thay đổi task — ai, lúc nào, trường nào, giá trị cũ/mới (Mục 4.2). */
export const activityLog = pgTable(
  "activity_log",
  {
    id: pkUuid(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    actorId: uuid("actor_id").references(() => users.id),
    field: text("field").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_log_task_idx").on(t.taskId, t.occurredAt)],
);

/**
 * SPEC Mục 3.3 / 11.4 — liên kết ký số một lần cho `center_contributor` bấm
 * "Xác nhận đã xong" / "Báo vướng" không cần đăng nhập. Hết hạn 7 ngày, dùng 1 lần.
 */
export const taskConfirmationTokens = pgTable(
  "task_confirmation_tokens",
  {
    id: pkUuid(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    token: text("token").notNull().unique(),
    recipientEmail: text("recipient_email"),
    recipientName: text("recipient_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_confirmation_tokens_task_idx").on(t.taskId)],
);

export type ChecklistItem = typeof checklistItems.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type TaskConfirmationToken = typeof taskConfirmationTokens.$inferSelect;
