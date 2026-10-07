import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { adsCampaigns, adsEcomProducts, adsMetrics, adsPlans, sbus, users } from "@/lib/db/schema";
import { groupOfLine, PLAN_TARGET_COLUMN, type FunnelField } from "@/lib/ads-lines";
import { writeAudit } from "@/lib/audit";
import { ECOM_PRODUCTS } from "@/lib/ads-metrics";
import { upsertAdsCampaign, upsertAdsMetric, upsertAdsPlan, upsertEcomProduct, type UpsertAdsMetricInput, type UpsertAdsPlanInput } from "../ads";
import { parseWorkbookSheets, type ParsedRow } from "./parse";

/**
 * Import Excel cho module Ads — 4 loại: KẾ HOẠCH tháng, HÀNG TUẦN, HÀNG THÁNG, THEO REQUEST.
 * Quy ước chung (cùng nguyên tắc "import không phá dữ liệu", CLAUDE.md):
 *  - Ô TRỐNG = giữ nguyên giá trị hiện có; ô có số = ghi đè. Muốn đặt về 0 thì nhập 0.
 *  - Dòng chưa điền số nào (template điền sẵn khung) = bỏ qua, không phải lỗi.
 *  - Nạp lại cùng file không nhân đôi (upsert theo khoá).
 *  - Không có trạng thái chờ trong DB: xem trước và ghi đều đọc + kiểm tra lại file.
 */

export type AdsImportKind = "week" | "month" | "request" | "plan";
export const ADS_IMPORT_SHEETS: Record<AdsImportKind, string[]> = { week: ["TUAN"], month: ["THANG", "ECOM_SP"], request: ["REQUEST"], plan: ["KE_HOACH"] };
export const ADS_IMPORT_LABEL: Record<AdsImportKind, string> = { week: "Hàng tuần", month: "Hàng tháng", request: "Theo request", plan: "Kế hoạch tháng" };
const MAX_ROWS = 500;

export type ImportAction = "create" | "update" | "skip" | "error";

export interface AdsImportPreviewRow {
  rowNumber: number;
  sheet: string;
  /** Đối tượng được ghi, vd. "T9/2026 · B2C Trung tâm · VTS". */
  target: string;
  /** Các giá trị sẽ ghi, vd. "NS 3.000.000 · Mess 25". */
  summary: string;
  action: ImportAction;
  errors: string[];
}

type Op =
  | { type: "metric"; input: UpsertAdsMetricInput }
  | { type: "plan"; input: UpsertAdsPlanInput }
  | { type: "campaign"; id?: string; line: Line; sbuId: string | null; period: string; campaignName: string; fields: Record<string, string | null>; spend?: string }
  | { type: "ecom"; period: string; periodEnd: string | null; product: string; values: { spend?: string; mql?: string; newStudents?: string; revenue?: string } };

export interface AdsImportPlan {
  rows: AdsImportPreviewRow[];
  ops: Op[];
}

// ---------------------------------------------------------------------------
// Đọc giá trị ô
// ---------------------------------------------------------------------------

/** "1.234.567" | "1,234,567" | "12,5" | "1234" → số; null nếu trống; NaN nếu sai. */
export function parseNumberCell(s: string | undefined): number | null {
  const t = (s ?? "").replace(/\s|đ|₫|vnd/gi, "");
  if (!t) return null;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** "09/2026" | "9/2026" | "2026-09" | "T9/2026" | "01/09/2026" → "2026-09". */
export function parseMonthCell(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(t);
  if (m) return fmtMonth(m[1], m[2]);
  m = /^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return fmtMonth(m[2], m[1]);
  m = /^T(\d{1,2})\s*\/\s*(\d{4})$/i.exec(t);
  if (m) return fmtMonth(m[2], m[1]);
  return null;
}
function fmtMonth(y: string, mo: string): string | null {
  const n = Number(mo);
  return n >= 1 && n <= 12 ? `${y}-${String(n).padStart(2, "0")}` : null;
}

/** "03/10/2026" | "2026-10-03" → "2026-10-03". */
export function parseDayCell(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? t : null;
}

const MONTH_NAME = (p: string) => `T${Number(p.slice(5, 7))}/${p.slice(0, 4)}`;
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface NumSpec {
  /** Khoá cột trong file. */
  col: string;
  label: string;
}

/** Đọc các cột số của 1 dòng: trả về map trường→chuỗi số (chỉ ô có giá trị) + lỗi định dạng. */
function readNumbers(r: ParsedRow, specs: NumSpec[], errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of specs) {
    const raw = r.data[s.col];
    const n = parseNumberCell(raw);
    if (n == null) continue;
    if (Number.isNaN(n)) errors.push(`${s.col} không phải số: "${raw}"`);
    else if (n < 0) errors.push(`${s.col} không được âm`);
    else out[s.col] = String(Math.round(n));
  }
  return out;
}

