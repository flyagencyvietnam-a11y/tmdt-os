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
  /** Chi phí đã chia để ra CPL / CAC (chỉ gồm phần ĐÃ có Lead / HVM) — để rê chuột xem "= chi ÷ Lead". */
  cplBase?: number | null;
  cacBase?: number | null;
}

function build(f: { spend: number | null; messages: number | null; leads: number | null; hvm: number | null; revenue: number | null; deals: number | null }, costBase: number | null): Funnel {
  return {
    ...f,
    cpl: ratio(costBase, f.leads),
    cac: ratio(costBase, f.hvm),
    cplBase: costBase,
    cacBase: costBase,
    cvr: ratio(f.hvm, f.leads),
    costPerMess: f.spend != null && f.messages ? Math.round(f.spend / f.messages) : null,
    roas: ratio(f.revenue, f.spend),
  };
}

const isB2c = (r: MetricRow) => r.line === "b2c_system" || r.line === "b2c_center";
const periodKey = (r: MetricRow) => `${r.periodType}|${r.period}`;
const leadOfRow = (r: MetricRow) => (r.line === "ecom" ? num(r.mql) : num(r.leads));

/**
 * Chỉ số của 1 tập dòng `rows` (đã lọc đúng đơn vị/khu vực). `costOf(period)` cho phép đổi cơ sở chi phí để chia CPL/CAC (dòng Hệ thống chia tổng NS B2C).
 * CPL/CAC (nhiều kỳ, vd. quý): chỉ chia chi phí của những kỳ ĐÃ nhập Lead/HVM — kỳ còn trống không kéo lệch chỉ số.
 */
function rowsFunnel(rows: MetricRow[], leadField: "leads" | "mql", costOf?: (periodKey: string) => number | null, costOfHvm?: (periodKey: string) => number | null): Funnel {
  const a = aggregate(rows);
  const leads = leadField === "mql" ? a.mql : a.leads;
  let leadCost: number | null = null;
  let hvmCost: number | null = null;
  for (const p of new Set(rows.map((r) => `${r.periodType}|${r.period}`))) {
    const pa = aggregate(rows.filter((r) => `${r.periodType}|${r.period}` === p));
    const spend = costOf ? costOf(p) : pa.spend;
    if ((leadField === "mql" ? pa.mql : pa.leads) != null) leadCost = sumNullable([leadCost, spend]);
    if (pa.newStudents != null) hvmCost = sumNullable([hvmCost, costOfHvm ? costOfHvm(p) : spend]);
  }
  const f = build({ spend: a.spend, messages: a.messages, leads, hvm: a.newStudents, revenue: a.revenue, deals: a.deals }, a.spend);
  return { ...f, cpl: ratio(leadCost, leads), cac: ratio(hvmCost, a.newStudents), cplBase: leadCost, cacBase: hvmCost };
}

const b2cSpendOf = (bucket: MetricRow[], p: string) => aggregate(bucket.filter((r) => periodKey(r) === p && isB2c(r))).spend;
const googleSpendOf = (bucket: MetricRow[], p: string) => aggregate(bucket.filter((r) => periodKey(r) === p && r.line === "b2c_google")).spend;

/**
 * Chỉ số của 1 đơn vị trên tập dòng `bucket` (đã lọc đúng kỳ). Dòng HO · FB:
 *  - đã tách phần page Tổng (b2c-own.ts): CPL = chi HO ÷ Lead HO — mỗi dòng tự chia; CAC cũng vậy, trừ HVM TUẦN (vẫn là tổng B2C → chia tổng chi B2C);
 *  - chưa tách (kỳ trung tâm chưa có số / dữ liệu gốc): Lead/HVM là tổng B2C nên CPL/CAC chia TỔNG chi B2C (HO + trung tâm).
 */
