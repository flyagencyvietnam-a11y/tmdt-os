import type { AdsLine } from "@/lib/ads-lines";
import { aggregate, LINE_COLORS, num, type MetricRow, type PeriodType, type SbuLite } from "./shared";

/**
 * "Đơn vị" của Growth Performance (SPEC Phụ lục D mục 26): MKT HO (mục con FB + Google), từng trung tâm, Ecom, VMP, VMT là SBU NGANG HÀNG
 * trong một danh sách duy nhất — không còn cấp "mảng". Mỗi đơn vị = (line, sbuId) của bảng `ads_metrics`. THUẦN (client-safe, không DB).
 *
 * Quy ước Lead/HVM B2C giữ nguyên (CLAUDE.md "Ads — logic B2C"): dòng HO · FB mang Lead/HVM TỔNG cả B2C (nguồn MXH), còn Lead/HVM của từng
 * trung tâm là phần quy riêng cho ads ngân sách trung tâm (tập con, KHÔNG cộng thêm vào tổng). HO · Google (lead website) là nguồn
 * CỘNG THÊM (SPEC Phụ lục D mục 31).
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

/** Thứ tự cố định: HO · FB → HO · Google → các trung tâm → Ecom → VMP → VMT. */
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
    { key: "ho", code: "HO · FB", label: "MKT HO — Facebook (HO chạy chung)", kind: "ho", line: "b2c_system", sbuId: null, color: LINE_COLORS.b2c_system, leadField: "leads", conversionLabel: "HVM" },
    line("b2c_google", "HO · Google", "MKT HO — Google (lead website)", "HVM"),
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
  /** "ho" = MKT HO (FB + Google); "region" = khu vực trung tâm. */
  kind: "ho" | "region";
  members: AdsUnit[];
}

/** Nhóm "MKT HO" (FB + Google) rồi các khu vực có trung tâm, KV1 → KV2 → KV3 (trung tâm chưa có khu vực xếp nhóm "Khác" ở cuối). */
export function buildUnitGroups(units: AdsUnit[]): AdsUnitGroup[] {
  const hoMembers = units.filter((u) => u.kind === "ho" || u.line === "b2c_google");
  const head: AdsUnitGroup[] = hoMembers.length > 1 ? [{ key: "HO", label: "MKT HO", kind: "ho", members: hoMembers }] : [];
  const by = new Map<string, AdsUnit[]>();
  for (const u of units) {
    if (u.kind !== "center") continue;
    const k = u.region && /^KV\d$/.test(u.region) ? u.region : "Khác";
    const list = by.get(k);
    if (list) list.push(u);
    else by.set(k, [u]);
  }
  const regions = [...by.entries()].sort(([a], [b]) => (a === "Khác" ? 1 : b === "Khác" ? -1 : a.localeCompare(b))).map(([key, members]): AdsUnitGroup => ({ key, label: key, kind: "region", members }));
  return [...head, ...regions];
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
// Chỉ số phễu — QUY TẮC CỘNG (SPEC Phụ lục D mục 35)
//   • Ngân sách, Mess, Lead, HVM, doanh thu: Tổng cộng / dòng nhóm = CỘNG các dòng bên dưới (HO · FB đã tách phần trung tâm — b2c-own.ts).
//   • CPL = Ngân sách ÷ Lead, CAC = Ngân sách ÷ HVM của CHÍNH dòng đó (rê chuột xem phép chia). Nhiều kỳ (quý, thẻ KPI): chỉ chia chi phí của những
//     kỳ ĐÃ nhập Lead/HVM — kỳ còn trống không kéo lệch chỉ số; một kỳ thì đúng bằng Ngân sách ÷ Lead.
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
  /** Chi phí đã chia để ra CPL / CAC (chỉ gồm các kỳ ĐÃ có Lead / HVM) — để rê chuột xem "= chi ÷ Lead". */
  cplBase?: number | null;
  cacBase?: number | null;
}

const periodKey = (r: MetricRow) => `${r.periodType}|${r.period}`;
const leadOfRow = (r: MetricRow) => (r.line === "ecom" ? num(r.mql) : num(r.leads));

/**
 * Chỉ số của 1 tập dòng `rows` (đã lọc đúng đơn vị/nhóm/kỳ). Mỗi kỳ: spend = tổng chi các dòng của kỳ đó; kỳ nào có Lead (HVM) thì tính chi của kỳ vào
 * cơ sở CPL (CAC). Lead của Ecom = MQL.
 */
function funnelOfRows(rows: MetricRow[]): Funnel {
  const a = aggregate(rows);
  const leads = sumNullable(rows.map(leadOfRow));
  const hvm = a.newStudents;
  let cplBase: number | null = null;
  let cacBase: number | null = null;
  const periods = new Set(rows.map(periodKey));
  for (const p of periods) {
    const inP = rows.filter((r) => periodKey(r) === p);
    const spend = aggregate(inP).spend;
    if (sumNullable(inP.map(leadOfRow)) != null) cplBase = sumNullable([cplBase, spend]);
    if (aggregate(inP).newStudents != null) cacBase = sumNullable([cacBase, spend]);
  }
  return {
    spend: a.spend,
    messages: a.messages,
    leads,
    hvm,
    revenue: a.revenue,
    deals: a.deals,
    cpl: ratio(cplBase, leads),
    cac: ratio(cacBase, hvm),
    cvr: ratio(hvm, leads),
    costPerMess: a.spend != null && a.messages ? Math.round(a.spend / a.messages) : null,
    roas: ratio(a.revenue, a.spend),
    cplBase,
    cacBase,
  };
}

/** Chỉ số của 1 đơn vị trên tập dòng `bucket` (đã lọc đúng kỳ). */
export function unitFunnel(bucket: MetricRow[], u: AdsUnit): Funnel {
  return funnelOfRows(rowsOfUnit(bucket, u));
}

/** Dòng cộng của 1 NHÓM (MKT HO = FB + Google, hoặc khu vực = các trung tâm thành viên): cộng thẳng các dòng thành viên. */
export function groupFunnel(bucket: MetricRow[], members: AdsUnit[]): Funnel {
  return funnelOfRows(rowsOfGroup(bucket, members));
}

/** Các dòng của nhóm (để cộng nhóm và kiểm tra ô tạm tính từ tuần). */
export function rowsOfGroup(rows: MetricRow[], members: AdsUnit[]): MetricRow[] {
  return members.flatMap((m) => rowsOfUnit(rows, m));
}

/** Dòng "Tổng cộng" = CỘNG mọi đơn vị (MKT HO, các khu vực, Ecom, VMP, VMT). Lead của Ecom = MQL. */
export function totalFunnel(bucket: MetricRow[]): Funnel {
  return funnelOfRows(bucket);
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
