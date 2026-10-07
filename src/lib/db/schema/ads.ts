import { sql } from "drizzle-orm";
import { date, index, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { adsLineEnum, adsPeriodTypeEnum, adsStatusEnum } from "./enums";
import { sbus } from "./sbus";
import { users } from "./users";

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
 * **B2C = Hệ thống + Trung tâm, lead/HVM tính CHUNG** (sheet "Tổng hợp" mục 1+2):
 * dòng tháng của line `b2c_system` mang `budget` = NS Hệ thống (P.MKT chạy chung)
 * VÀ `leads`/`newStudents` = Lead/HVM TỔNG của cả B2C offline (Hệ thống + mọi
 * Trung tâm cộng lại, không tách theo mục). Còn `leads`/`newStudents` của dòng
 * `b2c_center` là phần quy riêng cho ads ngân sách từng trung tâm (báo cáo hiệu
 * quả Q3, có từ T7/2026) — là TẬP CON của số tổng, KHÔNG cộng thêm vào số tổng.
 * Số liệu THÁNG nhập riêng, KHÔNG phải tổng các tuần (chu kỳ tính khác nhau).
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
    /** Mảng của request. Mặc định b2c_center (dữ liệu cũ toàn là request của trung tâm). */
    line: adsLineEnum("line").notNull().default("b2c_center"),
    /** Chỉ có nghĩa ở mảng b2c_center (request của từng trung tâm); các mảng khác để trống. */
    sbuId: uuid("sbu_id").references(() => sbus.id),
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
    /** Ngân sách KẾ HOẠCH của request (so với `spend` thực chi). */
    plannedBudget: numeric("planned_budget", { precision: 14, scale: 0 }),
    /** Người chạy ads cho request này. */
    runnerId: uuid("runner_id").references(() => users.id),
    spendWithVat: numeric("spend_with_vat", { precision: 14, scale: 0 }),
    ...auditColumns,
  },
  (t) => [index("ads_campaigns_period_idx").on(t.period), index("ads_campaigns_sbu_idx").on(t.sbuId), index("ads_campaigns_line_idx").on(t.line)],
);

/**
 * KẾ HOẠCH ads theo tháng (SPEC Phụ lục D mục 21) — điểm bắt đầu của luồng Kế hoạch → Request → Báo cáo.
 * Mỗi dòng = (mảng, tháng[, trung tâm]): ngân sách kế hoạch + mục tiêu theo phễu của mảng. Thực tế/tiến độ/
 * % đạt đều SUY RA tại truy vấn từ `ads_metrics`, không lưu.
 *
 * Quy ước cùng số thực tế: B2C = dòng `b2c_system` (NS Hệ thống + mục tiêu Lead/HVM TỔNG cả B2C) và
 * dòng `b2c_center` + `sbuId` (NS từng trung tâm). Các mảng còn lại 1 dòng/tháng, `sbuId` null.
 * Sửa tự do, thay đổi ghi nhật ký audit. Thay cho `ads_disbursement_plan` (đã gộp vào đây).
 */
export const adsPlans = pgTable(
  "ads_plans",
  {
    id: pkUuid(),
    line: adsLineEnum("line").notNull(),
    /** "2026-10" */
    period: text("period").notNull(),
    sbuId: uuid("sbu_id").references(() => sbus.id),
    plannedBudget: numeric("planned_budget", { precision: 14, scale: 0 }),
    targetLeads: numeric("target_leads", { precision: 10, scale: 0 }),
    /** HVM / HV ghi danh thi / HS đăng ký DV — "lượt chuyển đổi" chung, giống ads_metrics.new_students. */
    targetNewStudents: numeric("target_new_students", { precision: 10, scale: 0 }),
    targetMessages: numeric("target_messages", { precision: 10, scale: 0 }),
    targetMql: numeric("target_mql", { precision: 10, scale: 0 }),
    targetRevenue: numeric("target_revenue", { precision: 14, scale: 0 }),
    targetDeals: numeric("target_deals", { precision: 10, scale: 0 }),
    notes: text("notes"),
    ...auditColumns,
  },
  (t) => [
    index("ads_plans_period_idx").on(t.period),
    uniqueIndex("ads_plans_uniq").on(t.line, t.period, sql`coalesce(${t.sbuId}, '00000000-0000-0000-0000-000000000000')`),
  ],
);

/**
 * Ecom (TMĐT) chia theo sản phẩm — báo cáo "VMG_Bao_cao_TMDT_theo_SP_theo_thang".
 * Một dòng = 1 sản phẩm × 1 KỲ. Kỳ thường là 1 tháng; riêng giai đoạn Test T6-T7
 * chỉ có số gộp nên `periodEnd` ≠ `period` (T6 → T7). CAC/CPMQL/ROAS suy ra tại
 * truy vấn. Tổng các sản phẩm đối chiếu với dòng `ads_metrics` line=ecom cùng
 * kỳ: phần chênh spend = "chưa phân bổ theo sản phẩm".
 */
export const adsEcomProducts = pgTable(
  "ads_ecom_products",
  {
    id: pkUuid(),
    /** Tháng bắt đầu của kỳ: "2026-08". */
    period: text("period").notNull(),
    /** Tháng kết thúc kỳ; null = kỳ đúng 1 tháng. */
    periodEnd: text("period_end"),
    /** Khoá sản phẩm — danh sách cố định ECOM_PRODUCTS (lib/ads-metrics.ts). */
    product: text("product").notNull(),
    spend: numeric("spend", { precision: 14, scale: 0 }),
    mql: numeric("mql", { precision: 10, scale: 0 }),
    newStudents: numeric("new_students", { precision: 10, scale: 0 }),
    revenue: numeric("revenue", { precision: 14, scale: 0 }),
    notes: text("notes"),
    ...auditColumns,
  },
  (t) => [uniqueIndex("ads_ecom_products_uniq").on(t.period, t.product)],
);

export type AdsEcomProduct = typeof adsEcomProducts.$inferSelect;
export type AdsMetric = typeof adsMetrics.$inferSelect;
export type NewAdsMetric = typeof adsMetrics.$inferInsert;
export type AdsCampaign = typeof adsCampaigns.$inferSelect;
export type NewAdsCampaign = typeof adsCampaigns.$inferInsert;
export type AdsPlan = typeof adsPlans.$inferSelect;
export type NewAdsPlan = typeof adsPlans.$inferInsert;
