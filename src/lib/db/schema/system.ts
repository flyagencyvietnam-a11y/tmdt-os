import {
  bigserial,
  boolean,
  date,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";
import {
  auditActionEnum,
  notificationSeverityEnum,
  notificationTypeEnum,
  savedViewEntityEnum,
  savedViewVisibilityEnum,
} from "./enums";
import { users } from "./users";

/** SPEC Mục 7.11 — cấu hình view kiểu Airtable. Cấu trúc `config` xem SPEC Mục 16.2. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: pkUuid(),
    entity: savedViewEntityEnum("entity").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    visibility: savedViewVisibilityEnum("visibility").notNull().default("PRIVATE"),
    config: jsonb("config").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("saved_views_entity_owner_idx").on(t.entity, t.ownerId)],
);

/** SPEC Mục 7.12 — audit log. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** NULL nếu do hệ thống. */
    actorId: uuid("actor_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    action: auditActionEnum("action").notNull(),
    /** {field: {from, to}} */
    changes: jsonb("changes"),
    ip: inet("ip"),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_actor_idx").on(t.actorId),
    index("audit_logs_occurred_idx").on(t.occurredAt),
  ],
);

/** SPEC Mục 7.13 — khóa sổ kỳ. */
export const periodLocks = pgTable(
  "period_locks",
  {
    id: pkUuid(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    lockedBy: uuid("locked_by").references(() => users.id),
    /** NULL = còn hiệu lực; có giá trị = đã mở khóa. */
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    unlockedBy: uuid("unlocked_by").references(() => users.id),
    note: text("note"),
  },
  (t) => [index("period_locks_range_idx").on(t.periodStart, t.periodEnd)],
);

/** SPEC Mục 7.14 — thông báo trong ứng dụng. */
export const notifications = pgTable(
  "notifications",
  {
    id: pkUuid(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationTypeEnum("type").notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("INFO"),
    title: text("title").notNull(),
    body: text("body"),
    /** Đường dẫn tới màn hình xử lý. */
    linkUrl: text("link_url"),
    /** Gộp thông báo cùng loại trong ngày — khóa idempotency của cron. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.readAt),
    index("notifications_dedupe_idx").on(t.dedupeKey),
  ],
);

/** Ngày lễ — SPEC Mục 8.2 "Ngoại lệ về ngày nghỉ". Bảng cấu hình. */
export const holidays = pgTable("holidays", {
  id: pkUuid(),
  holidayDate: date("holiday_date").notNull().unique(),
  name: text("name").notNull(),
});

/** Cấu hình hệ thống dạng key-value (ngưỡng toàn cục, cờ tính năng...). */
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

export type SavedView = typeof savedViews.$inferSelect;
export type NewSavedView = typeof savedViews.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type PeriodLock = typeof periodLocks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
