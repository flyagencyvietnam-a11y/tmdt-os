import { customType, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { monitoringKindEnum } from "./enums";
import { sbus } from "./sbus";
import { tasks } from "./tasks";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * SPEC Mục 9.5 `Monitoring hạng mục thay mới định kỳ` — POSM, bảng hiệu, OOH,
 * Google Maps, quầy tư vấn VMP, phòng thi. Cảnh báo (quá hạn/sắp đến hạn/còn
 * hạn/chưa có dữ liệu) là SUY RA tại truy vấn từ `lastUpdatedDate + cycleMonths`,
 * không lưu cột (cùng nguyên tắc với `overdue` của task — Mục 4.2).
 *
 * UI quản lý theo SBU: mỗi SBU có danh sách hạng mục (Standee, Poster, Decal cửa kính, Bảng hiệu,
 * Google Maps…) — mỗi dòng ghi hiện trạng (`currentStateNote`), ảnh thực tế (`monitoring_photos`)
 * và lịch sử rà soát (`monitoring_checks`).
 */
export const monitoringItems = pgTable(
  "monitoring_items",
  {
    id: pkUuid(),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
    kind: monitoringKindEnum("kind").notNull().default("other"),
    title: text("title").notNull(),
    currentStateNote: text("current_state_note"),
    lastUpdatedDate: date("last_updated_date"),
    cycleMonths: integer("cycle_months").notNull().default(12),
    /** Link ngoài (vd. link Google Maps của điểm) — ảnh tải lên nằm ở `monitoring_photos`. */
    photoUrl: text("photo_url"),
    /** Task sinh gần nhất khi mục này chuyển quá hạn/sắp đến hạn (Mục 9.5). */
    lastTaskId: uuid("last_task_id").references(() => tasks.id),
    ...auditColumns,
  },
  (t) => [index("monitoring_items_sbu_idx").on(t.sbuId)],
);

/**
 * Ảnh thực tế của hạng mục. Ảnh được NÉN ở trình duyệt trước khi tải lên (cạnh dài ≤ 1600px, WebP/JPEG
 * ~0.72) rồi lưu thẳng trong DB (`data`) — trang liệt kê chỉ dùng ảnh nhỏ `thumb`, ảnh đầy đủ tải khi bấm xem.
 */
export const monitoringPhotos = pgTable(
  "monitoring_photos",
  {
    id: pkUuid(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => monitoringItems.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    /** Ảnh thu nhỏ (~360px) cho lưới/danh sách. */
    thumb: bytea("thumb").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    caption: text("caption"),
    takenOn: date("taken_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [index("monitoring_photos_item_idx").on(t.itemId)],
);

/** Nhật ký rà soát/cập nhật của 1 hạng mục (kể cả "đã rà review Google Maps ngày…"). */
export const monitoringChecks = pgTable(
  "monitoring_checks",
  {
    id: pkUuid(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => monitoringItems.id, { onDelete: "cascade" }),
    checkedOn: date("checked_on").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [index("monitoring_checks_item_idx").on(t.itemId)],
);

export type MonitoringItem = typeof monitoringItems.$inferSelect;
export type NewMonitoringItem = typeof monitoringItems.$inferInsert;
export type MonitoringCheck = typeof monitoringChecks.$inferSelect;
