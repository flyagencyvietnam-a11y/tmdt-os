import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { adsCampaigns, campaignSbus, campaigns, sbus, tasks, users } from "@/lib/db/schema";
import { CHANNEL_LABEL, CHANNEL_METRICS, CHANNELS, engagementRate, followerGrowth, METRICS, periodLabel, prevPeriod, sameChannel, sumValues, valuesOf, type ChannelKey, type MetricValues } from "@/lib/brand-perf";
import { ECOM_PRODUCTS } from "@/lib/ads-metrics";
import { SBU_KIND_LABEL, SBU_REGION_LABEL, isFanOutSbu } from "@/lib/sbu-kinds";
import { fmtDate } from "@/lib/format";
import { listAdsMetrics, listAdsPlans, listEcomProducts, loadEffectivenessRubric } from "@/lib/services/ads";
import { listBrandPerf, listBrandSbus } from "@/lib/services/brand-perf";
import { computeManagementMetrics } from "@/lib/services/reports";
import { getSbuStats } from "@/lib/services/sbu-overview";
import { overdueSqlFragment } from "@/lib/services/tasks";
import { todayVnDayStr } from "@/lib/time";
import { ecomAggregate, prevQuarter, quarterKey, quarterLabel, quarterMonths, type EcomProductRow } from "@/app/(app)/ads/rollups";
import { aggregate, derive, monthLabel, num, prevMonth, type MetricRow } from "@/app/(app)/ads/shared";
import { splitB2cOwn } from "@/app/(app)/ads/b2c-own";
import { withDerivedMonths } from "@/app/(app)/ads/month-derive";
import { bucketRows, buildAdsUnits, indexRows, rowsOfUnit, totalFunnel, unitFunnel, type AdsUnit } from "@/app/(app)/ads/units";
import { BRAND_COLORS, SERIES_COLORS, type ReportDoc, type ReportKind, type ReportSection, type TableSection } from "./types";

export interface BuildOptions {
  period?: string;
  userName: string;
}

const CAMPAIGN_STATUS: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  preparing: "Đang chuẩn bị",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn tất",
  cancelled: "Huỷ",
  needs_confirmation: "Cần xác nhận",
};
const CAMPAIGN_TYPE: Record<string, string> = {
  brand_theme: "Brand Theme",
  product_gtm: "GTM sản phẩm",
  business_program: "Chương trình kinh doanh",
  rebrand: "Rebrand",
  data_program: "Dữ liệu",
  internal_program: "Nội bộ",
  other: "Khác",
};
const TASK_TYPE: Record<string, string> = {
  campaign_action: "Action plan",
  content: "Content",
  media: "Quay chụp",
  request: "Request",
  monitoring: "Giám sát",
  ads: "Ads",
  report: "Báo cáo",
  meeting: "Họp",
  general: "Chung",
};