const summarize = (nums: Record<string, string>, labels: Record<string, string>) =>
  Object.entries(nums)
    .map(([k, v]) => `${labels[k] ?? k} ${money(Number(v))}`)
    .join(" · ");

async function loadSbus(db: DB) {
  const rows = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  return new Map(rows.map((s) => [s.code.toUpperCase(), s.id]));
}

// ---------------------------------------------------------------------------
// HÀNG TUẦN — sheet TUAN: week_start*, line, sbu_code, budget, mess, impression, leads, mql, new_students, revenue, deals
// Báo cáo tuần mở cho MỌI mảng (SPEC Phụ lục D mục 21). line trống: sbu_code trống = B2C Hệ thống, có sbu_code = B2C Trung tâm
// (tương thích template cũ). Cột nào dùng được tuỳ mảng — khai báo ở `weeklyFields` trong lib/ads-lines.ts.
// ---------------------------------------------------------------------------

const WEEK_LABELS = { budget: "NS", mess: "Mess", impression: "Impression", leads: "Lead", mql: "MQL", new_students: "HVM/chuyển đổi", revenue: "Doanh thu", deals: "Deal" };

/** Cột số của sheet TUAN → trường ads_metrics (ngân sách và impression xử lý riêng). */
const WEEK_COLS: { col: string; field: FunnelField | "impressions" }[] = [
  { col: "mess", field: "messages" },
  { col: "leads", field: "leads" },
  { col: "mql", field: "mql" },
  { col: "new_students", field: "newStudents" },
  { col: "revenue", field: "revenue" },
  { col: "deals", field: "deals" },
  { col: "impression", field: "impressions" },
];

