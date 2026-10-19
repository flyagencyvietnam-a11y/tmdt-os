import type { AdsLine } from "@/lib/ads-lines";
import { aggregate, LINE_COLORS, num, type MetricRow, type PeriodType, type SbuLite } from "./shared";

/**
 * "Đơn vị" của Growth Performance (SPEC Phụ lục D mục 26): Hệ thống (HO), từng trung tâm, Ecom, VMP, VMT là SBU NGANG HÀNG
 * trong một danh sách duy nhất — không còn cấp "mảng". Mỗi đơn vị = (line, sbuId) của bảng `ads_metrics`. THUẦN (client-safe, không DB).
 *
 * Quy ước Lead/HVM B2C giữ nguyên (CLAUDE.md "Ads — logic B2C"): dòng Hệ thống (HO) mang Lead/HVM TỔNG cả B2C, còn Lead/HVM của từng
 * trung tâm là phần quy riêng cho ads ngân sách trung tâm (tập con, KHÔNG cộng thêm vào tổng).
 */

export type UnitKind = "ho" | "center" | "line";

export interface AdsUnit {
  key: string;
  /** Mã ngắn hiển thị ở bảng. */
  code: string;
  label: string;
  kind: UnitKind;
  line: AdsLine;
  sbuId: string | null;
  color: string;
  /** Cột đầu phễu của đơn vị: Ecom dùng MQL (= Lead), còn lại dùng Lead. */
  leadField: "leads" | "mql";
  /** Tên "lượt chuyển đổi" riêng của đơn vị (HVM / HVM online / HS đăng ký DV / HV ghi danh thi). */
  conversionLabel: string;
  /** Khu vực (chỉ trung tâm): KV1 / KV2 / KV3. */
  region?: string;
}

/** Thứ tự cố định: Hệ thống → các trung tâm → Ecom → VMP → VMT. */
export function buildAdsUnits(centers: SbuLite[]): AdsUnit[] {
  const line = (key: AdsLine, code: string, label: string, conversionLabel: string, leadField: "leads" | "mql" = "leads"): AdsUnit => ({
    key,
    code,
    label,
    kind: "line",
    line: key,
    sbuId: null,
    color: LINE_COLORS[key],
    leadField,
    conversionLabel,
  });
  return [
    { key: "ho", code: "HO", label: "Hệ thống (HO chạy chung)", kind: "ho", line: "b2c_system", sbuId: null, color: LINE_COLORS.b2c_system, leadField: "leads", conversionLabel: "HVM" },
    ...centers.map<AdsUnit>((s) => ({ key: s.id, code: s.code, label: `${s.code} — ${s.name}`, kind: "center", line: "b2c_center", sbuId: s.id, color: LINE_COLORS.b2c_center, leadField: "leads", conversionLabel: "HVM", region: s.region ?? undefined })),
    line("ecom", "Ecom", "Ecom (TMĐT)", "HVM online", "mql"),
    line("vmp", "VMP", "VMP (Du học)", "HS đăng ký DV"),
    line("osir", "VMT", "VMT (khảo thí)", "HV ghi danh thi"),
  ];
}

/** Nhóm trung tâm theo khu vực (SPEC Phụ lục D mục 29) — lấy từ `sbus.region`, không gõ cứng danh sách. */
export interface AdsUnitGroup {
  key: string;
  label: string;
  members: AdsUnit[];
}

/** Các khu vực có trung tâm, theo thứ tự KV1 → KV2 → KV3 (trung tâm chưa có khu vực xếp nhóm "Khác" ở cuối). */
export function buildUnitGroups(units: AdsUnit[]): AdsUnitGroup[] {
  const by = new Map<string, AdsUnit[]>();
  for (const u of units) {
    if (u.kind !== "center") continue;
    const k = u.region && /^KV\d$/.test(u.region) ? u.region : "Khác";
    const list = by.get(k);
    if (list) list.push(u);
    else by.set(k, [u]);
  }
  return [...by.entries()].sort(([a], [b]) => (a === "Khác" ? 1 : b === "Khác" ? -1 : a.localeCompare(b))).map(([key, members]) => ({ key, label: key, members }));
}

