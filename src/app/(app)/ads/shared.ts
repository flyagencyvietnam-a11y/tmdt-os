import { computeAdsDerived, type EffectivenessRubric } from "@/lib/ads-metrics";

export type Line = "b2c_system" | "b2c_center" | "ecom" | "b2b" | "osir" | "vmp";
export type PeriodType = "month" | "week";

export interface MetricRow {
  id: string;
  line: Line;
  periodType: PeriodType;
  period: string;
  sbuId: string | null;
  budget: string | null;
  centerOrderBudget: string | null;
  hoTopupBudget: string | null;
  leads: string | null;
  newStudents: string | null;
  messages: string | null;
  impressions: string | null;
  revenue: string | null;
  actualRevenue: string | null;
  mql: string | null;
  deals: string | null;
  status: string;
  centerFeedback?: string | null;
  mktAssessment?: string | null;
  notes?: string | null;
}

export interface SbuLite {
  id: string;
  code: string;
  name: string;
}

export interface CampaignRow {
  id: string;
  sbuId: string;
  period: string;
  campaignName: string;
  spend: string;
  misaRequestUrl?: string | null;
  messages?: string | null;
  reach?: string | null;
  impressions?: string | null;
  conversations?: string | null;
  comments?: string | null;
  engagements?: string | null;
  reactions?: string | null;
  spendWithVat?: string | null;
  plannedBudget?: string | null;
  runnerId?: string | null;
  [k: string]: unknown;
}

export interface DisbursementRow {
  id: string;
  line: string;
  period: string;
  plannedAmount: string;
  notes: string | null;
}

export const LINES: Line[] = ["b2c_system", "b2c_center", "ecom", "b2b", "osir", "vmp"];

export const LINE_LABELS: Record<Line, string> = {
  b2c_system: "B2C Hệ thống",
  b2c_center: "B2C Trung tâm",
  ecom: "Ecom (TMĐT)",
  b2b: "B2B",
  osir: "OSIR",
  vmp: "VMP (Du học)",
};

/**
 * Màu nhận diện CỐ ĐỊNH theo mảng (không theo thứ hạng) — biến CSS
 * --series-N trong globals.css (đã kiểm định mù màu, có bản dark riêng).
 */
export const LINE_COLORS: Record<Line, string> = {
  b2c_system: "var(--series-1)",
  b2c_center: "var(--series-2)",
  ecom: "var(--series-3)",
  b2b: "var(--series-4)",
  osir: "var(--series-5)",
  vmp: "var(--series-6)",
};

/** Nhãn đơn vị "HVM" khác nhau theo mảng. */
export function conversionLabel(line: Line): string {
  return line === "ecom" ? "HVM online" : line === "osir" ? "HV ghi danh thi" : line === "vmp" ? "HS đăng ký DV" : "HVM";
}

// ---------------------------------------------------------------------------
// Định dạng số
// ---------------------------------------------------------------------------

export function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmt(v: string | number | null | undefined): string {
  const n = num(v);
  return n == null ? "—" : Math.round(n).toLocaleString("vi-VN");
}