async function planWeek(db: DB, sheets: Record<string, ParsedRow[]>): Promise<AdsImportPlan> {
  const sbuByCode = await loadSbus(db);
  const parsed = sheets.TUAN ?? [];
  const weeks = [...new Set(parsed.map((r) => parseDayCell(r.data.week_start)).filter((x): x is string => !!x))];
  const existing = weeks.length ? await db.select().from(adsMetrics).where(and(eq(adsMetrics.periodType, "week"), inArray(adsMetrics.period, weeks))) : [];
  const keyOf = (line: string, period: string, sbuId: string | null) => `${line}|${period}|${sbuId ?? ""}`;
  const existingByKey = new Map(existing.map((e) => [keyOf(e.line, e.period, e.sbuId), e]));
  const rows: AdsImportPreviewRow[] = [];
  const ops: Op[] = [];
  const seen = new Set<string>();
  for (const r of parsed) {
    const errors: string[] = [];
    const week = parseDayCell(r.data.week_start);
    if (!r.data.week_start) errors.push("Thiếu week_start");
    else if (!week) errors.push(`week_start sai định dạng: "${r.data.week_start}" (dùng dd/mm/yyyy)`);
    else if (new Date(`${week}T00:00:00Z`).getUTCDay() !== 6) errors.push(`week_start ${r.data.week_start} không phải Thứ 7 — tuần tính từ Thứ 7 đến hết Thứ 6`);

    const code = (r.data.sbu_code ?? "").trim().toUpperCase();
    const lineRaw = (r.data.line ?? "").trim().toLowerCase();
    const line: Line | undefined = lineRaw ? LINE_ALIAS[lineRaw] : code ? "b2c_center" : "b2c_system";
    if (lineRaw && !line) errors.push(`line không hợp lệ: "${r.data.line}" (b2c_system, b2c_center, ecom, b2b, osir/vmt, vmp)`);
    let sbuId: string | null = null;
    if (line === "b2c_center") {
      if (!code) errors.push("line b2c_center bắt buộc có sbu_code");
      else if (!sbuByCode.has(code)) errors.push(`sbu_code không tồn tại: ${code}`);
      else sbuId = sbuByCode.get(code)!;
    } else if (line && code) errors.push(`line ${line} không dùng sbu_code`);

    const nums = readNumbers(r, [{ col: "budget", label: "" }, ...WEEK_COLS.map((c) => ({ col: c.col, label: "" }))], errors);
    // Cột chỉ hợp lệ với mảng của nó (chỉ số tuần khai báo ở weeklyFields; impression chỉ B2C).
    const allowed = new Set<string>(line ? groupOfLine(line).weeklyFields : []);
    const values: Record<string, string> = {};
    if (line) {
      for (const c of WEEK_COLS) {
        if (nums[c.col] === undefined) continue;
        const ok = c.field === "impressions" ? groupOfLine(line).key === "b2c" : allowed.has(c.field);
        if (!ok) errors.push(`${c.col} không áp dụng cho báo cáo tuần của ${LINE_NAME[line]}`);
        else values[c.field] = nums[c.col];
      }
      if (nums.budget !== undefined) values[line === "b2c_center" ? "centerOrderBudget" : "budget"] = nums.budget;
    }
    const target = `${week ? `Tuần ${week.slice(8, 10)}/${week.slice(5, 7)}` : "?"} · ${line === "b2c_center" ? code || "?" : line === "b2c_system" ? "Hệ thống" : line ? LINE_NAME[line] : "?"}`;

    if (!errors.length && !Object.keys(nums).length) {
      rows.push({ rowNumber: r.rowNumber, sheet: "TUAN", target, summary: "chưa điền số", action: "skip", errors: [] });
      continue;
    }
    const key = keyOf(line ?? "", week ?? "", sbuId);
    if (!errors.length && seen.has(key)) errors.push("Trùng (tuần, mảng/đối tượng) với dòng trên trong file");
    seen.add(key);
    if (errors.length || !week || !line) {
      rows.push({ rowNumber: r.rowNumber, sheet: "TUAN", target, summary: "", action: "error", errors });
      continue;
    }
    const ex = existingByKey.get(keyOf(line, week, sbuId));
    // Tuần Trung tâm: 1 ô "NS (TT order + P.MKT thêm)" lưu ở centerOrderBudget, như màn nhập tuần.
    ops.push({ type: "metric", input: { id: ex?.id, line, periodType: "week", period: week, sbuId, ...values } as UpsertAdsMetricInput });
    rows.push({ rowNumber: r.rowNumber, sheet: "TUAN", target, summary: summarize(nums, WEEK_LABELS), action: ex ? "update" : "create", errors: [] });
  }
  return { rows, ops };
}

// ---------------------------------------------------------------------------
// HÀNG THÁNG — sheet THANG (6 mảng) + ECOM_SP (Ecom theo sản phẩm)
// ---------------------------------------------------------------------------

type Line = "b2c_system" | "b2c_center" | "ecom" | "b2b" | "osir" | "vmp";
const LINE_ALIAS: Record<string, Line> = {
  b2c_system: "b2c_system",
  he_thong: "b2c_system",
  b2c_center: "b2c_center",
  trung_tam: "b2c_center",
  ecom: "ecom",
  b2b: "b2b",
  osir: "osir",
  vmt: "osir",
  vmp: "vmp",
};
const LINE_NAME: Record<Line, string> = { b2c_system: "B2C Hệ thống (tổng B2C)", b2c_center: "B2C Trung tâm", ecom: "Ecom", b2b: "B2B", osir: "VMT (khảo thí)", vmp: "VMP" };

/** Cột số của sheet THANG → trường ads_metrics + mảng được phép dùng. */
const MONTH_FIELDS: { col: string; field: keyof UpsertAdsMetricInput; lines: Line[]; label: string }[] = [
  { col: "budget", field: "budget", lines: ["b2c_system", "ecom", "b2b", "osir", "vmp"], label: "NS" },
  { col: "center_order_budget", field: "centerOrderBudget", lines: ["b2c_center"], label: "NS TT order" },
  { col: "ho_topup_budget", field: "hoTopupBudget", lines: ["b2c_center"], label: "NS MKT thêm" },
  { col: "leads", field: "leads", lines: ["b2c_system", "b2c_center", "b2b", "osir", "vmp"], label: "Lead" },
  { col: "new_students", field: "newStudents", lines: ["b2c_system", "b2c_center", "ecom", "b2b", "osir", "vmp"], label: "HVM" },
  { col: "messages", field: "messages", lines: ["b2b"], label: "Mess" },
  { col: "mql", field: "mql", lines: ["ecom"], label: "MQL" },
  { col: "revenue", field: "revenue", lines: ["ecom"], label: "Doanh thu" },
  { col: "actual_revenue", field: "actualRevenue", lines: ["ecom"], label: "Thực thu" },
  { col: "deals", field: "deals", lines: ["b2b"], label: "Deal" },
];