/** Dòng số liệu thuộc đơn vị này (cùng line, và cùng SBU nếu là trung tâm). */
export function rowsOfUnit(rows: MetricRow[], u: AdsUnit): MetricRow[] {
  return rows.filter((r) => r.line === u.line && (u.kind === "center" ? r.sbuId === u.sbuId : !r.sbuId));
}

/** Đơn vị ứng với 1 (line, sbuId) — dùng cho kế hoạch / request. */
export function unitOf(units: AdsUnit[], line: AdsLine, sbuId: string | null): AdsUnit | undefined {
  return units.find((u) => u.line === line && (u.kind === "center" ? u.sbuId === sbuId : true));
}

/** Đơn vị ứng với 1 dòng kế hoạch/request/số liệu. */
export function unitKeyOf(line: AdsLine, sbuId: string | null): string {
  return line === "b2c_center" && sbuId ? sbuId : line === "b2c_system" ? "ho" : line;
}

/** Đơn vị có "chủ" mục tiêu phễu: mọi đơn vị trừ từng trung tâm (trung tâm chỉ lập ngân sách). */
export const hasFunnelTargets = (u: AdsUnit) => u.kind !== "center";

// ---------------------------------------------------------------------------
// Chỉ số phễu
// ---------------------------------------------------------------------------

const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
const sumNullable = (vals: (number | null)[]): number | null => vals.reduce<number | null>((a, v) => (v == null ? a : (a ?? 0) + v), null);

export interface Funnel {
  spend: number | null;
  messages: number | null;
  /** Lead (Ecom: MQL). */
  leads: number | null;
  hvm: number | null;
  revenue: number | null;
  deals: number | null;
  cpl: number | null;
  cac: number | null;
  cvr: number | null;
  costPerMess: number | null;
  roas: number | null;
}

function build(f: { spend: number | null; messages: number | null; leads: number | null; hvm: number | null; revenue: number | null; deals: number | null }, costBase: number | null): Funnel {
  return {
    ...f,
    cpl: ratio(costBase, f.leads),
    cac: ratio(costBase, f.hvm),
    cvr: ratio(f.hvm, f.leads),
    costPerMess: f.spend != null && f.messages ? Math.round(f.spend / f.messages) : null,
    roas: ratio(f.revenue, f.spend),
  };
}

const isB2c = (r: MetricRow) => r.line === "b2c_system" || r.line === "b2c_center";
const leadOfRow = (r: MetricRow) => (r.line === "ecom" ? num(r.mql) : num(r.leads));

/**
 * Chỉ số của 1 tập dòng `rows` (đã lọc đúng đơn vị/khu vực). `costOf(period)` cho phép đổi cơ sở chi phí để chia CPL/CAC (dòng Hệ thống chia tổng NS B2C).
 * CPL/CAC (nhiều kỳ, vd. quý): chỉ chia chi phí của những kỳ ĐÃ nhập Lead/HVM — kỳ còn trống không kéo lệch chỉ số.
 */
function rowsFunnel(rows: MetricRow[], leadField: "leads" | "mql", costOf?: (periodKey: string) => number | null): Funnel {
  const a = aggregate(rows);
  const leads = leadField === "mql" ? a.mql : a.leads;
  let leadCost: number | null = null;
  let hvmCost: number | null = null;
  for (const p of new Set(rows.map((r) => `${r.periodType}|${r.period}`))) {
    const pa = aggregate(rows.filter((r) => `${r.periodType}|${r.period}` === p));
    const spend = costOf ? costOf(p) : pa.spend;
    if ((leadField === "mql" ? pa.mql : pa.leads) != null) leadCost = sumNullable([leadCost, spend]);
    if (pa.newStudents != null) hvmCost = sumNullable([hvmCost, spend]);
  }
  const f = build({ spend: a.spend, messages: a.messages, leads, hvm: a.newStudents, revenue: a.revenue, deals: a.deals }, a.spend);
  return { ...f, cpl: ratio(leadCost, leads), cac: ratio(hvmCost, a.newStudents) };
}

/** Chỉ số của 1 đơn vị trên tập dòng `bucket` (đã lọc đúng kỳ). Dòng Hệ thống: CPL/CAC chia TỔNG ngân sách B2C (HO + trung tâm). */
export function unitFunnel(bucket: MetricRow[], u: AdsUnit): Funnel {
  const costOf = u.kind === "ho" ? (p: string) => aggregate(bucket.filter((r) => `${r.periodType}|${r.period}` === p && isB2c(r))).spend : undefined;
  return rowsFunnel(rowsOfUnit(bucket, u), u.leadField, costOf);
}

