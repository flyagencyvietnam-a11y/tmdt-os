import {
  bigint,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pkUuid } from "./_shared";
import {
  kpiDirectionEnum,
  kpiPeriodTypeEnum,
  kpiScopeTypeEnum,
  kpiSourceEnum,
  kpiUnitEnum,
  otherCostTypeEnum,
} from "./enums";
import { products } from "./products";
import { users } from "./users";

/** SPEC Mục 7.10 — danh mục các loại chỉ tiêu có thể giao. */
export const kpiDefinitions = pgTable("kpi_definitions", {
  id: pkUuid(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  unit: kpiUnitEnum("unit").notNull(),
  direction: kpiDirectionEnum("direction").notNull().default("HIGHER_BETTER"),
  source: kpiSourceEnum("source").notNull(),
  /** Khóa trỏ tới hàm tính trong metrics.ts, chỉ dùng khi source = AUTO. */
  formulaKey: text("formula_key"),
  /** Định nghĩa chính thức, hiển thị khi hover. */
  description: text("description"),
});

/** SPEC Mục 7.10 — một chỉ tiêu cụ thể giao cho một người/nhóm trong một kỳ. */
export const kpiAssignments = pgTable(
  "kpi_assignments",
  {
    id: pkUuid(),
    kpiDefinitionId: uuid("kpi_definition_id")
      .notNull()
      .references(() => kpiDefinitions.id),
    periodType: kpiPeriodTypeEnum("period_type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    scopeType: kpiScopeTypeEnum("scope_type").notNull(),
    userId: uuid("user_id").references(() => users.id),
    productId: uuid("product_id").references(() => products.id),
    targetValue: numeric("target_value").notNull(),
    /** Trọng số trong tổng KPI của người đó. Tổng mỗi người mỗi kỳ nên = 100 (cảnh báo, không chặn). */
    weightPct: numeric("weight_pct", { precision: 5, scale: 2 }).notNull(),
    /** Các mốc hoàn thành, ví dụ [{"pct":85},{"pct":90},{"pct":100}]. */
    thresholdTiers: jsonb("threshold_tiers")
      .$type<{ pct: number }[]>()
      .default([{ pct: 85 }, { pct: 90 }, { pct: 100 }]),
    /** Chỉ dùng khi source = MANUAL. */
    manualActual: numeric("manual_actual"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("kpi_assign_period_idx").on(t.periodStart, t.periodEnd),
    index("kpi_assign_user_idx").on(t.userId),
  ],
);

/**
 * SPEC Mục 14.2 (Lưu ý về kol_cost) + QĐ07. Nơi lưu chi phí ngoài spend ads
 * để công thức REVENUE_AFTER_MKT chạy tự động.
 */
export const otherCosts = pgTable(
  "other_costs",
  {
    id: pkUuid(),
    costType: otherCostTypeEnum("cost_type").notNull().default("KOL_KOC"),
    /** Ngày ghi nhận chi phí — dùng để lọc theo kỳ. */
    incurredOn: date("incurred_on").notNull(),
    productId: uuid("product_id").references(() => products.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("other_costs_incurred_idx").on(t.incurredOn)],
);

export type KpiDefinition = typeof kpiDefinitions.$inferSelect;
export type KpiAssignment = typeof kpiAssignments.$inferSelect;
export type NewKpiAssignment = typeof kpiAssignments.$inferInsert;
export type OtherCost = typeof otherCosts.$inferSelect;
