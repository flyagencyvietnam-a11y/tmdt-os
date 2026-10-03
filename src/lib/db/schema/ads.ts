import { sql } from "drizzle-orm";
import { date, index, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { adsLineEnum, adsPeriodTypeEnum, adsStatusEnum } from "./enums";
import { sbus } from "./sbus";

/**
 * Ads hàng tuần/tháng theo 6 mảng digital thực tế (Mục 1-6, file
 * VMG_Digital_Tracker_2026 sheet "Tổng hợp" + "Tracking Tuần"). Thay cho
 * `ads_monthly` cũ (chỉ phủ Mục 2, chỉ theo tháng).
 *
 * `sbuId` chỉ bắt buộc có nghĩa ở line `b2c_center` (mỗi trung tâm 1 dòng/kỳ);
 * 5 line còn lại là tổng công ty, `sbuId` null. CPL/CAC/CVR/ROAS/CPMQL và
 * điểm hiệu quả đều SUY RA tại truy vấn (`computeAdsMetricsDerived` trong
 * lib/services/ads.ts) — không lưu cột, cùng nguyên tắc với `overdue` (Mục 4.2).
 *
 * Ngân sách: line `b2c_center` tách `centerOrderBudget` (TT tự chịu) +
 * `hoTopupBudget` (P.MKT chạy thêm, tính vào CP TT) — đúng 2 cột thực tế sheet
 * "B2C Trung tâm". 5 line còn lại dùng `budget` chung (1 cột ngân sách chi).
 */
export const adsMetrics = pgTable(
  "ads_metrics",
  {
    id: pkUuid(),
    line: adsLineEnum("line").notNull(),
    periodType: adsPeriodTypeEnum("period_type").notNull().default("month"),
    /** "2026-10" cho tháng; "2026-10-03" (ngày Thứ 7 bắt đầu tuần) cho tuần. */
    period: text("period").notNull(),
    sbuId: uuid("sbu_id").references(() => sbus.id),
    /** Ngân sách chi — dùng cho mọi line trừ b2c_center. */
    budget: numeric("budget", { precision: 14, scale: 0 }),
    /** b2c_center only — TT tự đề xuất, TT chịu chi phí. */
    centerOrderBudget: numeric("center_order_budget", { precision: 14, scale: 0 }),
    /** b2c_center only — P.Marketing chạy bổ sung, tính vào chi phí TT. */
    hoTopupBudget: numeric("ho_topup_budget", { precision: 14, scale: 0 }),
    leads: numeric("leads", { precision: 10, scale: 0 }),
    /** HVM (B2C/Ecom) / học viên ghi danh thi (OSIR) / học sinh đăng ký DV (VMP) — "lượt chuyển đổi" chung. */
    newStudents: numeric("new_students", { precision: 10, scale: 0 }),
    /** Mess/inquiry inbound — b2c_system/b2c_center theo tuần, b2b theo tháng. */
    messages: numeric("messages", { precision: 10, scale: 0 }),
    impressions: numeric("impressions", { precision: 12, scale: 0 }),
    /** ecom only. */
    revenue: numeric("revenue", { precision: 14, scale: 0 }),
    actualRevenue: numeric("actual_revenue", { precision: 14, scale: 0 }),
    /** ecom only — MQL (khác leads thô). */
    mql: numeric("mql", { precision: 10, scale: 0 }),
    /** b2b only — hợp đồng/deal chốt. */
    deals: numeric("deals", { precision: 10, scale: 0 }),
    misaOrderCode: text("misa_order_code"),
    status: adsStatusEnum("status").notNull().default("planned"),
    reportUrl: text("report_url"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** Feedback từ trung tâm + đánh giá của MKT — sheet "TỔNG HỢP T7-T9" cột K/L. */
    centerFeedback: text("center_feedback"),
    mktAssessment: text("mkt_assessment"),
    notes: text("notes"),
    ...auditColumns,
  },
  (t) => [
    index("ads_metrics_period_idx").on(t.period),
    index("ads_metrics_sbu_idx").on(t.sbuId),
    index("ads_metrics_line_idx").on(t.line),
    uniqueIndex("ads_metrics_upsert_uniq").on(t.line, t.periodType, t.period, sql`coalesce(${t.sbuId}, '00000000-0000-0000-0000-000000000000')`),
  ],
);

/**
 * Chi tiết từng chiến dịch Facebook — grain thấp nhất (file "ads tt.xlsx"),
 * cộng dồn lên thành `ads_metrics` (line=b2c_center) của tháng/trung tâm đó.
 * `misaRequestUrl` tham chiếu request duyệt chi trên MISA AMIS (Mục 16.1 —
 * MISA là nơi phê duyệt chính thức, MKT OS chỉ lưu link).
 */
export const adsCampaigns = pgTable(
  "ads_campaigns",
  {
    id: pkUuid(),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
    /** "2026-08" — tháng chạy chiến dịch. */
    period: text("period").notNull(),
    campaignName: text("campaign_name").notNull(),
    misaRequestUrl: text("misa_request_url"),
    messages: numeric("messages", { precision: 10, scale: 0 }),
    reach: numeric("reach", { precision: 12, scale: 0 }),
    impressions: numeric("impressions", { precision: 12, scale: 0 }),
    conversations: numeric("conversations", { precision: 10, scale: 0 }),
    comments: numeric("comments", { precision: 10, scale: 0 }),
    engagements: numeric("engagements", { precision: 10, scale: 0 }),
    reactions: numeric("reactions", { precision: 10, scale: 0 }),
    spend: numeric("spend", { precision: 14, scale: 0 }).notNull(),
    spendWithVat: numeric("spend_with_vat", { precision: 14, scale: 0 }),
    ...auditColumns,
  },
  (t) => [index("ads_campaigns_period_idx").on(t.period), index("ads_campaigns_sbu_idx").on(t.sbuId)],
);

/**
 * Kế hoạch giải ngân Digital ADS theo tháng (sheet "Giải ngân Digital") — chỉ
 * Mục 1+3+5 (không gồm NS Trung tâm order, B2B, VMP theo đúng phạm vi sheet gốc).
 * Thực tế lấy từ SUM(ads_metrics) tại truy vấn, không lưu lại ở bảng này.
 */
export const adsDisbursementPlan = pgTable(
  "ads_disbursement_plan",
  {
    id: pkUuid(),
    line: adsLineEnum("line").notNull(),
    /** "2026-10" */
    period: text("period").notNull(),
    plannedAmount: numeric("planned_amount", { precision: 14, scale: 0 }).notNull(),
    notes: text("notes"),
    ...auditColumns,
  },
  (t) => [uniqueIndex("ads_disbursement_plan_uniq").on(t.line, t.period)],
);

export type AdsMetric = typeof adsMetrics.$inferSelect;
export type NewAdsMetric = typeof adsMetrics.$inferInsert;
export type AdsCampaign = typeof adsCampaigns.$inferSelect;
export type NewAdsCampaign = typeof adsCampaigns.$inferInsert;
export type AdsDisbursementPlan = typeof adsDisbursementPlan.$inferSelect;