/** Dòng cộng theo KHU VỰC: cộng số liệu các trung tâm thành viên (Lead/HVM là phần quy riêng cho ads trung tâm, không cộng vào Tổng cộng). */
export function groupFunnel(bucket: MetricRow[], members: AdsUnit[]): Funnel {
  const ids = new Set(members.map((m) => m.sbuId));
  return rowsFunnel(
    bucket.filter((r) => r.line === "b2c_center" && !!r.sbuId && ids.has(r.sbuId)),
    "leads",
  );
}

/** Các dòng của nhóm trung tâm (để kiểm tra ô tạm tính từ tuần). */
export function rowsOfGroup(rows: MetricRow[], members: AdsUnit[]): MetricRow[] {
  const ids = new Set(members.map((m) => m.sbuId));
  return rows.filter((r) => r.line === "b2c_center" && !!r.sbuId && ids.has(r.sbuId));
}

/**
 * Dòng "Tổng cộng" mọi đơn vị: ngân sách cộng tất cả; Lead/HVM = số TỔNG B2C (dòng Hệ thống; nếu kỳ đó chưa nhập thì tạm cộng từ các
 * trung tâm) + Lead(MQL)/HVM của Ecom/VMP/VMT. Trung tâm KHÔNG cộng thêm khi đã có số tổng (tập con). Fallback tính theo từng kỳ.
 * CPL/CAC chỉ chia chi phí của phần ĐÃ có Lead/HVM (SBU còn trống không kéo lệch).
 */
export function totalFunnel(bucket: MetricRow[]): Funnel {
  const a = aggregate(bucket);
  // Mỗi "thành phần" của tổng = (B2C trong 1 kỳ) hoặc (1 dòng của SBU khác): ngân sách + Lead/HVM của chính nó.
  const parts: { spend: number | null; leads: number | null; hvm: number | null }[] = [];
  for (const p of new Set(bucket.map((r) => `${r.periodType}|${r.period}`))) {
    const rows = bucket.filter((r) => `${r.periodType}|${r.period}` === p && isB2c(r));
    if (!rows.length) continue;
    const sys = aggregate(rows.filter((r) => r.line === "b2c_system"));
    const ctr = aggregate(rows.filter((r) => r.line === "b2c_center"));
    parts.push({ spend: aggregate(rows).spend, leads: sys.leads ?? ctr.leads, hvm: sys.newStudents ?? ctr.newStudents });
  }
  for (const r of bucket) if (!isB2c(r)) parts.push({ spend: aggregate([r]).spend, leads: leadOfRow(r), hvm: num(r.newStudents) });

  const leads = sumNullable(parts.map((x) => x.leads));
  const hvm = sumNullable(parts.map((x) => x.hvm));
  // CPL/CAC chỉ chia chi phí của những thành phần ĐÃ có số Lead/HVM — thành phần chưa nhập (còn trống) không kéo lệch chỉ số.
  const costWith = (pick: (x: (typeof parts)[number]) => number | null) => sumNullable(parts.filter((x) => pick(x) != null).map((x) => x.spend));
  const f = build({ spend: a.spend, messages: a.messages, leads, hvm, revenue: a.revenue, deals: a.deals }, a.spend);
  return { ...f, cpl: ratio(costWith((x) => x.leads), leads), cac: ratio(costWith((x) => x.hvm), hvm) };
}

// ---------------------------------------------------------------------------
// Chỉ mục dòng theo kỳ (tránh lọc lại cả bảng cho từng ô)
// ---------------------------------------------------------------------------

export type RowIndex = Map<string, MetricRow[]>;

export function indexRows(rows: MetricRow[]): RowIndex {
  const idx: RowIndex = new Map();
  for (const r of rows) {
    const k = `${r.periodType}|${r.period}`;
    const list = idx.get(k);
    if (list) list.push(r);
    else idx.set(k, [r]);
  }
  return idx;
}

export function bucketRows(idx: RowIndex, type: PeriodType, periods: string[]): MetricRow[] {
  return periods.flatMap((p) => idx.get(`${type}|${p}`) ?? []);
}
