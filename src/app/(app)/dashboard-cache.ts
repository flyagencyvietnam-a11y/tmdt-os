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
  comparePeriod,
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
  async (from: string, to: string) => {
    const f: MetricsFilter = { from, to };
    const prev = comparePeriod(from, to, "prev"); // kỳ liền trước cùng độ dài

    const [
      entry,
      alerts,
      campaignWeeks,
      base,
      basePrev,
      pacing,
      daily,
      byChannel,
      byProduct,
    ] = await Promise.all([
      adsEntryStatusToday(db),
      evaluateCampaignAlerts(db),
      campaignWeeklyPerf(db, recentReportWeekStarts(8, to)),
      getBaseMetrics(db, f),
      prev
        ? getBaseMetrics(db, { from: prev.from, to: prev.to })
        : Promise.resolve(null),
      adsBudgetPacing(db),
      adsDailySeries(db, { from, to }),
      adsByChannel(db, f),
      breakdownByProduct(db, f),
    ]);

    const m = { ...base, ...deriveMetrics(base) };
    const mPrev = basePrev ? { ...basePrev, ...deriveMetrics(basePrev) } : null;
    const delta = (a: number, b: number | undefined) =>
      b == null || b === 0 ? null : (a - b) / b;
    const tiles = {
      spend: { v: m.spend, d: delta(m.spend, mPrev?.spend) },
      messages: { v: m.leads, d: delta(m.leads, mPrev?.leads) },
      mql: { v: m.mql, d: delta(m.mql, mPrev?.mql) },
      cpmql: { v: m.cpmql, d: delta(m.cpmql ?? 0, mPrev?.cpmql ?? undefined) },
      cac: { v: m.cac, d: delta(m.cac ?? 0, mPrev?.cac ?? undefined) },
      roas: { v: m.roas, d: delta(m.roas ?? 0, mPrev?.roas ?? undefined) },
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
  ["ads-monitor-v3"],
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
