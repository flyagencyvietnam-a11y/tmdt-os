import { addDaysStr, monthBounds } from "@/lib/time";
import { num, type MetricRow } from "./shared";

/**
 * TUẦN TỰ CỘNG VÀO THÁNG (SPEC Phụ lục D mục 28). Tuần chạy Thứ 2 → Chủ nhật nên có thể cắt ngang ranh giới tháng; mỗi tuần được gán NGUYÊN VẸN cho
 * tháng chiếm nhiều ngày nhất của tuần (= tháng chứa Thứ 5). Số tháng = số nhập chính thức nếu có, ô nào còn trống thì lấy tổng các tuần.
 * THUẦN (client-safe): chỉ tạo dòng số liệu ảo để hiển thị/tổng hợp, KHÔNG ghi DB.
 */

/** Tháng đa số ngày của tuần bắt đầu Thứ 2 `mon`: tháng chứa Thứ 5 (ngày thứ 4 của tuần). Vd. 2026-08-31 → "2026-09". */
export function weekMonth(mon: string): string {
  return addDaysStr(mon, 3).slice(0, 7);
}

const isMonday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1;

/** Mọi tuần (Thứ 2 bắt đầu) thuộc `month` theo quy tắc đa số ngày, cũ → mới. */
export function expectedWeeks(month: string): string[] {
  const [first, last] = monthBounds(`${month}-01`);
  let d = addDaysStr(first, -6);
  for (let i = 0; i < 7 && !isMonday(d); i++) d = addDaysStr(d, 1);
  const out: string[] = [];
  for (; d <= last; d = addDaysStr(d, 7)) if (weekMonth(d) === month) out.push(d);
  return out;
}

/** Các cột số có thể tự cộng từ tuần (khớp `ads_metrics`). */
export const DERIVABLE_FIELDS = ["budget", "centerOrderBudget", "hoTopupBudget", "leads", "newStudents", "messages", "impressions", "revenue", "mql"] as const;
export type DerivableField = (typeof DERIVABLE_FIELDS)[number];

const SYNTHETIC = "derived:";

/** Dòng ảo hoàn toàn từ tuần (chưa có dòng tháng chính thức) — không có id thật, không được dùng để sửa/ghi. */
export const isSynthetic = (r: MetricRow | null | undefined): boolean => !!r && r.id.startsWith(SYNTHETIC);

/** Trường `field` của dòng này đang lấy từ tuần (không phải số chính thức). */
export const isDerivedField = (r: MetricRow | null | undefined, field: string): boolean => !!r && (isSynthetic(r) || !!r.derivedFields?.includes(field));

/** Dòng chính thức của 1 dòng đã gộp: bỏ các trường lấy từ tuần; dòng ảo → null (chưa có dòng chính thức). Dùng khi mở form sửa. */
export function officialOf(r: MetricRow | null | undefined): MetricRow | null {
  if (!r || isSynthetic(r)) return null;
  if (!r.derivedFields?.length) return r;
  const copy: Record<string, unknown> = { ...r };
  for (const f of r.derivedFields) copy[f] = null;
  delete copy.derivedFields;
  delete copy.derivedWeeks;
  return copy as unknown as MetricRow;
}

const keyOf = (month: string, line: string, sbuId: string | null) => `${month}|${line}|${sbuId ?? ""}`;

/**
 * Trả về `rows` với dòng THÁNG được bổ sung từ dòng TUẦN:
 *  - Tháng đã qua: chỉ cộng khi MỌI tuần đã kết thúc của tháng đó đều có số liệu (thiếu tuần thì để trống, không cộng dở).
 *  - Tháng đang chạy / chưa tới: cộng từ các tuần đã có (tạm tính lũy kế).
 *  - Số chính thức (ô không trống, kể cả 0) luôn thắng; chỉ ô trống mới lấy tổng các tuần của đúng SBU + đúng chỉ số.
 * Dòng được bổ sung có `derivedFields` (+ `derivedWeeks` "x/y"); dòng chưa có bản chính thức là dòng ảo (`isSynthetic`).
 */
export function withDerivedMonths(rows: MetricRow[], today: string): MetricRow[] {
  const weekRows = rows.filter((r) => r.periodType === "week");
  if (weekRows.length === 0) return rows;

  const weeksWithData = new Set(weekRows.map((r) => r.period));
  const currentMonth = today.slice(0, 7);
  const monthOk = new Map<string, { expected: string[]; present: number }>();
  const byKey = new Map<string, MetricRow[]>();
  for (const w of weekRows) {
    const m = weekMonth(w.period);
    let ok = monthOk.get(m);
    if (!ok) {
      const expected = expectedWeeks(m);
      const present = expected.filter((x) => weeksWithData.has(x)).length;
      const finishedAllPresent = expected.filter((x) => addDaysStr(x, 6) <= today).every((x) => weeksWithData.has(x));
      ok = present > 0 && (finishedAllPresent || m >= currentMonth) ? { expected, present } : { expected, present: 0 };
      monthOk.set(m, ok);
    }
    if (ok.present === 0) continue;
    const k = keyOf(m, w.line, w.sbuId);
    const list = byKey.get(k);
    if (list) list.push(w);
    else byKey.set(k, [w]);
  }
  if (byKey.size === 0) return rows;

  const official = new Map<string, MetricRow>();
  for (const r of rows) if (r.periodType === "month") official.set(keyOf(r.period, r.line, r.sbuId), r);

  const replaced = new Map<string, MetricRow>();
  const added: MetricRow[] = [];
  for (const [k, ws] of byKey) {
    const [month, line, sbu] = k.split("|");
    const base = official.get(k);
    const derived: Partial<Record<DerivableField, string>> = {};
    for (const f of DERIVABLE_FIELDS) {
      if (base && num(base[f]) != null) continue;
      let sum: number | null = null;
      for (const w of ws) {
        const v = num(w[f]);
        if (v != null) sum = (sum ?? 0) + v;
      }
      if (sum != null) derived[f] = String(sum);
    }
    const fields = Object.keys(derived);
    if (fields.length === 0) continue;
    const info = monthOk.get(month)!;
    const derivedWeeks = `${info.present}/${info.expected.length}`;
    if (base) replaced.set(base.id, { ...base, ...derived, derivedFields: [...(base.derivedFields ?? []), ...fields], derivedWeeks });
    else
      added.push({
        id: `${SYNTHETIC}${k}`,
        line: line as MetricRow["line"],
        periodType: "month",
        period: month,
        sbuId: sbu || null,
        budget: null,
        centerOrderBudget: null,
        hoTopupBudget: null,
        leads: null,
        newStudents: null,
        messages: null,
        impressions: null,
        revenue: null,
        actualRevenue: null,
        mql: null,
        deals: null,
        status: "planned",
        ...derived,
        derivedFields: fields,
        derivedWeeks,
      });
  }
  return [...rows.map((r) => replaced.get(r.id) ?? r), ...added];
}