async function planMonth(db: DB, sheets: Record<string, ParsedRow[]>): Promise<AdsImportPlan> {
  const sbuByCode = await loadSbus(db);
  const rows: AdsImportPreviewRow[] = [];
  const ops: Op[] = [];

  // ---- THANG ----
  const parsed = sheets.THANG ?? [];
  const months = [...new Set(parsed.map((r) => parseMonthCell(r.data.month)).filter((x): x is string => !!x))];
  const existing = months.length ? await db.select().from(adsMetrics).where(and(eq(adsMetrics.periodType, "month"), inArray(adsMetrics.period, months))) : [];
  const keyOf = (line: string, period: string, sbuId: string | null) => `${line}|${period}|${sbuId ?? ""}`;
  const existingByKey = new Map(existing.map((e) => [keyOf(e.line, e.period, e.sbuId), e]));
  const seen = new Set<string>();

  for (const r of parsed) {
    const errors: string[] = [];
    const period = parseMonthCell(r.data.month);
    if (!r.data.month) errors.push("Thiếu month");
    else if (!period) errors.push(`month sai định dạng: "${r.data.month}" (dùng mm/yyyy, vd. 09/2026)`);
    const lineRaw = (r.data.line ?? "").trim().toLowerCase();
    const line = LINE_ALIAS[lineRaw];
    if (!lineRaw) errors.push("Thiếu line");
    else if (!line) errors.push(`line không hợp lệ: "${r.data.line}" (b2c_system, b2c_center, ecom, b2b, osir, vmp)`);

    const code = (r.data.sbu_code ?? "").trim().toUpperCase();
    let sbuId: string | null = null;
    if (line === "b2c_center") {
      if (!code) errors.push("line b2c_center bắt buộc có sbu_code");
      else if (!sbuByCode.has(code)) errors.push(`sbu_code không tồn tại: ${code}`);
      else sbuId = sbuByCode.get(code)!;
    } else if (line && code) errors.push(`line ${line} không dùng sbu_code`);

    const nums = readNumbers(r, MONTH_FIELDS.map((f) => ({ col: f.col, label: f.label })), errors);
    const values: Record<string, string> = {};
    if (line) {
      for (const f of MONTH_FIELDS) {
        if (nums[f.col] === undefined) continue;
        if (!f.lines.includes(line)) errors.push(`${f.col} không áp dụng cho ${LINE_NAME[line]}${f.col === "budget" && line === "b2c_center" ? " — dùng center_order_budget + ho_topup_budget" : ""}`);
        else values[f.field as string] = nums[f.col];
      }
    }
    const text: Record<string, string> = {};
    if (line === "b2c_center") {
      if (r.data.center_feedback) text.centerFeedback = r.data.center_feedback;
      if (r.data.mkt_assessment) text.mktAssessment = r.data.mkt_assessment;
    }
    const target = `${period ? MONTH_NAME(period) : "?"} · ${line ? LINE_NAME[line] : "?"}${code ? ` · ${code}` : ""}`;
    const labels = Object.fromEntries(MONTH_FIELDS.map((f) => [f.field as string, f.label]));

    if (!errors.length && !Object.keys(values).length && !Object.keys(text).length) {
      rows.push({ rowNumber: r.rowNumber, sheet: "THANG", target, summary: "chưa điền số", action: "skip", errors: [] });
      continue;
    }
    const key = keyOf(line ?? "", period ?? "", sbuId);
    if (!errors.length && seen.has(key)) errors.push("Trùng (tháng, mảng, trung tâm) với dòng trên trong file");
    seen.add(key);
    if (errors.length || !period || !line) {
      rows.push({ rowNumber: r.rowNumber, sheet: "THANG", target, summary: "", action: "error", errors });
      continue;
    }
    const ex = existingByKey.get(keyOf(line, period, sbuId));
    ops.push({ type: "metric", input: { id: ex?.id, line, periodType: "month", period, sbuId, ...values, ...text } });
    rows.push({ rowNumber: r.rowNumber, sheet: "THANG", target, summary: summarize(values, labels) + (Object.keys(text).length ? " · + ghi chú" : ""), action: ex ? "update" : "create", errors: [] });
  }

  // ---- ECOM_SP ----
  const productByName = new Map<string, string>();
  for (const p of ECOM_PRODUCTS) {
    productByName.set(p.key, p.key);
    productByName.set(p.label.toLowerCase(), p.key);
  }
  const labelOf = (key: string) => ECOM_PRODUCTS.find((p) => p.key === key)?.label ?? key;
  const seenP = new Set<string>();
  const existingP = await db.select().from(adsEcomProducts);
  const existingPKeys = new Set(existingP.map((e) => `${e.period}|${e.product}`));
  for (const r of sheets.ECOM_SP ?? []) {
    const errors: string[] = [];
    const from = parseMonthCell(r.data.month_from);
    const to = r.data.month_to ? parseMonthCell(r.data.month_to) : null;
    if (!r.data.month_from) errors.push("Thiếu month_from");
    else if (!from) errors.push(`month_from sai định dạng: "${r.data.month_from}"`);
    if (r.data.month_to && !to) errors.push(`month_to sai định dạng: "${r.data.month_to}"`);
    if (from && to && to < from) errors.push("month_to phải sau month_from");
    const prodRaw = (r.data.product ?? "").trim().toLowerCase();
    const product = productByName.get(prodRaw);
    if (!prodRaw) errors.push("Thiếu product");
    else if (!product) errors.push(`product không hợp lệ: "${r.data.product}" (xem sheet DANH_MUC)`);
    const nums = readNumbers(r, [{ col: "spend", label: "" }, { col: "mql", label: "" }, { col: "hv", label: "" }, { col: "revenue", label: "" }], errors);
    const target = `${from ? MONTH_NAME(from) : "?"}${to && to !== from ? `–${MONTH_NAME(to)}` : ""} · ${product ? labelOf(product) : "?"}`;
    if (!errors.length && !Object.keys(nums).length) {
      rows.push({ rowNumber: r.rowNumber, sheet: "ECOM_SP", target, summary: "chưa điền số", action: "skip", errors: [] });
      continue;
    }
    const key = `${from}|${product}`;
    if (!errors.length && seenP.has(key)) errors.push("Trùng (kỳ, sản phẩm) với dòng trên trong file");
    seenP.add(key);
    if (errors.length || !from || !product) {
      rows.push({ rowNumber: r.rowNumber, sheet: "ECOM_SP", target, summary: "", action: "error", errors });
      continue;
    }
    ops.push({ type: "ecom", period: from, periodEnd: to, product, values: { spend: nums.spend, mql: nums.mql, newStudents: nums.hv, revenue: nums.revenue } });
    rows.push({ rowNumber: r.rowNumber, sheet: "ECOM_SP", target, summary: summarize(nums, { spend: "Spend", mql: "MQL", hv: "HV", revenue: "Doanh thu" }), action: existingPKeys.has(key) ? "update" : "create", errors: [] });
  }
  return { rows, ops };
}