export function unitFunnel(bucket: MetricRow[], u: AdsUnit): Funnel {
  const rows = rowsOfUnit(bucket, u);
  if (u.kind !== "ho") return rowsFunnel(rows, u.leadField);
  const hoRow = (p: string) => rows.find((r) => periodKey(r) === p);
  const own = (p: string) => aggregate(rows.filter((r) => periodKey(r) === p)).spend;
  return rowsFunnel(
    rows,
    u.leadField,
    (p) => (hoRow(p)?.b2cOwn ? own(p) : b2cSpendOf(bucket, p)),
    (p) => (hoRow(p)?.b2cOwn && !hoRow(p)?.hvmTotal ? own(p) : b2cSpendOf(bucket, p)),
  );
}

/**
 * Dòng cộng của 1 NHÓM: khu vực (cộng các trung tâm — Lead/HVM là phần quy riêng cho ads trung tâm, không cộng vào Tổng cộng) hoặc MKT HO
 * (FB + Google: Lead/HVM cộng lại; CPL/CAC chia chi phí B2C-wide (HO + trung tâm) + Google, cùng cơ sở với dòng HO · FB).
 */
export function groupFunnel(bucket: MetricRow[], members: AdsUnit[]): Funnel {
  const rows = rowsOfGroup(bucket, members);
  if (members.some((m) => m.kind === "ho")) {
    const hoRow = (p: string) => rows.find((r) => r.line === "b2c_system" && periodKey(r) === p);
    const own = (p: string) => aggregate(rows.filter((r) => periodKey(r) === p)).spend;
    const wide = (p: string) => sumNullable([b2cSpendOf(bucket, p), googleSpendOf(bucket, p)]);
    return rowsFunnel(
      rows,
      "leads",
      (p) => (hoRow(p)?.b2cOwn ? own(p) : wide(p)),
      (p) => (hoRow(p)?.b2cOwn && !hoRow(p)?.hvmTotal ? own(p) : wide(p)),
    );
  }
  return rowsFunnel(rows, "leads");
}

/** Các dòng của nhóm (để cộng nhóm và kiểm tra ô tạm tính từ tuần). */
export function rowsOfGroup(rows: MetricRow[], members: AdsUnit[]): MetricRow[] {
  return members.flatMap((m) => rowsOfUnit(rows, m));
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
    const sysRows = rows.filter((r) => r.line === "b2c_system");
    const sys = aggregate(sysRows);
    const ctr = aggregate(rows.filter((r) => r.line === "b2c_center"));
    // HO · FB đã tách (b2c-own.ts): Lead = page Tổng + trung tâm (CỘNG); HVM tuần vẫn là tổng B2C nên không cộng thêm trung tâm.
    const own = sysRows.some((r) => r.b2cOwn);
    const hvmTotal = sysRows.some((r) => r.hvmTotal);
    parts.push({
      spend: aggregate(rows).spend,
      leads: own ? sumNullable([sys.leads, ctr.leads]) : (sys.leads ?? ctr.leads),
      hvm: own && !hvmTotal ? sumNullable([sys.newStudents, ctr.newStudents]) : (sys.newStudents ?? ctr.newStudents),
    });
  }
  for (const r of bucket) if (!isB2c(r)) parts.push({ spend: aggregate([r]).spend, leads: leadOfRow(r), hvm: num(r.newStudents) });

  const leads = sumNullable(parts.map((x) => x.leads));
  const hvm = sumNullable(parts.map((x) => x.hvm));
  // CPL/CAC chỉ chia chi phí của những thành phần ĐÃ có số Lead/HVM — thành phần chưa nhập (còn trống) không kéo lệch chỉ số.
  const costWith = (pick: (x: (typeof parts)[number]) => number | null) => sumNullable(parts.filter((x) => pick(x) != null).map((x) => x.spend));
  const f = build({ spend: a.spend, messages: a.messages, leads, hvm, revenue: a.revenue, deals: a.deals }, a.spend);
  const cplBase = costWith((x) => x.leads);
  const cacBase = costWith((x) => x.hvm);
  return { ...f, cpl: ratio(cplBase, leads), cac: ratio(cacBase, hvm), cplBase, cacBase };
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
