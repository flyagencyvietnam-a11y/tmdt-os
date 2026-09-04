import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  adsBudgetPacing,
  adsByChannel,
  adsDailySeries,
  adsEntryStatusToday,
  breakdownByCampaign,
  breakdownByProduct,
  breakdownByUser,
  campaignWeeklyPerf,
  getActionCounts,
  getHealth,
  recentReportWeekStarts,
  weeklyTrend,
} from "@/lib/services/dashboard";
import {
  evaluateCampaignAlerts,
  getBaseMetrics,
  deriveMetrics,
  type MetricsFilter,
} from "@/lib/services/metrics";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import {
  getBudgetProgressForPeriod,
  getKpiProgressForPeriod,
} from "@/lib/services/kpi";

/**
 * "Bóc tách" và "Sức khỏe" là số tổng hợp, không riêng theo người xem — cache 60s
 * theo (kỳ + bộ lọc). Người thứ hai chọn cùng kỳ, hoặc chính người đó bấm qua lại
 * giữa vài kỳ quen thuộc, đều lấy từ cache, không đụng DB. Kết hợp streaming (E1):
 * lần đầu hiện skeleton rồi có số; các lần sau gần như tức thì.
 */
const DASHBOARD_TTL = 60;

function toFilter(
  from: string,
  to: string,
  productCsv: string,
  channelCsv: string,
): MetricsFilter {
  return {
    from,
    to,
    productIds: productCsv ? productCsv.split(",") : undefined,
    channels: channelCsv
      ? (channelCsv.split(",") as MetricsFilter["channels"])
      : undefined,
  };
}

export const getBreakdownsCached = unstable_cache(
  async (
    from: string,
    to: string,
    productCsv: string,
    channelCsv: string,
    includeUser: boolean,
  ) => {
    const filter = toFilter(from, to, productCsv, channelCsv);
    const [byProduct, byCampaign, byUser, trend] = await Promise.all([
      breakdownByProduct(db, filter),
      breakdownByCampaign(db, filter, 20),
      includeUser ? breakdownByUser(db, filter) : Promise.resolve([]),
      weeklyTrend(db, { weeks: 12, filter }),
    ]);
    return { byProduct, byCampaign, byUser, trend };
  },
  ["dashboard-breakdowns-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);

/**
 * "Theo KPI" — chỉ tiêu + ngân sách của kỳ đang chọn. Khớp kỳ theo (from,to) đúng
 * mốc bắt đầu/kết thúc của kpi_assignments (Tháng hoặc Quý). Kỳ khác (tuần/năm/
 * nhanh) không có chỉ tiêu trùng → trả rỗng, UI hiện gợi ý chọn Tháng/Quý.
 */
export const getKpiFollowCached = unstable_cache(
  async (from: string, to: string) => {
    const [kpis, budget] = await Promise.all([
      getKpiProgressForPeriod(db, { periodStart: from, periodEnd: to }),
      getBudgetProgressForPeriod(db, { periodStart: from, periodEnd: to }),
    ]);
    return { kpis, budget };
  },
  ["dashboard-kpi-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);

/**
 * Trang "Theo dõi Ads" (Gói L + Q) — nhiều chiều: tổng 14 ngày (+ so kỳ trước),
 * nhịp ngân sách, chuỗi theo ngày, theo kênh, theo sản phẩm, cảnh báo, ma trận tuần.
 */
export const getAdsMonitorCached = unstable_cache(
  async () => {
    const today = todayVnDayStr();
    const f14: MetricsFilter = { from: addDaysStr(today, -13), to: today };
    const fPrev: MetricsFilter = {
      from: addDaysStr(today, -27),
      to: addDaysStr(today, -14),
    };
    const f30 = { from: addDaysStr(today, -29), to: today };

    const [
      entry,
      alerts,
      campaignWeeks,
      base14,
      basePrev,
      pacing,
      daily,
      byChannel,
      byProduct,
    ] = await Promise.all([
      adsEntryStatusToday(db),
      evaluateCampaignAlerts(db),
      campaignWeeklyPerf(db, recentReportWeekStarts(8)),
      getBaseMetrics(db, f14),
      getBaseMetrics(db, fPrev),
      adsBudgetPacing(db),
      adsDailySeries(db, { days: 30 }),
      adsByChannel(db, f30),
      breakdownByProduct(db, f30),
    ]);

    const m14 = { ...base14, ...deriveMetrics(base14) };
    const mPrev = { ...basePrev, ...deriveMetrics(basePrev) };
    const delta = (a: number, b: number) => (b === 0 ? null : (a - b) / b);
    const tiles = {
      spend: { v: m14.spend, d: delta(m14.spend, mPrev.spend) },
      messages: { v: m14.leads, d: delta(m14.leads, mPrev.leads) },
      mql: { v: m14.mql, d: delta(m14.mql, mPrev.mql) },
      cpmql: { v: m14.cpmql, d: delta(m14.cpmql ?? 0, mPrev.cpmql ?? 0) },
      cac: { v: m14.cac, d: delta(m14.cac ?? 0, mPrev.cac ?? 0) },
      roas: { v: m14.roas, d: delta(m14.roas ?? 0, mPrev.roas ?? 0) },
    };

    return {
      entry,
      alerts,
      campaignWeeks,
      tiles,
      pacing,
      daily,
      byChannel,
      byProduct: byProduct.rows,
    };
  },
  ["ads-monitor-v2"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);

export const getHealthBundleCached = unstable_cache(
  async (
    from: string,
    to: string,
    productCsv: string,
    channelCsv: string,
    cmpMode: "prev" | "yoy" | "none",
  ) => {
    const filter = toFilter(from, to, productCsv, channelCsv);
    const [health, actions, alerts] = await Promise.all([
      getHealth(db, filter, cmpMode),
      getActionCounts(db),
      evaluateCampaignAlerts(db),
    ]);
    return { health, actions, alerts };
  },
  ["dashboard-health-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);
