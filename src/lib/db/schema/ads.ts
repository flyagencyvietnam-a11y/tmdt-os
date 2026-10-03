import { date, index, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { adsStatusEnum } from "./enums";
import { sbus } from "./sbus";

/**
 * SPEC Mục 9.4 `Ads hàng tháng theo SBU` — Phase 3, đưa vào đợt này vì không
 * cần tích hợp bên ngoài. Quy tắc đã chốt: "Ngân sách Trung tâm" chỉ tính phần
 * trung tâm tự order; phần HO hỗ trợ thêm luôn ghi vào "Ngân sách Hệ thống (HO)".
 */
export const adsMonthly = pgTable(
  "ads_monthly",
  {
    id: pkUuid(),
    /** "2026-10" */
    period: text("period").notNull(),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
    product: text("product"),
    channel: text("channel"),
    objective: text("objective"),
    centerBudget: numeric("center_budget", { precision: 14, scale: 0 }),
    hoBudget: numeric("ho_budget", { precision: 14, scale: 0 }),
    actualSpend: numeric("actual_spend", { precision: 14, scale: 0 }),
    actualLeads: numeric("actual_leads", { precision: 10, scale: 0 }),
    misaOrderCode: text("misa_order_code"),
    status: adsStatusEnum("status").notNull().default("planned"),
    reportUrl: text("report_url"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    ...auditColumns,
  },
  (t) => [
    index("ads_monthly_period_idx").on(t.period),
    index("ads_monthly_sbu_idx").on(t.sbuId),
  ],
);

export type AdsMonthly = typeof adsMonthly.$inferSelect;
export type NewAdsMonthly = typeof adsMonthly.$inferInsert;
