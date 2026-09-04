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
import { getLeadTempBreakdown } from "@/lib/services/lead-temp";

/**
 * "Bóc tách" và "Sức khỏe" là số tổng hợp, không riêng theo người xem — cache 60s
 * theo (kỳ + bộ lọc). Người thứ hai chọn cùng kỳ, hoặc chính người đó bấm qua lại
 * giữa vài kỳ quen thuộc, đều lấy từ cache, không đụng DB. Kết hợp streaming (E1):
 * lần đầu hiện skeleton rồi có số; các lần sau gần như tức thì.
 */
const DASHBOARD_TTL = 60;

/**
 * "Cần hành động" và "Cảnh báo campaign" KHÔNG phụ thuộc bộ lọc thời gian (đều tính
 * theo trạng thái hiện tại / rolling 14 ngày). Tách ra cache riêng, không khóa theo
 * kỳ — đổi bộ lọc trên Dashboard hay /ads đều không phải tính lại.
 */
export const getActionCountsCached = unstable_cache(
  async () => getActionCounts(db),
  ["dashboard-action-counts-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);

export const getCampaignAlertsCached = unstable_cache(
  async () => evaluateCampaignAlerts(db),
  ["campaign-alerts-v1"],
  { revalidate: 120, tags: ["dashboard"] },
);

/** Nhiệt độ pipeline lead (OPEN theo Nóng/Ấm/Nguội/Lạnh) — trạng thái hiện tại, không khóa theo kỳ. */
export const getLeadTempCached = unstable_cache(
  async () => getLeadTempBreakdown(db),
  ["lead-temperature-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);

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
 * Trang "Theo dõi Ads" — tách 3 cache để đổi bộ lọc không tính lại phần "hôm nay":
 *  - getAdsTodayCached: nhập-liệu-hôm-nay + nhịp ngân sách (không phụ thuộc kỳ)
 *  - getCampaignAlertsCached: cảnh báo R1–R5 (rolling 14 ngày, không phụ thuộc kỳ)
 *  - getAdsPeriodCached(from,to): thẻ tổng + so kỳ trước, chuỗi ngày, theo kênh /
 *    sản phẩm, ma trận 8 tuần đến hết kỳ — chỉ phần này khóa theo (from,to).
 */
export const getAdsTodayCached = unstable_cache(
  async () => {
    const [entry, pacing] = await Promise.all([
      adsEntryStatusToday(db),
      adsBudgetPacing(db),
    ]);
    return { entry, pacing };
  },
  ["ads-today-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);

export const getAdsPeriodCached = unstable_cache(
  async (from: string, to: string) => {
    const f: MetricsFilter = { from, to };
    const prev = comparePeriod(from, to, "prev"); // kỳ liền trước cùng độ dài

    const [campaignWeeks, base, basePrev, daily, byChannel, byProduct] =
      await Promise.all([
        campaignWeeklyPerf(db, recentReportWeekStarts(8, to)),
        getBaseMetrics(db, f),
        prev
          ? getBaseMetrics(db, { from: prev.from, to: prev.to })
          : Promise.resolve(null),
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

    return { tiles, campaignWeeks, daily, byChannel, byProduct: byProduct.rows };
  },
  ["ads-period-v1"],
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
      getActionCountsCached(),
      getCampaignAlertsCached(),
    ]);
    return { health, actions, alerts };
  },
  ["dashboard-health-v1"],
  { revalidate: DASHBOARD_TTL, tags: ["dashboard"] },
);