/** Tiền rút gọn: 14,9 tr · 1,25 tỷ · 850 N. */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString("vi-VN")} N`;
  return Math.round(v).toLocaleString("vi-VN");
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Kỳ báo cáo
// ---------------------------------------------------------------------------

function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tuần = Thứ 7 (period) → hết Thứ 6. "19/09 – 25/09". */
export function weekLabel(sat: string): string {
  const end = shiftDay(sat, 6);
  return `${sat.slice(8, 10)}/${sat.slice(5, 7)} – ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`;
}
export function weekShort(sat: string): string {
  return `${sat.slice(8, 10)}/${sat.slice(5, 7)}`;
}
export function nextWeek(sat: string): string {
  return shiftDay(sat, 7);
}

/** "2026-09" → "T9/2026" (hoặc "T9" khi short). */
export function monthLabel(p: string, short = false): string {
  const m = Number(p.slice(5, 7));
  return short ? `T${m}` : `T${m}/${p.slice(0, 4)}`;
}
export function prevMonth(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Tổng hợp
// ---------------------------------------------------------------------------

/** Chi tiêu thực của 1 dòng: Trung tâm = NS TT order + NS P.MKT thêm; mảng khác = budget. */
export function spendOf(r: Pick<MetricRow, "line" | "budget" | "centerOrderBudget" | "hoTopupBudget">): number | null {
  if (r.line === "b2c_center") {
    const a = num(r.centerOrderBudget);
    const b = num(r.hoTopupBudget);
    return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
  }
  return num(r.budget);
}

export interface Agg {
  spend: number | null;
  leads: number | null;
  newStudents: number | null;
  messages: number | null;
  impressions: number | null;
  revenue: number | null;
  mql: number | null;
  deals: number | null;
  rows: number;
}

/** Cộng nhiều dòng; trường nào KHÔNG dòng nào có số thì giữ null (khác 0 — "chưa nhập"). */
export function aggregate(rows: MetricRow[]): Agg {
  const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);
  return rows.reduce<Agg>(
    (acc, r) => ({
      spend: add(acc.spend, spendOf(r)),
      leads: add(acc.leads, num(r.leads)),
      newStudents: add(acc.newStudents, num(r.newStudents)),
      messages: add(acc.messages, num(r.messages)),
      impressions: add(acc.impressions, num(r.impressions)),
      revenue: add(acc.revenue, num(r.revenue)),
      mql: add(acc.mql, num(r.mql)),
      deals: add(acc.deals, num(r.deals)),
      rows: acc.rows + 1,
    }),
    { spend: null, leads: null, newStudents: null, messages: null, impressions: null, revenue: null, mql: null, deals: null, rows: 0 },
  );
}

export interface AggDerived extends Agg {
  cpl: number | null;
  cac: number | null;
  cvr: number | null;
  costPerMess: number | null;
  roas: number | null;
  effectivenessScore: number | null;
  effectivenessLabel: string;
}

/** Suy ra CPL/CAC/CVR/... từ 1 tổng hợp — dùng ĐÚNG computeAdsDerived (cùng công thức sheet gốc). */
export function derive(agg: Agg, line: Line, rubric?: EffectivenessRubric): AggDerived {
  const s = (n: number | null) => (n == null ? null : String(n));
  const d = computeAdsDerived(
    { line: line === "b2c_center" ? "b2c_system" : line, budget: s(agg.spend), centerOrderBudget: null, hoTopupBudget: null, leads: s(agg.leads), newStudents: s(agg.newStudents), revenue: s(agg.revenue), mql: s(agg.mql) },
    rubric,
  );
  return {
    ...agg,
    cpl: d.cpl,
    cac: d.cac,
    cvr: d.cvr,
    roas: d.roas,
    costPerMess: agg.spend != null && agg.messages ? Math.round(agg.spend / agg.messages) : null,
    effectivenessScore: d.effectivenessScore,
    effectivenessLabel: d.effectivenessLabel,
  };
}

/** Tỷ lệ thay đổi; null nếu thiếu kỳ so sánh hoặc kỳ trước = 0. */
export function change(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

// ---------------------------------------------------------------------------
// Điểm hiệu quả → màu trạng thái (luôn kèm chữ, không chỉ màu)
// ---------------------------------------------------------------------------

export const EFFECTIVENESS_TONE: Record<string, { badge: string; dot: string }> = {
  "Rất hiệu quả": { badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  "Hiệu quả": { badge: "bg-teal-500/12 text-teal-700 dark:text-teal-400", dot: "bg-teal-500" },
  "Chấp nhận được": { badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  "Cần tối ưu": { badge: "bg-orange-500/15 text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  "Kém hiệu quả": { badge: "bg-red-500/12 text-red-700 dark:text-red-400", dot: "bg-red-500" },
  "Chưa đủ dữ liệu": { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
};
