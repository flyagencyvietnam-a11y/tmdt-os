import { index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";

/**
 * Cột tự thêm vào bảng (DataGrid) — người dùng bấm "+ Cột" ngay trên bảng, không cần sửa code.
 * Một định nghĩa cột gắn với 1 `entity` (tên bảng trên UI: "tasks", "campaigns", "requests"…);
 * giá trị lưu riêng theo (cột, dòng) nên không phải đổi schema bảng nghiệp vụ.
 */
export const gridCustomColumns = pgTable(
  "grid_custom_columns",
  {
    id: pkUuid(),
    entity: text("entity").notNull(),
    name: text("name").notNull(),
    /** text | number | date | select */
    kind: text("kind").notNull().default("text"),
    /** Danh sách lựa chọn cho kind=select. */
    options: jsonb("options").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns,
  },
  (t) => [index("grid_custom_columns_entity_idx").on(t.entity), uniqueIndex("grid_custom_columns_name_uniq").on(t.entity, t.name)],
);

export const gridCustomValues = pgTable(
  "grid_custom_values",
  {
    columnId: uuid("column_id")
      .notNull()
      .references(() => gridCustomColumns.id, { onDelete: "cascade" }),
    /** id dòng của bảng nghiệp vụ (dạng text để dùng được cho mọi bảng). */
    rowId: text("row_id").notNull(),
    value: text("value").notNull(),
    updatedBy: uuid("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.columnId, t.rowId] }), index("grid_custom_values_row_idx").on(t.rowId)],
);

export type GridCustomColumn = typeof gridCustomColumns.$inferSelect;
