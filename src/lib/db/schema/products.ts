import {
  bigint,
  boolean,
  integer,
  numeric,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";

/**
 * SPEC Mục 7.2 / 4.5. Danh mục sản phẩm — cấu hình được, KHÔNG hard-code.
 * `target_cpmql` ở cấp sản phẩm (SPEC Mục 9.5 - phản biện về ngưỡng 600k):
 * khởi tạo tất cả = 600.000 để không đổi hành vi hiện tại.
 */
export const products = pgTable("products", {
  id: pkUuid(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Giá niêm yết, VND. Dùng để tính room CAC. */
  listPrice: bigint("list_price", { mode: "number" }),
  /** % giá niêm yết được phép chi cho CAC. */
  cacRoomPct: numeric("cac_room_pct", { precision: 5, scale: 2 }).default("15.00"),
  /** Ngưỡng cảnh báo CPMQL riêng cho sản phẩm này, VND. */
  targetCpmql: bigint("target_cpmql", { mode: "number" }).default(600000),
  /** Mức spend tích lũy mà chưa ra MQL nào thì đề xuất kill, VND. */
  killThresholdNoMql: bigint("kill_threshold_no_mql", { mode: "number" }).default(
    900000,
  ),
  /** Tỷ trọng ngân sách phân bổ (%). */
  budgetSharePct: numeric("budget_share_pct", { precision: 5, scale: 2 }),
  /** 1 = ưu tiên cao nhất. */
  priority: integer("priority"),
  /** FT15 sẽ chuyển false từ Q4/2026 — vẫn giữ dữ liệu lịch sử. */
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  note: text("note"),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
