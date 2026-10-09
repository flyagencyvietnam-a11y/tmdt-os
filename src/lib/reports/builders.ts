import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { adsCampaigns, campaignSbus, campaigns, sbus, tasks, users } from "@/lib/db/schema";
import { CHANNEL_LABEL, CHANNEL_METRICS, CHANNELS, engagementRate, followerGrowth, METRICS, periodLabel, prevPeriod, sameChannel, sumValues, valuesOf, type ChannelKey, type MetricValues } from "@/lib/brand-perf";
import { ECOM_PRODUCTS } from "@/lib/ads-metrics";
import { SBU_KIND_LABEL, SBU_REGION_LABEL, isFanOutSbu } from "@/lib/sbu-kinds";
import { fmtDate } from "@/lib/format";
import { ADS_GROUPS } from "@/lib/ads-lines";
import { listAdsMetrics, listAdsPlans, listEcomProducts, loadEffectivenessRubric } from "@/lib/services/ads";
import { listBrandPerf, listBrandSbus } from "@/lib/services/brand-perf";
import { computeManagementMetrics } from "@/lib/services/reports";
import { getSbuStats } from "@/lib/services/sbu-overview";
import { overdueSqlFragment } from "@/lib/services/tasks";
import { todayVnDayStr } from "@/lib/time";
import { ecomAggregate, overviewAgg, overviewTotal, OVERVIEW_KEYS, OVERVIEW_LABELS, type EcomProductRow } from "@/app/(app)/ads/rollups";
import { aggregate, derive, LINE_LABELS, monthLabel, num, prevMonth, spendOf, type MetricRow } from "@/app/(app)/ads/shared";
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
    db.select({ id: sbus.id, code: sbus.code }).from(sbus).where(eq(sbus.kind, "center")).orderBy(asc(sbus.code)),
    db.select().from(adsCampaigns),
    db.select({ id: users.id, fullName: users.fullName }).from(users),
  ]);
  const metrics = metricsRaw as unknown as MetricRow[];
  const months = [...new Set(metrics.filter((m) => m.periodType === "month").map((m) => m.period))].sort();
  const period = o.period ?? months.at(-1) ?? todayVnDayStr().slice(0, 7);
  const prev = prevMonth(period);
  const cur = overviewTotal(metrics, [period]);
  const old = overviewTotal(metrics, [prev]);
  const sections: ReportSection[] = [];

  const aS = arrow(cur.spend, old.spend, "down");
  const aL = arrow(cur.leads, old.leads);
  const aN = arrow(cur.newStudents, old.newStudents);
  const aC = arrow(cur.cpl, old.cpl, "down");
  sections.push({
    type: "kpis",
    items: [
      { label: "Tổng chi digital", value: vnMoneyShort(cur.spend), sub: aS.sub, tone: "brand" },
      { label: "Lead / Data (Ecom tính MQL)", value: vnInt(cur.leads), sub: aL.sub, tone: aL.tone },
      { label: "Học viên mới", value: vnInt(cur.newStudents), sub: aN.sub, tone: aN.tone },
      { label: "CPL bình quân", value: vnMoneyShort(cur.cpl), sub: aC.sub, tone: aC.tone },
      { label: "CAC bình quân", value: vnMoneyShort(cur.cac), sub: `CVR lead → HVM: ${pctText(cur.cvr)}`, tone: "neutral" },
    ],
  });

  const share = (v: number | null) => (cur.spend && v != null ? v / cur.spend : null);
  sections.push({
    type: "table",
    title: `So sánh các mảng — ${monthLabel(period)}`,
    note: "B2C Offline = Hệ thống + Trung tâm (lead/HVM tính chung). Ecom tính MQL là lead. Số tháng nhập riêng, không cộng từ các tuần.",
    columns: [
      { header: "Mảng", key: "line", width: 24 },
      { header: "Chi tiêu (₫)", key: "spend", format: "money", heat: true },
      { header: "Tỷ trọng chi", key: "share", format: "pct" },
      { header: "Lead / MQL", key: "leads", format: "int" },
      { header: "Học viên mới", key: "hvm", format: "int" },
      { header: "CPL (₫)", key: "cpl", format: "money" },
      { header: "CAC (₫)", key: "cac", format: "money" },
      { header: "CVR", key: "cvr", format: "pct" },
      { header: `Δ chi vs ${monthLabel(prev, true)}`, key: "ds", format: "pct" },
    ],
    rows: OVERVIEW_KEYS.map((k) => {
      const c = overviewAgg(metrics, k, [period]);
      const p = overviewAgg(metrics, k, [prev]);
      return { line: OVERVIEW_LABELS[k], spend: nz(c.spend), share: share(c.spend), leads: nz(c.leads), hvm: nz(c.newStudents), cpl: nz(c.cpl), cac: nz(c.cac), cvr: nz(c.cvr), ds: c.spend != null && p.spend ? (c.spend - p.spend) / p.spend : null };
    }),
    totals: { line: "TỔNG DIGITAL", spend: nz(cur.spend), share: cur.spend ? 1 : null, leads: nz(cur.leads), hvm: nz(cur.newStudents), cpl: nz(cur.cpl), cac: nz(cur.cac), cvr: nz(cur.cvr), ds: cur.spend != null && old.spend ? (cur.spend - old.spend) / old.spend : null },
  });

  const shares = OVERVIEW_KEYS.map((k) => ({ label: OVERVIEW_LABELS[k], value: overviewAgg(metrics, k, [period]).spend ?? 0 })).filter((x) => x.value > 0);
  if (shares.length) sections.push({ type: "bars", title: `Cơ cấu chi theo mảng — ${monthLabel(period)}`, format: "money", items: shares.map((s, i) => ({ ...s, color: SERIES_COLORS[i % SERIES_COLORS.length] })).sort((a, b) => b.value - a.value) });

  // B2C theo trung tâm
  const centerRows = centers
    .map((c) => {
      const rows = metrics.filter((m) => m.periodType === "month" && m.line === "b2c_center" && m.period === period && m.sbuId === c.id);
      if (!rows.length) return null;
      const d = derive(aggregate(rows), "b2c_center", rubric);
      const r0 = rows[0];
      return { sbu: c.code, order: num(r0.centerOrderBudget), topup: num(r0.hoTopupBudget), spend: nz(d.spend), leads: nz(d.leads), hvm: nz(d.newStudents), cpl: nz(d.cpl), cac: nz(d.cac), cvr: nz(d.cvr), eff: d.effectivenessLabel };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (centerRows.length) {
    const sum = (f: (r: (typeof centerRows)[number]) => number | null) => centerRows.reduce((a, r) => a + (f(r) ?? 0), 0);
    sections.push({
      type: "table",
      title: `B2C Trung tâm theo từng trung tâm — ${monthLabel(period)}`,
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

  // Ecom theo sản phẩm (kỳ bắt đầu = period)
  const ecomHere = (ecomRows as unknown as EcomProductRow[]).filter((r) => r.period === period);
  if (ecomHere.length) {
    const rows = ECOM_PRODUCTS.map((p) => {
      const a = ecomAggregate(ecomHere.filter((r) => r.product === p.key));
      return a.spend == null && a.mql == null && a.newStudents == null ? null : { product: p.label, spend: nz(a.spend), mql: nz(a.mql), hv: nz(a.newStudents), revenue: nz(a.revenue), cpmql: nz(a.cpmql), cac: nz(a.cac), roas: a.roas };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const t = ecomAggregate(ecomHere);
    sections.push({
      type: "table",
      title: `Ecom theo sản phẩm — ${monthLabel(period)}`,
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

  // Request ads của tháng
  const reqHere = adsReq.filter((r) => r.period === period);
  if (reqHere.length) {
    const codeOf = new Map((await db.select({ id: sbus.id, code: sbus.code }).from(sbus)).map((s) => [s.id, s.code]));
    const labelOf = (r: { sbuId: string | null; line: string }) => (r.sbuId ? (codeOf.get(r.sbuId) ?? "?") : (LINE_LABELS[r.line as keyof typeof LINE_LABELS] ?? r.line));
    const nameOf = new Map(allUsers.map((u) => [u.id, u.fullName]));
    const spendSum = reqHere.reduce((a, r) => a + Number(r.spend || 0), 0);
    const planSum = reqHere.reduce((a, r) => a + (num(r.plannedBudget) ?? 0), 0);
    sections.push({
      type: "table",
      title: `Request ads — ${monthLabel(period)}`,
      note: "Mỗi dòng = 1 chiến dịch/request ads (trung tâm hoặc mảng); % KH = chi tiêu thực tế ÷ ngân sách kế hoạch.",
      columns: [
        { header: "Mảng / SBU", key: "sbu", width: 16 },
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
          const plan = num(r.plannedBudget);
          const mess = num(r.messages);
          return { sbu: labelOf(r), name: r.campaignName, runner: r.runnerId ? (nameOf.get(r.runnerId) ?? "") : "", plan, spend: Number(r.spend || 0), used: plan ? Number(r.spend || 0) / plan : null, mess, cpm: mess ? Number(r.spend || 0) / mess : null };
        }),
      totals: { sbu: "Tổng", name: `${reqHere.length} request`, plan: planSum || null, spend: spendSum, used: planSum ? spendSum / planSum : null },
    });
  }

  // Kế hoạch so với thực tế theo mảng (kế hoạch = Σ ngân sách KH các dòng của mảng trong tháng)
  const planHere = plan.filter((p) => p.period === period && p.plannedBudget != null);
  if (planHere.length) {
    const planRows = ADS_GROUPS.map((g) => {
      const planned = planHere.filter((p) => g.lines.includes(p.line)).reduce((acc, p) => acc + Number(p.plannedBudget), 0);
      const actual = aggregate(metrics.filter((m) => m.periodType === "month" && g.lines.includes(m.line) && m.period === period)).spend;
      return { line: g.label, plan: planned || null, actual: nz(actual), pct: planned && actual != null ? actual / planned : null };
    }).filter((r) => r.plan != null);
    sections.push({
      type: "table",
      title: `Kế hoạch ngân sách so với thực tế — ${monthLabel(period)}`,
      columns: [
        { header: "Mảng", key: "line", width: 26 },
        { header: "Kế hoạch (₫)", key: "plan", format: "money" },
        { header: "Thực tế (₫)", key: "actual", format: "money", heat: true },
        { header: "% đã dùng", key: "pct", format: "pct" },
      ],
      rows: planRows,
    });
  }

  const tp = lastMonths(months, period, 6);
  sections.push({
    type: "trend",
    title: "Chi tiêu theo tháng (tách theo mảng)",
    format: "money",
    periods: tp.map((p) => monthLabel(p)),
    mode: "stacked",
    series: OVERVIEW_KEYS.map((k, i) => ({ label: OVERVIEW_LABELS[k], color: SERIES_COLORS[i % SERIES_COLORS.length], values: tp.map((p) => nz(overviewAgg(metrics, k, [p]).spend)) })),
  });
  sections.push({
    type: "trend",
    title: "Học viên mới theo tháng (tách theo mảng)",
    periods: tp.map((p) => monthLabel(p)),
    mode: "stacked",
    series: OVERVIEW_KEYS.map((k, i) => ({ label: OVERVIEW_LABELS[k], color: SERIES_COLORS[i % SERIES_COLORS.length], values: tp.map((p) => nz(overviewAgg(metrics, k, [p]).newStudents)) })),
  });
  void spendOf;

  return {
    kind: "growth",
    title: "Báo cáo Growth Performance",
    subtitle: "Hiệu quả quảng cáo & tăng trưởng (Ads): chi tiêu, lead, học viên mới, CPL, CAC",
    periodLabel: `Tháng ${period.slice(5)}/${period.slice(0, 4)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: o.userName,
    orientation: "landscape",
    sections,
    footnotes: [
      "CPL = Chi tiêu ÷ Lead; CAC = Chi tiêu ÷ Học viên mới; CVR = Học viên mới ÷ Lead. Điểm hiệu quả theo ngưỡng CPL/CAC cấu hình ở Cài đặt.",
      "B2C Offline: Lead/HVM tổng tính chung cho Hệ thống + Trung tâm; số quy riêng từng trung tâm là tập con của số tổng.",
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
