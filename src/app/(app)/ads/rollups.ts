import { aggregate, LINE_COLORS, LINE_LABELS, monthLabel, num, spendOf, type MetricRow } from "./shared";

/**
 * Các phép tổng hợp THUẦN (không React, không DB) của trang Ads: quý, B2C gộp
 * Hệ thống + Trung tâm, tổng quan 5 mảng, Ecom theo sản phẩm. Mọi số liệu quý/
 * tháng ở đây đều cộng từ các dòng THÁNG — dữ liệu tuần có chu kỳ tính khác nên
 * KHÔNG BAO GIỜ được cộng thành tháng.
 */

const sumNullable = (vals: (number | null)[]): number | null => vals.reduce<number | null>((a, v) => (v == null ? a : (a ?? 0) + v), null);
const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);

// ---------------------------------------------------------------------------
// Quý
// ---------------------------------------------------------------------------

/** "2026-09" → "2026-Q3". */
export function quarterKey(month: string): string {
  return `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
}
export function quarterMonths(q: string): string[] {
  const y = q.slice(0, 4);
  const n = Number(q.slice(6, 7));
  return [0, 1, 2].map((i) => `${y}-${String((n - 1) * 3 + i + 1).padStart(2, "0")}`);
}
/** "2026-Q3" → "Q3/2026" (hoặc "Q3" khi short). */
export function quarterLabel(q: string, short = false): string {
  return short ? `Q${q.slice(6, 7)}` : `Q${q.slice(6, 7)}/${q.slice(0, 4)}`;
}
export function prevQuarter(q: string): string {
  const y = Number(q.slice(0, 4));
  const n = Number(q.slice(6, 7));
  return n === 1 ? `${y - 1}-Q4` : `${y}-Q${n - 1}`;
}

// ---------------------------------------------------------------------------
// B2C Offline = Hệ thống (HO chạy chung) + Trung tâm (ngân sách riêng từng TT)
//
// Sheet "Tổng hợp" mục 1+2: Lead/HVM là số TỔNG của cả hai mục cộng lại (không
// tách). Báo cáo ads Q3 (từ T7/2026) bổ sung số Lead/HVM quy RIÊNG cho ads
// ngân sách từng trung tâm — là TẬP CON của số tổng, để đo chất lượng ads TT.
//   - Lead/HVM tổng : dòng tháng line=b2c_system  (cột leads/newStudents)
//   - Lead/HVM TT   : các dòng tháng line=b2c_center (theo từng SBU)
// ---------------------------------------------------------------------------

interface Funnel {
  spend: number | null;
  leads: number | null;
  newStudents: number | null;
  cpl: number | null;
  cac: number | null;
  cvr: number | null;
}

export interface B2cSummary {
  /** NS Hệ thống (Mục 1 — P.Marketing chạy chung). */
  systemSpend: number | null;
  /** NS Trung tâm (Mục 2 — TT order + P.MKT chạy thêm, cộng mọi TT). */
  centerSpend: number | null;
  totalSpend: number | null;
  /** Lead / HVM TỔNG của cả B2C offline. */
  leads: number | null;
  newStudents: number | null;
  cpl: number | null;
  cac: number | null;
  cvr: number | null;
  /** Số tháng đã có số Lead/HVM quy riêng cho ads từng TT (từ T7/2026). */
  attributedMonths: number;
  /** Ads ngân sách riêng từng TT — chỉ tính các tháng đã có số quy riêng. */
  center: Funnel;
  /** Phần còn lại = tổng − TT (Hệ thống + nguồn khác) — SUY RA, chỉ trên tháng có đủ cả hai số. */
  rest: Funnel;
  /** Tháng mà số TT quy riêng LỚN HƠN số tổng — nhập sai/thiếu, cần kiểm tra. */
  inconsistentMonths: string[];
}

const funnel = (spend: number | null, leads: number | null, newStudents: number | null): Funnel => ({
  spend,
  leads,
  newStudents,
  cpl: ratio(spend, leads),
  cac: ratio(spend, newStudents),
  cvr: ratio(newStudents, leads),
});

/** Tổng hợp B2C cho 1 hoặc nhiều THÁNG (`periods`) từ mọi dòng tháng của b2c_system + b2c_center. */
export function b2cSummary(rows: MetricRow[], periods: string[]): B2cSummary {
  const monthly = rows.filter((r) => r.periodType === "month" && periods.includes(r.period));
  const per = periods.map((p) => {
    const sys = monthly.filter((r) => r.period === p && r.line === "b2c_system");
    const ctr = monthly.filter((r) => r.period === p && r.line === "b2c_center");
    const ctrAgg = aggregate(ctr);
    return {
      p,
      systemSpend: sumNullable(sys.map((r) => spendOf(r))),
      centerSpend: ctrAgg.spend,
      leads: sumNullable(sys.map((r) => num(r.leads))),
      newStudents: sumNullable(sys.map((r) => num(r.newStudents))),
      centerLeads: ctrAgg.leads,
      centerNewStudents: ctrAgg.newStudents,
    };
  });

  const systemSpend = sumNullable(per.map((x) => x.systemSpend));
  const centerSpend = sumNullable(per.map((x) => x.centerSpend));
  const totalSpend = sumNullable([systemSpend, centerSpend]);
  const monthSpend = (x: (typeof per)[number]) => sumNullable([x.systemSpend, x.centerSpend]);
  const leads = sumNullable(per.map((x) => x.leads));
  const newStudents = sumNullable(per.map((x) => x.newStudents));
  // CPL/CAC chỉ chia chi phí của những tháng ĐÃ nhập Lead/HVM (tháng thiếu số không kéo lệch).
  const cpl = ratio(sumNullable(per.filter((x) => x.leads != null).map(monthSpend)), leads);
  const cac = ratio(sumNullable(per.filter((x) => x.newStudents != null).map(monthSpend)), newStudents);

  const attributed = per.filter((x) => x.centerLeads != null || x.centerNewStudents != null);
  const comparable = attributed.filter((x) => x.leads != null && x.newStudents != null);

  return {
    systemSpend,
    centerSpend,
    totalSpend,
    leads,
    newStudents,
    cpl,
    cac,
    cvr: ratio(newStudents, leads),
    attributedMonths: attributed.length,
    center: funnel(sumNullable(attributed.map((x) => x.centerSpend)), sumNullable(attributed.map((x) => x.centerLeads)), sumNullable(attributed.map((x) => x.centerNewStudents))),
    rest: funnel(
      sumNullable(comparable.map((x) => x.systemSpend)),
      sumNullable(comparable.map((x) => x.leads! - (x.centerLeads ?? 0))),
      sumNullable(comparable.map((x) => x.newStudents! - (x.centerNewStudents ?? 0))),
    ),
    inconsistentMonths: comparable.filter((x) => x.leads! < (x.centerLeads ?? 0) || x.newStudents! < (x.centerNewStudents ?? 0)).map((x) => x.p),
  };
}

// ---------------------------------------------------------------------------
// Tổng quan toàn phòng — 5 mảng như sheet "Tổng hợp" (B2C gộp Hệ thống + TT)
// ---------------------------------------------------------------------------

export type OverviewKey = "b2c" | "ecom" | "b2b" | "osir" | "vmp";
export const OVERVIEW_KEYS: OverviewKey[] = ["b2c", "ecom", "b2b", "osir", "vmp"];
export const OVERVIEW_LABELS: Record<OverviewKey, string> = {
  b2c: "B2C Offline",
  ecom: LINE_LABELS.ecom,
  b2b: LINE_LABELS.b2b,
  osir: LINE_LABELS.osir,
  vmp: LINE_LABELS.vmp,
};
export const OVERVIEW_COLORS: Record<OverviewKey, string> = {
  b2c: LINE_COLORS.b2c_system,
  ecom: LINE_COLORS.ecom,
  b2b: LINE_COLORS.b2b,
  osir: LINE_COLORS.osir,
  vmp: LINE_COLORS.vmp,
};

export type OverviewAgg = Funnel;

/** Số liệu 1 mảng (đã gộp B2C) trên tập THÁNG `periods`. Ecom: MQL được tính là lead (đúng sheet "Tổng hợp"). */
export function overviewAgg(rows: MetricRow[], key: OverviewKey, periods: string[]): OverviewAgg {
  if (key === "b2c") {
    const b = b2cSummary(rows, periods);
    return { spend: b.totalSpend, leads: b.leads, newStudents: b.newStudents, cpl: b.cpl, cac: b.cac, cvr: b.cvr };
  }
  const a = aggregate(rows.filter((r) => r.periodType === "month" && r.line === key && periods.includes(r.period)));
  return funnel(a.spend, key === "ecom" ? a.mql : a.leads, a.newStudents);
}

/** Dòng "Tổng cộng": cộng chi tiêu/lead/HVM của mọi mảng rồi chia — đúng "TỔNG HỢP DIGITAL" của sheet gốc. */
export function overviewTotal(rows: MetricRow[], periods: string[]): OverviewAgg {
  const parts = OVERVIEW_KEYS.map((k) => overviewAgg(rows, k, periods));
  return funnel(sumNullable(parts.map((x) => x.spend)), sumNullable(parts.map((x) => x.leads)), sumNullable(parts.map((x) => x.newStudents)));
}

// ---------------------------------------------------------------------------
// Ecom theo sản phẩm
// ---------------------------------------------------------------------------

export interface EcomProductRow {
  id: string;
  period: string;
  periodEnd: string | null;
  product: string;
  spend: string | null;
  mql: string | null;
  newStudents: string | null;
  revenue: string | null;
  notes: string | null;
}

export interface EcomPeriod {
  /** Khoá kỳ = tháng bắt đầu. */
  key: string;
  periodEnd: string | null;
  months: string[];
  label: string;
}

function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < 24) {
    out.push(cur);
    const [y, m] = cur.split("-").map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out;
}

export function makeEcomPeriod(period: string, periodEnd: string | null): EcomPeriod {
  const end = periodEnd && periodEnd > period ? periodEnd : null;
  return {
    key: period,
    periodEnd: end,
    months: end ? monthRange(period, end) : [period],
    label: end ? `${monthLabel(period, true)}–${monthLabel(end, true)} (gộp)` : monthLabel(period),
  };
}

/** Các kỳ đã có số theo sản phẩm, cũ → mới. */
export function ecomPeriods(rows: EcomProductRow[]): EcomPeriod[] {
  const seen = new Map<string, EcomPeriod>();
  for (const r of rows) if (!seen.has(r.period)) seen.set(r.period, makeEcomPeriod(r.period, r.periodEnd));
  return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface EcomAgg {
  spend: number | null;
  mql: number | null;
  newStudents: number | null;
  revenue: number | null;
  cpmql: number | null;
  cac: number | null;
  cvr: number | null;
  roas: number | null;
}

export function ecomDerive(a: { spend: number | null; mql: number | null; newStudents: number | null; revenue: number | null }): EcomAgg {
  return { ...a, cpmql: ratio(a.spend, a.mql), cac: ratio(a.spend, a.newStudents), cvr: ratio(a.newStudents, a.mql), roas: ratio(a.revenue, a.spend) };
}

/** Cộng các dòng sản phẩm (đã lọc theo kỳ/sản phẩm) rồi suy ra CPMQL/CAC/CVR/ROAS. */
export function ecomAggregate(rows: EcomProductRow[]): EcomAgg {
  return ecomDerive({
    spend: sumNullable(rows.map((r) => num(r.spend))),
    mql: sumNullable(rows.map((r) => num(r.mql))),
    newStudents: sumNullable(rows.map((r) => num(r.newStudents))),
    revenue: sumNullable(rows.map((r) => num(r.revenue))),
  });
}

/** Tổng Ecom theo bảng THÁNG (line=ecom) cho các tháng của 1 kỳ — để đối chiếu với tổng các sản phẩm. */
export function ecomMonthlyTotal(rows: MetricRow[], months: string[]): EcomAgg {
  const a = aggregate(rows.filter((r) => r.periodType === "month" && r.line === "ecom" && months.includes(r.period)));
  return ecomDerive({ spend: a.spend, mql: a.mql, newStudents: a.newStudents, revenue: a.revenue });
}