const nz = (v: number | null | undefined) => (v == null ? null : v);
const arrow = (cur: number | null | undefined, prev: number | null | undefined, goodWhen: "up" | "down" = "up"): { sub: string; tone: "good" | "bad" | "neutral" } => {
  if (cur == null || prev == null || prev === 0) return { sub: "chưa có kỳ trước để so sánh", tone: "neutral" };
  const d = (cur - prev) / Math.abs(prev);
  const good = goodWhen === "up" ? d >= 0 : d <= 0;
  return { sub: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% so với kỳ trước`, tone: Math.abs(d) < 0.005 ? "neutral" : good ? "good" : "bad" };
};
const vnInt = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));
const vnMoneyShort = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  return Math.round(v).toLocaleString("vi-VN");
};
const pctText = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);

function lastMonths(all: string[], upTo: string, n: number): string[] {
  return [...new Set([...all, upTo])].filter((p) => p <= upTo).sort().slice(-n);
}

// =====================================================================================
// 1) Brand Performance
// =====================================================================================
async function buildBrand(db: DB, o: BuildOptions): Promise<ReportDoc> {
  const [brands, { channels, metrics }] = await Promise.all([listBrandSbus(db), listBrandPerf(db)]);
  const periods = [...new Set(metrics.map((m) => m.period))].sort();
  const period = o.period ?? periods.at(-1) ?? todayVnDayStr().slice(0, 7);
  const prev = prevPeriod(period);
  // Số liệu của 1 kênh = đúng (brand, nền tảng, tài khoản) — 1 brand có thể có nhiều tài khoản cùng nền tảng.
  const valsOf = (c: { sbuId: string; channel: string; account: string }, p: string): MetricValues => {
    const rows = metrics.filter((m) => m.period === p && sameChannel(m, c));
    return sumValues(rows.map((r) => valuesOf(r as never)));
  };
  const chOf = (sbuId: string) => channels.filter((c) => c.sbuId === sbuId);
  const brandTotal = (sbuId: string, p: string) => sumValues(chOf(sbuId).map((c) => valsOf(c, p)));
  const grand = (p: string) => sumValues(brands.map((b) => brandTotal(b.id, p)));
  const cur = grand(period);
  const old = grand(prev);

  const sections: ReportSection[] = [];
  const a1 = arrow(cur.impressions, old.impressions);
  const a2 = arrow(cur.engagements, old.engagements);
  const a3 = arrow(cur.followers, old.followers);
  sections.push({
    type: "kpis",
    items: [
      { label: "Impression", value: vnInt(cur.impressions), sub: a1.sub, tone: a1.tone },
      { label: "Engagement", value: vnInt(cur.engagements), sub: a2.sub, tone: a2.tone },
      { label: "Engagement rate", value: pctText(engagementRate(cur)), sub: `Kỳ trước: ${pctText(engagementRate(old))}`, tone: "brand" },
      { label: "Follower (cộng các kênh)", value: vnInt(cur.followers), sub: `${a3.sub} · +${vnInt(cur.newFollowers)} trong tháng`, tone: a3.tone },
    ],
  });

  const matrixRows: TableSection["rows"] = [];
  for (const b of brands) {
    const chs = chOf(b.id);
    if (chs.length === 0) continue;
    const t = brandTotal(b.id, period);
    const tp = brandTotal(b.id, prev);
    const rowOf = (label: string, v: MetricValues, p: MetricValues, kind?: "subtotal") => ({
      brand: b.name,
      channel: label,
      impressions: nz(v.impressions),
      reach: nz(v.reach),
      engagements: nz(v.engagements),
      er: engagementRate(v),
      videoViews: nz(v.videoViews),
      linkClicks: nz(v.linkClicks),
      sessions: nz(v.sessions),
      posts: nz(v.posts),
      followers: nz(v.followers),
      newFollowers: nz(v.newFollowers),
      growth: followerGrowth(v),
      deltaImpr: v.impressions != null && p.impressions ? (v.impressions - p.impressions) / p.impressions : null,
      ...(kind ? { _kind: kind } : {}),
    });
    matrixRows.push(rowOf("Tất cả kênh", t, tp, "subtotal"));
    for (const c of chs) {
      const v = valsOf(c, period);
      // Kênh ngừng sử dụng chỉ hiện nếu kỳ này vẫn còn số liệu.
      if (!c.active && Object.values(v).every((x) => x == null)) continue;
      const name = CHANNEL_LABEL[c.channel] ?? c.channel;
      matrixRows.push(rowOf(`${c.label ? `${name} — ${c.label}` : name}${c.active ? "" : " (ngừng)"}`, v, valsOf(c, prev)));
    }
  }
  const matrixCols = [
    { header: "Brand / sản phẩm", key: "brand", width: 20 },
    { header: "Kênh", key: "channel", width: 30 },
    { header: "Impression", key: "impressions", format: "int" as const, heat: true },
    { header: "Reach", key: "reach", format: "int" as const },
    { header: "Engagement", key: "engagements", format: "int" as const, heat: true },
    { header: "ER", key: "er", format: "pct" as const },
    { header: "Video views", key: "videoViews", format: "int" as const },
    { header: "Click", key: "linkClicks", format: "int" as const },
    { header: "Sessions", key: "sessions", format: "int" as const },
    { header: "Bài đăng", key: "posts", format: "int" as const },
    { header: "Follower cuối tháng", key: "followers", format: "int" as const },
    { header: "+Follower", key: "newFollowers", format: "int" as const },
    { header: "Tăng trưởng follower", key: "growth", format: "pct" as const },
    { header: "Δ Impression vs T-1", key: "deltaImpr", format: "pct" as const },
  ];
  sections.push({
    type: "table",
    title: `Ma trận Brand × Kênh — ${periodLabel(period)}`,
    note: "Mỗi brand có hệ thống kênh riêng; ô trống = chưa có số liệu hoặc chỉ số không áp dụng cho kênh. Follower cộng các kênh có thể trùng người theo dõi.",
    columns: matrixCols,
    rows: matrixRows,
    totals: {
      brand: "TOÀN HỆ THỐNG",
      channel: `${brands.filter((b) => chOf(b.id).length).length} brand`,
      impressions: nz(cur.impressions),
      reach: nz(cur.reach),
      engagements: nz(cur.engagements),
      er: engagementRate(cur),
      videoViews: nz(cur.videoViews),
      linkClicks: nz(cur.linkClicks),
      sessions: nz(cur.sessions),
      posts: nz(cur.posts),
      followers: nz(cur.followers),
      newFollowers: nz(cur.newFollowers),
      growth: followerGrowth(cur),
      deltaImpr: cur.impressions != null && old.impressions ? (cur.impressions - old.impressions) / old.impressions : null,
    },
  });

  sections.push({
    type: "table",
    title: `So sánh các brand — ${periodLabel(period)} so với ${periodLabel(prev)}`,
    columns: [
      { header: "Brand / sản phẩm", key: "brand", width: 22 },
      { header: "Impression", key: "i", format: "int", heat: true },
      { header: `Impression ${periodLabel(prev)}`, key: "ip", format: "int" },
      { header: "Δ %", key: "id", format: "pct" },
      { header: "Engagement", key: "e", format: "int" },
      { header: "Δ %", key: "ed", format: "pct" },
      { header: "ER", key: "er", format: "pct" },
      { header: "Follower", key: "f", format: "int", heat: true },
      { header: "Δ Follower", key: "fd", format: "int" },
    ],
    rows: brands
      .filter((b) => chOf(b.id).length)
      .map((b) => {
        const t = brandTotal(b.id, period);
        const p = brandTotal(b.id, prev);
        const d = (a: number | null | undefined, c: number | null | undefined) => (a != null && c ? (a - c) / c : null);
        return { brand: b.name, i: nz(t.impressions), ip: nz(p.impressions), id: d(t.impressions, p.impressions), e: nz(t.engagements), ed: d(t.engagements, p.engagements), er: engagementRate(t), f: nz(t.followers), fd: t.followers != null && p.followers != null ? t.followers - p.followers : null };
      }),
  });

  const withData = brands.filter((b) => (brandTotal(b.id, period).impressions ?? 0) > 0);
  if (withData.length) {
    sections.push({
      type: "bars",
      title: `Impression theo brand — ${periodLabel(period)}`,
      items: withData.map((b, i) => ({ label: b.name, value: brandTotal(b.id, period).impressions ?? 0, color: SERIES_COLORS[i % SERIES_COLORS.length] })).sort((a, b) => b.value - a.value),
    });
  }

  const trendPeriods = lastMonths(periods, period, 6);
  const active = brands.filter((b) => chOf(b.id).length);
  if (active.length && periods.length) {
    sections.push({
      type: "trend",
      title: "Impression theo tháng (tách theo brand)",
      periods: trendPeriods.map(periodLabel),
      mode: "stacked",
      series: active.map((b, i) => ({ label: b.name, color: SERIES_COLORS[i % SERIES_COLORS.length], values: trendPeriods.map((p) => nz(brandTotal(b.id, p).impressions)) })),
    });
    sections.push({
      type: "trend",
      title: "Follower cuối tháng (tách theo brand)",
      periods: trendPeriods.map(periodLabel),
      mode: "grouped",
      series: active.map((b, i) => ({ label: b.name, color: SERIES_COLORS[i % SERIES_COLORS.length], values: trendPeriods.map((p) => nz(brandTotal(b.id, p).followers)) })),
    });
  }

  // Ma trận KÊNH: brand nào dùng kênh nào (kênh cũ "Meta gộp" chỉ hiện nếu còn brand dùng)
  const channelCols = CHANNELS.filter((c) => !c.legacy || channels.some((x) => x.channel === c.key));
  sections.push({
    type: "table",
    title: "Hệ thống kênh của từng brand",
    note: "Số tài khoản đang sử dụng của từng brand trên mỗi nền tảng (● = số tài khoản; mỗi tài khoản có số liệu riêng trong ma trận ở trên).",
    columns: [
      { header: "Brand / sản phẩm", key: "brand", width: 22 },
      ...channelCols.map((c) => ({ header: c.short, key: c.key, align: "center" as const, width: 14 })),
    ],
    rows: brands.map((b) => {
      const row: Record<string, string | number | null> = { brand: b.name };
      for (const c of channelCols) {
        const n = chOf(b.id).filter((x) => x.channel === c.key && x.active).length;
        row[c.key] = n ? `● ${n}` : "";
      }
      return row;
    }),
  });
  sections.push({
    type: "table",
    title: "Chỉ số áp dụng theo loại kênh",
    columns: [{ header: "Chỉ số", key: "m", width: 22 }, ...channelCols.map((c) => ({ header: c.short, key: c.key, align: "center" as const, width: 12 }))],
    rows: METRICS.map((m) => {
      const row: Record<string, string | number | null> = { m: m.label };
      for (const c of channelCols) row[c.key] = CHANNEL_METRICS[c.key as ChannelKey].includes(m.key) ? "✓" : "–";
      return row;
    }),
  });

  return {
    kind: "brand",
    title: "Báo cáo Brand Performance",
    subtitle: "Chỉ số thương hiệu theo brand/sản phẩm × kênh",
    periodLabel: `Tháng ${period.slice(5)}/${period.slice(0, 4)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: o.userName,
    orientation: "landscape",
    sections,
    footnotes: [
      "Engagement rate (ER) = Engagement ÷ Impression. Tăng trưởng follower = Follower mới ÷ Follower đầu tháng. Số liệu nhập thủ công hằng tháng từ công cụ của từng kênh.",
      "Impression của TikTok = lượt xem; của Website = lượt hiển thị trên tìm kiếm. Follower của YouTube = subscriber.",
    ],
  };
}

// =====================================================================================
// 2) Growth Performance (Ads)
// =====================================================================================
async function buildGrowth(db: DB, o: BuildOptions): Promise<ReportDoc> {
  const [metricsRaw, plan, ecomRows, rubric, centers, adsReq, allUsers] = await Promise.all([
    listAdsMetrics(db),
    listAdsPlans(db),
    listEcomProducts(db),
    loadEffectivenessRubric(db),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")).orderBy(asc(sbus.code)),
    db.select().from(adsCampaigns).where(ne(adsCampaigns.line, "b2b")),
    db.select({ id: users.id, fullName: users.fullName }).from(users),
  ]);
  // Số tháng chưa có số chính thức được tự cộng từ các tuần (SPEC Phụ lục D mục 28) — cùng quy tắc với màn hình.
  const metrics = withDerivedMonths(metricsRaw as unknown as MetricRow[], todayVnDayStr());
  const units = buildAdsUnits(centers);
  const idx = indexRows(splitB2cOwn(metrics)); // Tổng cộng = cộng các khối (HO · FB chỉ còn phần page Tổng)
  const rowsIn = (ms: string[]) => bucketRows(idx, "month", ms);
  const dataMonths = [...new Set(metrics.filter((m) => m.periodType === "month").map((m) => m.period))].sort();

  // Kỳ báo cáo: 1 tháng (yyyy-mm) hoặc 1 quý (yyyy-Qn = cộng 3 dòng THÁNG).
  const isQuarter = !!o.period && /^\d{4}-Q[1-4]$/.test(o.period);
  const period = o.period ?? dataMonths.at(-1) ?? todayVnDayStr().slice(0, 7);
  const months = isQuarter ? quarterMonths(period) : [period];
  const prevMonths = isQuarter ? quarterMonths(prevQuarter(period)) : [prevMonth(period)];
  const label = isQuarter ? quarterLabel(period) : monthLabel(period);
  const prevLabel = isQuarter ? quarterLabel(prevQuarter(period)) : monthLabel(prevMonth(period), true);
  const rowsCur = rowsIn(months);
  const rowsOld = rowsIn(prevMonths);
  const cur = totalFunnel(rowsCur);
  const old = totalFunnel(rowsOld);
  const sections: ReportSection[] = [];
  const unitName = (u: AdsUnit) => u.code;

  const aS = arrow(cur.spend, old.spend, "down");
  const aL = arrow(cur.leads, old.leads);
  const aN = arrow(cur.hvm, old.hvm);
  const aC = arrow(cur.cpl, old.cpl, "down");
  sections.push({
    type: "kpis",
    items: [
      { label: "Tổng chi digital", value: vnMoneyShort(cur.spend), sub: aS.sub, tone: "brand" },
      { label: "Lead / Data (Ecom tính MQL)", value: vnInt(cur.leads), sub: aL.sub, tone: aL.tone },
      { label: "Học viên mới", value: vnInt(cur.hvm), sub: aN.sub, tone: aN.tone },
      { label: "CPL bình quân", value: vnMoneyShort(cur.cpl), sub: aC.sub, tone: aC.tone },
      { label: "CAC bình quân", value: vnMoneyShort(cur.cac), sub: `CVR lead → HVM: ${pctText(cur.cvr)}`, tone: "neutral" },
    ],
  });

  // So sánh các SBU (Hệ thống, trung tâm, Ecom, VMP, VMT chung một danh sách)
  const share = (v: number | null) => (cur.spend && v != null ? v / cur.spend : null);
  sections.push({
    type: "table",
    title: `So sánh các SBU — ${label}`,
    note: "Dòng Hệ thống mang Lead/HVM TỔNG cả B2C (CPL/CAC chia tổng ngân sách B2C); Lead/HVM của từng trung tâm là phần quy riêng cho ads ngân sách trung tâm (một phần của số tổng, không cộng thêm). Ecom tính MQL là lead. Số tháng nhập riêng, quý = cộng 3 tháng.",
    columns: [
      { header: "SBU", key: "unit", width: 24 },
      { header: "Chi tiêu (₫)", key: "spend", format: "money", heat: true },
      { header: "Tỷ trọng chi", key: "share", format: "pct" },
      { header: "Lead / MQL", key: "leads", format: "int" },
      { header: "Học viên mới", key: "hvm", format: "int" },
      { header: "CPL (₫)", key: "cpl", format: "money" },
      { header: "CAC (₫)", key: "cac", format: "money" },
      { header: "CVR", key: "cvr", format: "pct" },
      { header: `Δ chi vs ${prevLabel}`, key: "ds", format: "pct" },
    ],
    rows: units.map((u) => {
      const c = unitFunnel(rowsCur, u);
      const p = unitFunnel(rowsOld, u);
      return { unit: unitName(u), spend: nz(c.spend), share: share(c.spend), leads: nz(c.leads), hvm: nz(c.hvm), cpl: nz(c.cpl), cac: nz(c.cac), cvr: nz(c.cvr), ds: c.spend != null && p.spend ? (c.spend - p.spend) / p.spend : null };
    }),
    totals: { unit: "TỔNG DIGITAL", spend: nz(cur.spend), share: cur.spend ? 1 : null, leads: nz(cur.leads), hvm: nz(cur.hvm), cpl: nz(cur.cpl), cac: nz(cur.cac), cvr: nz(cur.cvr), ds: cur.spend != null && old.spend ? (cur.spend - old.spend) / old.spend : null },
  });

  const shares = units.map((u) => ({ label: unitName(u), value: unitFunnel(rowsCur, u).spend ?? 0 })).filter((x) => x.value > 0);
  if (shares.length) sections.push({ type: "bars", title: `Cơ cấu chi theo SBU — ${label}`, format: "money", items: shares.map((s, i) => ({ ...s, color: SERIES_COLORS[i % SERIES_COLORS.length] })).sort((a, b) => b.value - a.value) });

  // Hiệu quả ads ngân sách riêng từng trung tâm
  const centerRows = centers
    .map((c) => {
      const rows = rowsCur.filter((m) => m.line === "b2c_center" && m.sbuId === c.id);
      if (!rows.length) return null;
      const d = derive(aggregate(rows), "b2c_center", rubric);
      const sumOf = (f: (r: MetricRow) => string | null) => rows.reduce<number | null>((a, r) => (num(f(r)) == null ? a : (a ?? 0) + num(f(r))!), null);
      return { sbu: c.code, order: sumOf((r) => r.centerOrderBudget), topup: sumOf((r) => r.hoTopupBudget), spend: nz(d.spend), leads: nz(d.leads), hvm: nz(d.newStudents), cpl: nz(d.cpl), cac: nz(d.cac), cvr: nz(d.cvr), eff: d.effectivenessLabel };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (centerRows.length) {
    const sum = (f: (r: (typeof centerRows)[number]) => number | null) => centerRows.reduce((a, r) => a + (f(r) ?? 0), 0);
    sections.push({
      type: "table",
      title: `Ads ngân sách riêng từng trung tâm — ${label}`,
      note: "Lead/HVM ở đây là phần quy riêng cho ads ngân sách từng trung tâm (tập con của số tổng B2C).",
      columns: [
        { header: "Trung tâm", key: "sbu", width: 12 },
        { header: "NS TT order (₫)", key: "order", format: "money" },
        { header: "NS P.MKT thêm (₫)", key: "topup", format: "money" },
        { header: "Tổng NS (₫)", key: "spend", format: "money", heat: true },
        { header: "Lead", key: "leads", format: "int" },
        { header: "HVM", key: "hvm", format: "int", heat: true },
        { header: "CPL (₫)", key: "cpl", format: "money" },
        { header: "CAC (₫)", key: "cac", format: "money" },
        { header: "CVR", key: "cvr", format: "pct" },
        { header: "Hiệu quả", key: "eff", width: 18 },
      ],
      rows: centerRows,
      totals: { sbu: "Tổng", order: sum((r) => r.order), topup: sum((r) => r.topup), spend: sum((r) => r.spend), leads: sum((r) => r.leads), hvm: sum((r) => r.hvm) },
    });
  }

  // Ecom theo sản phẩm (kỳ bắt đầu nằm trong khoảng báo cáo)
  const ecomHere = (ecomRows as unknown as EcomProductRow[]).filter((r) => months.includes(r.period));
  if (ecomHere.length) {
    const rows = ECOM_PRODUCTS.map((p) => {
      const a = ecomAggregate(ecomHere.filter((r) => r.product === p.key));
      return a.spend == null && a.mql == null && a.newStudents == null ? null : { product: p.label, spend: nz(a.spend), mql: nz(a.mql), hv: nz(a.newStudents), revenue: nz(a.revenue), cpmql: nz(a.cpmql), cac: nz(a.cac), roas: a.roas };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const t = ecomAggregate(ecomHere);
    sections.push({
      type: "table",
      title: `Ecom theo sản phẩm — ${label}`,
      columns: [
        { header: "Sản phẩm", key: "product", width: 30 },
        { header: "Chi tiêu (₫)", key: "spend", format: "money", heat: true },
        { header: "MQL", key: "mql", format: "int" },
        { header: "Học viên", key: "hv", format: "int" },
        { header: "Doanh thu (₫)", key: "revenue", format: "money" },
        { header: "CP / MQL (₫)", key: "cpmql", format: "money" },
        { header: "CAC (₫)", key: "cac", format: "money" },
        { header: "ROAS", key: "roas", format: "dec1" },
      ],
      rows,
      totals: { product: "Tổng", spend: nz(t.spend), mql: nz(t.mql), hv: nz(t.newStudents), revenue: nz(t.revenue), cpmql: nz(t.cpmql), cac: nz(t.cac), roas: t.roas },
    });
  }

  // Request ads trong kỳ
  const reqHere = adsReq.filter((r) => months.includes(r.period));
  if (reqHere.length) {
    const labelOf = (r: { sbuId: string | null; line: string }) => {
      const u = units.find((x) => x.line === r.line && (x.kind === "center" ? x.sbuId === r.sbuId : true));
      return u ? unitName(u) : r.line;
    };
    const nameOf = new Map(allUsers.map((u) => [u.id, u.fullName]));
    const spendSum = reqHere.reduce((a, r) => a + Number(r.spend || 0), 0);
    const planSum = reqHere.reduce((a, r) => a + (num(r.plannedBudget) ?? 0), 0);
    sections.push({
      type: "table",
      title: `Request ads — ${label}`,
      note: "Mỗi dòng = 1 chiến dịch/request ads của 1 SBU; % KH = chi tiêu thực tế ÷ ngân sách kế hoạch.",
      columns: [
        { header: "SBU", key: "sbu", width: 16 },
        { header: "Chiến dịch / request", key: "name", width: 44 },
        { header: "Người chạy", key: "runner", width: 18 },
        { header: "NS kế hoạch (₫)", key: "plan", format: "money" },
        { header: "Chi tiêu (₫)", key: "spend", format: "money", heat: true },
        { header: "% KH", key: "used", format: "pct" },
        { header: "Mess", key: "mess", format: "int" },
        { header: "Chi phí / mess (₫)", key: "cpm", format: "money" },
      ],
      rows: reqHere
        .slice()
        .sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
        .map((r) => {
          const planned = num(r.plannedBudget);
          const mess = num(r.messages);
          return { sbu: labelOf(r), name: r.campaignName, runner: r.runnerId ? (nameOf.get(r.runnerId) ?? "") : "", plan: planned, spend: Number(r.spend || 0), used: planned ? Number(r.spend || 0) / planned : null, mess, cpm: mess ? Number(r.spend || 0) / mess : null };
        }),
      totals: { sbu: "Tổng", name: `${reqHere.length} request`, plan: planSum || null, spend: spendSum, used: planSum ? spendSum / planSum : null },
    });
  }

  // Kế hoạch so với thực tế theo SBU — chỉ so trên các tháng SBU đó ĐÃ lập ngân sách kế hoạch (cả hai vế cùng tập tháng)
  const planRows = units
    .map((u) => {
      const up = plan.filter((p) => p.line === u.line && months.includes(p.period) && p.plannedBudget != null && (u.kind === "center" ? p.sbuId === u.sbuId : !p.sbuId));
      if (!up.length) return null;
      const planned = up.reduce((acc, p) => acc + Number(p.plannedBudget), 0);
      const pm = up.map((p) => p.period);
      const rows = rowsOfUnit(rowsIn(pm), u);
      const actual = rows.length ? aggregate(rows).spend : null;
      return { unit: unitName(u), plan: planned || null, actual: nz(actual), pct: planned && actual != null ? actual / planned : null };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (planRows.length) {
    sections.push({
      type: "table",
      title: `Kế hoạch ngân sách so với thực tế — ${label}`,
      note: "Chỉ so trên các tháng SBU đó đã lập kế hoạch.",
      columns: [
        { header: "SBU", key: "unit", width: 26 },
        { header: "Kế hoạch (₫)", key: "plan", format: "money" },
        { header: "Thực tế (₫)", key: "actual", format: "money", heat: true },
        { header: "% đã dùng", key: "pct", format: "pct" },
      ],
      rows: planRows,
    });
  }

  // Xu hướng: 6 tháng gần nhất (hoặc 4 quý khi báo cáo theo quý) — tổng mọi SBU
  const buckets = isQuarter
    ? [...new Set([...dataMonths.map(quarterKey), period])].filter((q) => q <= period).sort().slice(-4).map((q) => ({ label: quarterLabel(q), months: quarterMonths(q) }))
    : lastMonths(dataMonths, period, 6).map((p) => ({ label: monthLabel(p), months: [p] }));
  const trendTotals = buckets.map((b) => totalFunnel(rowsIn(b.months)));
  sections.push({
    type: "trend",
    title: isQuarter ? "Tổng chi theo quý" : "Tổng chi theo tháng",
    note: "Tổng mọi SBU.",
    format: "money",
    periods: buckets.map((b) => b.label),
    mode: "grouped",
    series: [{ label: "Tổng chi", color: SERIES_COLORS[0], values: trendTotals.map((t) => nz(t.spend)) }],
  });
  sections.push({
    type: "trend",
    title: isQuarter ? "Lead và học viên mới theo quý" : "Lead và học viên mới theo tháng",
    note: "Tổng mọi SBU (B2C lấy số tổng của dòng Hệ thống; Ecom tính MQL).",
    periods: buckets.map((b) => b.label),
    mode: "grouped",
    series: [
      { label: "Lead / MQL", color: SERIES_COLORS[0], values: trendTotals.map((t) => nz(t.leads)) },
      { label: "Học viên mới", color: SERIES_COLORS[2 % SERIES_COLORS.length], values: trendTotals.map((t) => nz(t.hvm)) },
    ],
  });

  return {
    kind: "growth",
    title: "Báo cáo Growth Performance",
    subtitle: "Hiệu quả quảng cáo & tăng trưởng (Ads) theo SBU: chi tiêu, lead, học viên mới, CPL, CAC",
    periodLabel: isQuarter ? `Quý ${period.slice(6)}/${period.slice(0, 4)}` : `Tháng ${period.slice(5)}/${period.slice(0, 4)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: o.userName,
    orientation: "landscape",
    sections,
    footnotes: [
      "CPL = Chi tiêu ÷ Lead; CAC = Chi tiêu ÷ Học viên mới; CVR = Học viên mới ÷ Lead — chỉ chia chi phí của phần đã có số Lead/HVM. Điểm hiệu quả theo ngưỡng CPL/CAC cấu hình ở Cài đặt.",
      "B2C Offline: Lead/HVM tổng nằm ở dòng Hệ thống (tính chung Hệ thống + trung tâm); số quy riêng từng trung tâm là tập con của số tổng. Quý = cộng 3 dòng tháng. Ô tháng chưa có số chính thức được tạm tính từ các tuần (mỗi tuần tính nguyên vẹn vào tháng chiếm nhiều ngày nhất).",
    ],
  };
}

// =====================================================================================
// 3) SBU
// =====================================================================================
async function buildSbu(db: DB, o: BuildOptions): Promise<ReportDoc> {
  const today = todayVnDayStr();
  const rows = await db
    .select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind, region: sbus.region, hoOwnerId: sbus.hoOwnerId, ownerName: users.fullName })
    .from(sbus)
    .leftJoin(users, eq(users.id, sbus.hoOwnerId))
    .where(eq(sbus.active, true))
    .orderBy(asc(sbus.code));
  const { stats } = await getSbuStats(db, today, new Set(rows.filter(isFanOutSbu).map((r) => r.id)));
  const st = (id: string) => stats.get(id);
  const pct = (a: number, b: number) => (b > 0 ? a / b : null);
  const centersList = rows.filter((r) => r.kind !== "brand");
  const brandList = rows.filter((r) => r.kind === "brand");
  const sum = (list: typeof rows, f: (s: NonNullable<ReturnType<typeof st>>) => number) => list.reduce((a, r) => a + (st(r.id) ? f(st(r.id)!) : 0), 0);

  const sections: ReportSection[] = [
    {
      type: "kpis",
      items: [
        { label: "SBU đang hoạt động", value: String(rows.length), sub: `${centersList.length} trung tâm · ${brandList.length} brand/sản phẩm`, tone: "brand" },
        { label: "Task trễ hạn", value: String(sum(rows, (s) => s.taskOverdue)), sub: `trên ${sum(rows, (s) => s.taskTotal)} task gắn SBU`, tone: sum(rows, (s) => s.taskOverdue) ? "bad" : "good" },
        { label: "Request đang mở", value: String(sum(rows, (s) => s.requestsOpen)), tone: "neutral" },
        { label: "Giám sát quá hạn", value: String(sum(rows, (s) => s.monitoringOverdue)), sub: `${sum(rows, (s) => s.monitoringDueSoon)} sắp đến hạn`, tone: sum(rows, (s) => s.monitoringOverdue) ? "bad" : "good" },
      ],
    },
  ];

  const common = (r: (typeof rows)[number]) => {
    const s = st(r.id);
    return {
      code: r.code,
      name: r.name,
      owner: r.ownerName ?? "",
      campaigns: s?.campaigns ?? 0,
      taskDone: s?.taskDone ?? 0,
      taskTotal: s?.taskTotal ?? 0,
      taskPct: s ? pct(s.taskDone, s.taskTotal) : null,
      overdue: s?.taskOverdue ?? 0,
      requests: s?.requestsOpen ?? 0,
    };
  };
  sections.push({
    type: "table",
    title: "Trung tâm",
    columns: [
      { header: "Mã", key: "code", width: 10 },
      { header: "Tên", key: "name", width: 26 },
      { header: "Khu vực", key: "region", width: 14 },
      { header: "HO phụ trách", key: "owner", width: 16 },
      { header: "Campaign", key: "campaigns", format: "int" },
      { header: "Task xong", key: "taskDone", format: "int" },
      { header: "Tổng task", key: "taskTotal", format: "int" },
      { header: "Tiến độ task", key: "taskPct", format: "pct", heat: true },
      { header: "Task trễ hạn", key: "overdue", format: "int", heat: true },
      { header: "Hạng mục kỳ này", key: "items", format: "pct" },
      { header: "Request mở", key: "requests", format: "int" },
      { header: "Giám sát quá hạn", key: "monOver", format: "int" },
      { header: "Giám sát sắp hạn", key: "monSoon", format: "int" },
    ],
    rows: centersList.map((r) => {
      const s = st(r.id);
      return { ...common(r), region: `${SBU_KIND_LABEL[r.kind] ?? r.kind} · ${SBU_REGION_LABEL[r.region] ?? r.region}`, items: s ? pct(s.itemsDone, s.itemsApplicable) : null, monOver: s?.monitoringOverdue ?? 0, monSoon: s?.monitoringDueSoon ?? 0 };
    }),
  });
  sections.push({
    type: "table",
    title: "Brand / sản phẩm",
    note: "Chỉ số brand lấy từ Brand Performance (tháng gần nhất có báo cáo).",
    columns: [
      { header: "Mã", key: "code", width: 12 },
      { header: "Tên", key: "name", width: 24 },
      { header: "HO phụ trách", key: "owner", width: 16 },
      { header: "Campaign", key: "campaigns", format: "int" },
      { header: "Task xong", key: "taskDone", format: "int" },
      { header: "Tổng task", key: "taskTotal", format: "int" },
      { header: "Tiến độ task", key: "taskPct", format: "pct", heat: true },
      { header: "Task trễ hạn", key: "overdue", format: "int", heat: true },
      { header: "Tháng báo cáo brand", key: "bp", width: 14 },
      { header: "Impression", key: "imp", format: "int" },
      { header: "ER", key: "er", format: "pct" },
      { header: "Follower", key: "fol", format: "int" },
    ],
    rows: brandList.map((r) => {
      const s = st(r.id);
      return { ...common(r), bp: s?.brandPeriod ? periodLabel(s.brandPeriod) : "", imp: s?.brandImpressions ?? null, er: s?.brandImpressions ? (s.brandEngagements ?? 0) / s.brandImpressions : null, fol: s?.brandFollowers ?? null };
    }),
  });

  const overdueBars = rows.map((r) => ({ label: r.code, value: st(r.id)?.taskOverdue ?? 0 })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  if (overdueBars.length) sections.push({ type: "bars", title: "Task trễ hạn theo SBU", items: overdueBars.map((b) => ({ ...b, color: BRAND_COLORS.red })) });

  // Campaign theo SBU
  const links = await db
    .select({ sbuId: campaignSbus.sbuId, campaignId: campaignSbus.campaignId })
    .from(campaignSbus)
    .innerJoin(campaigns, and(eq(campaigns.id, campaignSbus.campaignId), isNull(campaigns.deletedAt)));
  if (links.length) {
    const cids = [...new Set(links.map((l) => l.campaignId))];
    const [camps, taskRows, owners] = await Promise.all([
      db.select().from(campaigns).where(inArray(campaigns.id, cids)),
      db
        .select({ campaignId: tasks.campaignId, status: tasks.status, overdue: overdueSqlFragment(today) })
        .from(tasks)
        .where(and(isNull(tasks.deletedAt), inArray(tasks.campaignId, cids))),
      db.select({ id: users.id, fullName: users.fullName }).from(users),
    ]);
    void taskRows;
    const taskStat = new Map<string, { total: number; done: number }>();
    for (const t of taskRows) {
      const a = taskStat.get(t.campaignId!) ?? { total: 0, done: 0 };
      a.total++;
      if (t.status === "done" || t.status === "cancelled") a.done++;
      taskStat.set(t.campaignId!, a);
    }
    const ownerName = new Map(owners.map((u) => [u.id, u.fullName]));
    const campById = new Map(camps.map((c) => [c.id, c]));
    const codeOf = new Map(rows.map((r) => [r.id, r.code]));
    const body: TableSection["rows"] = [];
    for (const r of rows) {
      const mine = links.filter((l) => l.sbuId === r.id).map((l) => campById.get(l.campaignId)).filter((c): c is NonNullable<typeof c> => !!c && c.status !== "cancelled");
      mine.sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (const c of mine) {
        const t = taskStat.get(c.id);
        body.push({ sbu: codeOf.get(r.id) ?? "", code: c.code, name: c.name, type: CAMPAIGN_TYPE[c.type] ?? c.type, owner: c.ownerId ? (ownerName.get(c.ownerId) ?? "") : "Chưa có owner", status: CAMPAIGN_STATUS[c.status] ?? c.status, start: fmtDate(c.startDate), end: fmtDate(c.endDate), pct: t && t.total ? t.done / t.total : null });
      }
    }
    sections.push({
      type: "table",
      title: "Campaign theo SBU",
      note: "Campaign gắn trực tiếp với SBU (brand/sản phẩm hoặc trung tâm), bỏ campaign đã huỷ.",
      columns: [
        { header: "SBU", key: "sbu", width: 12 },
        { header: "Mã", key: "code", width: 14 },
        { header: "Campaign", key: "name", width: 46 },
        { header: "Loại", key: "type", width: 20 },
        { header: "Owner", key: "owner", width: 18 },
        { header: "Trạng thái", key: "status", width: 16 },
        { header: "Bắt đầu", key: "start", format: "date" },
        { header: "Kết thúc", key: "end", format: "date" },
        { header: "Tiến độ", key: "pct", format: "pct", heat: true },
      ],
      rows: body,
    });
  }
  void TASK_TYPE;

  return {
    kind: "sbu",
    title: "Báo cáo SBU",
    subtitle: "Tổng quan trung tâm và brand/sản phẩm: campaign, task, hạng mục, request, giám sát",
    periodLabel: `Tính đến ${fmtDate(today)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: o.userName,
    orientation: "landscape",
    sections,
    footnotes: ["SBU gồm trung tâm (offline/online) và brand/sản phẩm (VMG, VMG IELTS, VMG TESOL, VMG Tiếng Trung, VMP, VMT, UpLearn). Mọi con số suy ra tại thời điểm xuất."],
  };
}

// =====================================================================================
// 4) Báo cáo quản lý (Dashboard)
// =====================================================================================
async function buildManagement(db: DB, o: BuildOptions): Promise<ReportDoc> {
  const period = o.period ?? todayVnDayStr().slice(0, 7);
  const m = await computeManagementMetrics(db, period);
  const totalOverdue = m.overdueByPerson.reduce((a, b) => a + b.count, 0);
  const campaignsRunning = m.campaignProgress.length;
  const sections: ReportSection[] = [
    {
      type: "kpis",
      items: [
        { label: "Task trễ hạn", value: String(totalOverdue), sub: `${m.overdueByPerson.length} người đang có việc trễ`, tone: totalOverdue ? "bad" : "good" },
        { label: "Campaign đang theo dõi", value: String(campaignsRunning), sub: `${m.campaignProgress.filter((c) => c.overdue > 0).length} campaign có task trễ`, tone: "brand" },
        { label: "Request", value: String(m.requestStats.total), sub: `${m.requestStats.inProgress} đang làm · ${m.requestStats.done} xong`, tone: "neutral" },
        { label: "Request quá hạn", value: String(m.requestStats.overdue), tone: m.requestStats.overdue ? "bad" : "good" },
      ],
    },
    {
      type: "table",
      title: "Tiến độ campaign",
      columns: [
        { header: "Mã", key: "code", width: 14 },
        { header: "Campaign", key: "name", width: 48 },
        { header: "Trạng thái", key: "status", width: 16 },
        { header: "Task xong", key: "done", format: "int" },
        { header: "Tổng task", key: "total", format: "int" },
        { header: "Task trễ hạn", key: "overdue", format: "int", heat: true },
        { header: "Tiến độ", key: "pct", format: "pct", heat: true },
      ],
      rows: m.campaignProgress.map((c) => ({ code: c.code, name: c.name, status: CAMPAIGN_STATUS[c.status] ?? c.status, done: c.done, total: c.total, overdue: c.overdue, pct: c.total ? c.done / c.total : null })),
    },
    {
      type: "table",
      title: `Hạng mục SBU kỳ ${period.slice(5)}/${period.slice(0, 4)}`,
      columns: [
        { header: "SBU", key: "code", width: 12 },
        { header: "Tên", key: "name", width: 28 },
        { header: "Hạng mục xong", key: "done", format: "int" },
        { header: "Tổng hạng mục", key: "total", format: "int" },
        { header: "Hoàn thành", key: "pct", format: "pct", heat: true },
      ],
      rows: m.sbuRows.map((s) => ({ code: s.code, name: s.name, done: s.done, total: s.totalCatalogItems, pct: s.totalCatalogItems ? s.done / s.totalCatalogItems : null })),
    },
  ];
  if (m.overdueByPerson.length) sections.push({ type: "bars", title: "Task trễ hạn theo người", items: m.overdueByPerson.map((p) => ({ label: p.name, value: p.count, color: BRAND_COLORS.red })) });
  if (m.onTimeByPerson.length)
    sections.push({
      type: "table",
      title: "Tỷ lệ đúng hạn theo người (tháng)",
      columns: [{ header: "Người phụ trách", key: "name", width: 26 }, { header: "Task xong", key: "total", format: "int" }, { header: "Đúng hạn", key: "pct", format: "pct", heat: true }],
      rows: m.onTimeByPerson.map((p) => ({ name: p.name, total: p.total, pct: p.pct / 100 })),
    });
  if (m.onTimeByType.length)
    sections.push({
      type: "table",
      title: "Tỷ lệ đúng hạn theo loại task (tháng)",
      columns: [{ header: "Loại task", key: "type", width: 26 }, { header: "Task xong", key: "total", format: "int" }, { header: "Đúng hạn", key: "pct", format: "pct", heat: true }],
      rows: m.onTimeByType.map((p) => ({ type: TASK_TYPE[p.type] ?? p.type, total: p.total, pct: p.pct / 100 })),
    });
  if (m.recurringOnTime.length)
    sections.push({
      type: "table",
      title: "Việc lặp: tỷ lệ đúng hạn",
      columns: [{ header: "Quy tắc lặp", key: "rule", width: 46 }, { header: "Số lần xong", key: "total", format: "int" }, { header: "Đúng hạn", key: "pct", format: "pct", heat: true }],
      rows: m.recurringOnTime.map((p) => ({ rule: p.ruleName, total: p.total, pct: p.pct / 100 })),
    });

  return {
    kind: "management",
    title: "Báo cáo quản lý Marketing",
    subtitle: "Sức khoẻ vận hành của phòng: việc trễ hạn, tiến độ campaign, hạng mục SBU, request",
    periodLabel: `Tháng ${period.slice(5)}/${period.slice(0, 4)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: o.userName,
    orientation: "portrait",
    sections,
    footnotes: ["Tỷ lệ đúng hạn tính trên task hoàn thành trong tháng (so ngày hoàn thành với hạn). Số liệu suy ra tại thời điểm xuất."],
  };
}

export async function buildReport(db: DB, kind: ReportKind, o: BuildOptions): Promise<ReportDoc> {
  switch (kind) {
    case "brand":
      return buildBrand(db, o);
    case "growth":
      return buildGrowth(db, o);
    case "sbu":
      return buildSbu(db, o);
    case "management":
      return buildManagement(db, o);
  }
}

void isNull;
void CHANNEL_LABEL;