// ---------------------------------------------------------------------------
// THEO REQUEST — sheet REQUEST: mỗi dòng 1 chiến dịch Facebook của 1 trung tâm
// ---------------------------------------------------------------------------

const CAMPAIGN_NUMS: NumSpec[] = [
  { col: "spend", label: "Chi phí" },
  { col: "spend_with_vat", label: "Chi phí gồm VAT" },
  { col: "planned_budget", label: "NS kế hoạch" },
  { col: "messages", label: "Tin nhắn" },
  { col: "reach", label: "Người tiếp cận" },
  { col: "impressions", label: "Lượt hiển thị" },
  { col: "conversations", label: "Cuộc trò chuyện" },
  { col: "comments", label: "Bình luận" },
  { col: "engagements", label: "Tương tác" },
  { col: "reactions", label: "Cảm xúc" },
];
const CAMPAIGN_FIELD: Record<string, string> = { spend_with_vat: "spendWithVat", planned_budget: "plannedBudget" };

async function planRequest(db: DB, sheets: Record<string, ParsedRow[]>): Promise<AdsImportPlan> {
  const sbuByCode = await loadSbus(db);
  const parsed = sheets.REQUEST ?? [];
  // Người chạy: khớp theo họ tên hoặc email (không phân biệt hoa/thường).
  const userRows = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.active, true));
  const userByKey = new Map<string, string>();
  for (const u of userRows) {
    userByKey.set(u.fullName.trim().toLowerCase(), u.id);
    userByKey.set(u.email.trim().toLowerCase(), u.id);
  }
  const months = [...new Set(parsed.map((r) => parseMonthCell(r.data.month)).filter((x): x is string => !!x))];
  const existing = months.length ? await db.select().from(adsCampaigns).where(inArray(adsCampaigns.period, months)) : [];
  const keyOf = (line: string, sbuId: string | null, period: string, name: string) => `${line}|${sbuId ?? ""}|${period}|${name.trim().toLowerCase()}`;
  const existingByKey = new Map(existing.map((e) => [keyOf(e.line, e.sbuId, e.period, e.campaignName), e]));

  const rows: AdsImportPreviewRow[] = [];
  const ops: Op[] = [];
  const seen = new Set<string>();
  for (const r of parsed) {
    const errors: string[] = [];
    const period = parseMonthCell(r.data.month);
    if (!r.data.month) errors.push("Thiếu month");
    else if (!period) errors.push(`month sai định dạng: "${r.data.month}" (dùng mm/yyyy)`);
    // line trống = request của trung tâm B2C (tương thích template cũ); mảng khác: ecom/b2b/osir(vmt)/vmp, không có sbu_code.
    const lineRaw = (r.data.line ?? "").trim().toLowerCase();
    const line: Line | undefined = lineRaw ? LINE_ALIAS[lineRaw] : "b2c_center";
    if (lineRaw && !line) errors.push(`line không hợp lệ: "${r.data.line}" (b2c_center, ecom, b2b, osir/vmt, vmp)`);
    else if (line === "b2c_system") errors.push("Request của B2C là request của TRUNG TÂM: dùng line b2c_center + sbu_code (hoặc để trống line)");
    const code = (r.data.sbu_code ?? "").trim().toUpperCase();
    let sbuId: string | null = null;
    if (line === "b2c_center") {
      if (!code) errors.push("Thiếu sbu_code");
      else if (!sbuByCode.has(code)) errors.push(`sbu_code không tồn tại: ${code}`);
      else sbuId = sbuByCode.get(code)!;
    } else if (line && code) errors.push(`line ${line} không dùng sbu_code`);
    const name = (r.data.campaign_name ?? "").trim();
    if (!name) errors.push("Thiếu campaign_name");
    const nums = readNumbers(r, CAMPAIGN_NUMS, errors);
    const runnerText = (r.data.runner ?? "").trim();
    const runnerId = runnerText ? userByKey.get(runnerText.toLowerCase()) : undefined;
    if (runnerText && !runnerId) errors.push(`runner không khớp người dùng nào: "${runnerText}" (dùng họ tên hoặc email)`);
    const target = `${period ? MONTH_NAME(period) : "?"} · ${line === "b2c_center" ? code || "?" : line ? LINE_NAME[line] : "?"} · ${name || "?"}`;

    const ex = line && period && name ? existingByKey.get(keyOf(line, sbuId, period, name)) : undefined;
    if (!errors.length && !ex && nums.spend === undefined) errors.push("Chiến dịch mới bắt buộc có spend (chi phí)");
    const key = line && period ? keyOf(line, sbuId, period, name) : "";
    if (!errors.length && seen.has(key)) errors.push("Trùng (tháng, mảng/trung tâm, tên chiến dịch) với dòng trên trong file");
    if (key) seen.add(key);
    if (errors.length || !line || !period) {
      rows.push({ rowNumber: r.rowNumber, sheet: "REQUEST", target, summary: "", action: "error", errors });
      continue;
    }
    const fields: Record<string, string | null> = {};
    for (const [col, v] of Object.entries(nums)) if (col !== "spend") fields[CAMPAIGN_FIELD[col] ?? col] = v;
    if (r.data.misa_request_url) fields.misaRequestUrl = r.data.misa_request_url;
    if (runnerId) fields.runnerId = runnerId;
    ops.push({ type: "campaign", id: ex?.id, line, sbuId, period, campaignName: name, fields, spend: nums.spend });
    rows.push({
      rowNumber: r.rowNumber,
      sheet: "REQUEST",
      target,
      summary: summarize(nums, Object.fromEntries(CAMPAIGN_NUMS.map((n) => [n.col, n.label]))),
      action: ex ? "update" : "create",
      errors: [],
    });
  }
  return { rows, ops };
}

