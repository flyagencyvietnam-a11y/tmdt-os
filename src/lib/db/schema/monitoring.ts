import { date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { monitoringKindEnum } from "./enums";
import { sbus } from "./sbus";
import { tasks } from "./tasks";

/**
 * SPEC Mục 9.5 `Monitoring hạng mục thay mới định kỳ` — POSM, bảng hiệu, OOH,
 * Google Maps, quầy tư vấn VMP, phòng thi. Cảnh báo (quá hạn/sắp đến hạn/còn
 * hạn/chưa có dữ liệu) là SUY RA tại truy vấn từ `lastUpdatedDate + cycleMonths`,
 * không lưu cột (cùng nguyên tắc với `overdue` của task — Mục 4.2).
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
    photoUrl: text("photo_url"),
    /** Task sinh gần nhất khi mục này chuyển quá hạn/sắp đến hạn (Mục 9.5). */
    lastTaskId: uuid("last_task_id").references(() => tasks.id),
    ...auditColumns,
  },
  (t) => [index("monitoring_items_sbu_idx").on(t.sbuId)],
);

export type MonitoringItem = typeof monitoringItems.$inferSelect;
export type NewMonitoringItem = typeof monitoringItems.$inferInsert;
