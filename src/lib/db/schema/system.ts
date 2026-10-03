import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";
import {
  importRowResultEnum,
  importTemplateEnum,
  notificationChannelEnum,
  notificationKindEnum,
  reportExportKindEnum,
  savedViewEntityEnum,
  savedViewVisibilityEnum,
} from "./enums";
import { users } from "./users";

/** SPEC Phụ lục A `notifications`, điều chỉnh theo Mục 11. */
export const notifications = pgTable(
  "notifications",
  {
    id: pkUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: notificationKindEnum("kind").notNull(),
    taskId: uuid("task_id"),
    title: text("title").notNull(),
    body: text("body"),
    channel: notificationChannelEnum("channel").notNull().default("in_app"),
    /** (task_id, loại_sự_kiện, ngày) — Mục 11.3. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.readAt),
    uniqueIndex("notifications_dedupe_idx")
      .on(t.userId, t.channel, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);

/** SPEC Mục 10.1 `import_batches` — mỗi lần nạp file. Undo 72h (Mục 10.1). */
export const importBatches = pgTable("import_batches", {
  id: pkUuid(),
  template: importTemplateEnum("template").notNull(),
  fileName: text("file_name").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  summary: jsonb("summary"),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importRows = pgTable(
  "import_rows",
  {
    id: pkUuid(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id),
    rowNumber: integer("row_number").notNull(),
    sheet: text("sheet"),
    rawData: jsonb("raw_data").notNull(),
    result: importRowResultEnum("result").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    message: text("message"),
  },
  (t) => [index("import_rows_batch_idx").on(t.batchId)],
);

/** SPEC Mục 8.3 `saved_views`. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: pkUuid(),
    entity: savedViewEntityEnum("entity").notNull().default("tasks"),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibility: savedViewVisibilityEnum("visibility").notNull().default("private"),
    config: jsonb("config").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("saved_views_owner_idx").on(t.ownerId)],
);

/** Audit log chung — mọi thay đổi field quan trọng + mọi lần export/import (Mục 5 nguyên tắc). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pkUuid(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    changes: jsonb("changes"),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_occurred_idx").on(t.occurredAt),
  ],
);

/** SPEC Mục 6.3 / 13.4 `holidays` — ngày lễ VN, dùng cho day_rule/holiday_policy. */
export const holidays = pgTable("holidays", {
  id: pkUuid(),
  holidayDate: date("holiday_date").notNull().unique(),
  name: text("name").notNull(),
});

/** Cấu hình hệ thống dạng key-value — SPEC Mục 13.4. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by").references(() => users.id),
});

/** SPEC Mục 11.1 — Web push (P2). Mỗi trình duyệt/thiết bị đăng ký 1 dòng. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: pkUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * SPEC Mục 10.5 / 14.4 — file xuất lưu tại chỗ (không có kho lưu trữ ngoài ở
 * đợt này): báo cáo định kỳ, lịch tuần BOD... Nội dung mã hoá base64 trong cột text
 * để tránh phụ thuộc kiểu bytea đặc thù driver.
 */
export const reportExports = pgTable(
  "report_exports",
  {
    id: pkUuid(),
    kind: reportExportKindEnum("kind").notNull(),
    period: text("period"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    dataBase64: text("data_base64").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_exports_kind_idx").on(t.kind, t.createdAt)],
);

export type NotificationRow = typeof notifications.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type ReportExport = typeof reportExports.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportRow = typeof importRows.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