// ---------------------------------------------------------------------------
// KẾ HOẠCH THÁNG — sheet KE_HOACH: month*, line*, sbu_code, planned_budget, target_leads, target_new_students,
// target_messages, target_mql, target_revenue, target_deals, notes
// Mục tiêu nào dùng được tuỳ phễu của mảng (lib/ads-lines.ts). B2C: mục tiêu Lead/HVM TỔNG nằm ở dòng b2c_system; dòng b2c_center (từng
// trung tâm) chỉ có planned_budget. Ô trống = giữ nguyên; ô có số = ghi đè.
// ---------------------------------------------------------------------------

const PLAN_COLS: { col: string; field: FunnelField | "plannedBudget"; label: string }[] = [
  { col: "planned_budget", field: "plannedBudget", label: "NS KH" },
  { col: "target_leads", field: "leads", label: "MT Lead" },
  { col: "target_new_students", field: "newStudents", label: "MT HVM" },
  { col: "target_messages", field: "messages", label: "MT Mess" },
  { col: "target_mql", field: "mql", label: "MT MQL" },
  { col: "target_revenue", field: "revenue", label: "MT Doanh thu" },
  { col: "target_deals", field: "deals", label: "MT Deal" },
];

async function planPlan(db: DB, sheets: Record<string, ParsedRow[]>): Promise<AdsImportPlan> {
  const sbuByCode = await loadSbus(db);
  const parsed = sheets.KE_HOACH ?? [];
  const months = [...new Set(parsed.map((r) => parseMonthCell(r.data.month)).filter((x): x is string => !!x))];
  const existing = months.length ? await db.select().from(adsPlans).where(inArray(adsPlans.period, months)) : [];
  const keyOf = (line: string, period: string, sbuId: string | null) => `${line}|${period}|${sbuId ?? ""}`;
  const existingByKey = new Map(existing.map((e) => [keyOf(e.line, e.period, e.sbuId), e]));
  const rows: AdsImportPreviewRow[] = [];
  const ops: Op[] = [];
  const seen = new Set<string>();

  for (const r of parsed) {
    const errors: string[] = [];
    const period = parseMonthCell(r.data.month);
    if (!r.data.month) errors.push("Thiếu month");
    else if (!period) errors.push(`month sai định dạng: "${r.data.month}" (dùng mm/yyyy, vd. 11/2026)`);
    const lineRaw = (r.data.line ?? "").trim().toLowerCase();
    const line = LINE_ALIAS[lineRaw];
    if (!lineRaw) errors.push("Thiếu line");
    else if (!line) errors.push(`line không hợp lệ: "${r.data.line}" (b2c_system, b2c_center, ecom, b2b, osir/vmt, vmp)`);

    const code = (r.data.sbu_code ?? "").trim().toUpperCase();
    let sbuId: string | null = null;
    if (line === "b2c_center") {
      if (!code) errors.push("line b2c_center bắt buộc có sbu_code");
      else if (!sbuByCode.has(code)) errors.push(`sbu_code không tồn tại: ${code}`);
      else sbuId = sbuByCode.get(code)!;
    } else if (line && code) errors.push(`line ${line} không dùng sbu_code`);

    const nums = readNumbers(r, PLAN_COLS.map((c) => ({ col: c.col, label: c.label })), errors);
    const values: Record<string, string> = {};
    if (line) {
      const group = groupOfLine(line);
      // Mục tiêu theo phễu của mảng; riêng từng trung tâm B2C chỉ lập ngân sách.
      const targetOk = (f: FunnelField) => line !== "b2c_center" && group.funnel.some((x) => x.field === f);
      for (const c of PLAN_COLS) {
        if (nums[c.col] === undefined) continue;
        if (c.field === "plannedBudget") values.plannedBudget = nums[c.col];
        else if (!targetOk(c.field)) {
          errors.push(
            line === "b2c_center"
              ? `${c.col} không áp dụng cho từng trung tâm — mục tiêu Lead/HVM tổng nằm ở dòng b2c_system`
              : `${c.col} không áp dụng cho ${LINE_NAME[line]} (phễu: ${group.funnel.map((x) => x.label).join(", ")})`,
          );
        } else values[PLAN_TARGET_COLUMN[c.field]] = nums[c.col];
      }
    }
    const notes = (r.data.notes ?? "").trim();
    if (notes) values.notes = notes;

    const target = `${period ? MONTH_NAME(period) : "?"} · ${line ? LINE_NAME[line] : "?"}${code ? ` · ${code}` : ""}`;
    if (!errors.length && !Object.keys(values).length) {
      rows.push({ rowNumber: r.rowNumber, sheet: "KE_HOACH", target, summary: "chưa điền số", action: "skip", errors: [] });
      continue;
    }
    const key = keyOf(line ?? "", period ?? "", sbuId);
    if (!errors.length && seen.has(key)) errors.push("Trùng (tháng, mảng, trung tâm) với dòng trên trong file");
    seen.add(key);
    if (errors.length || !period || !line) {
      rows.push({ rowNumber: r.rowNumber, sheet: "KE_HOACH", target, summary: "", action: "error", errors });
      continue;
    }
    const ex = existingByKey.get(keyOf(line, period, sbuId));
    ops.push({ type: "plan", input: { line, period, sbuId, ...values } as UpsertAdsPlanInput });
    const labels = Object.fromEntries(PLAN_COLS.map((c) => [c.field === "plannedBudget" ? "plannedBudget" : PLAN_TARGET_COLUMN[c.field], c.label]));
    const numVals = Object.fromEntries(Object.entries(values).filter(([k]) => k !== "notes"));
    rows.push({ rowNumber: r.rowNumber, sheet: "KE_HOACH", target, summary: summarize(numVals, labels) + (values.notes ? " · + ghi chú" : ""), action: ex ? "update" : "create", errors: [] });
  }
  return { rows, ops };
}

// ---------------------------------------------------------------------------
// API chung
// ---------------------------------------------------------------------------

/** Đọc + kiểm tra file, KHÔNG ghi gì. Trả về danh sách dòng để xem trước và danh sách thao tác để ghi. */
export async function planAdsImport(db: DB, kind: AdsImportKind, buf: Buffer): Promise<AdsImportPlan> {
  const sheets = await parseWorkbookSheets(buf, ADS_IMPORT_SHEETS[kind]);
  const total = Object.values(sheets).reduce((s, x) => s + x.length, 0);
  if (total === 0) throw new Error(`Không thấy dữ liệu — file cần có sheet ${ADS_IMPORT_SHEETS[kind].join(" / ")} (dùng đúng template).`);
  if (total > MAX_ROWS) throw new Error(`File có ${total} dòng, vượt trần ${MAX_ROWS}. Tách nhỏ file.`);
  if (kind === "plan") return planPlan(db, sheets);
  if (kind === "week") return planWeek(db, sheets);
  if (kind === "month") return planMonth(db, sheets);
  return planRequest(db, sheets);
}

/** Ghi các thao tác hợp lệ (dòng lỗi đã bị loại khỏi `ops` từ bước kiểm tra). */
export async function applyAdsImport(db: DB, kind: AdsImportKind, plan: AdsImportPlan, actorId: string): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
  const count = (a: ImportAction) => plan.rows.filter((r) => r.action === a).length;
  for (const op of plan.ops) {
    if (op.type === "metric") await upsertAdsMetric(db, op.input, actorId);
    else if (op.type === "plan") await upsertAdsPlan(db, op.input, actorId);
    else if (op.type === "ecom") await upsertEcomProduct(db, { period: op.period, periodEnd: op.periodEnd, product: op.product, values: op.values }, actorId);
    else {
      await upsertAdsCampaign(
        db,
        { id: op.id, line: op.line, sbuId: op.sbuId, period: op.period, campaignName: op.campaignName, ...(op.spend !== undefined ? { spend: op.spend } : {}), ...op.fields } as never,
        actorId,
      );
    }
  }
  const res = { created: count("create"), updated: count("update"), skipped: count("skip"), errors: count("error") };
  await writeAudit(db, { actorId, entity: "ads_import", entityId: null, action: "IMPORT", changes: { kind, ...res } });
  return res;
}
