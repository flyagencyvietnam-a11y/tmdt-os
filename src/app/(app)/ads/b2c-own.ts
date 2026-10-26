import { weekMonth } from "./month-derive";
import { num, type MetricRow } from "./shared";

/**
 * TÁCH LEAD/HVM CỦA HO · FB THÀNH PHẦN "RIÊNG PAGE TỔNG" (SPEC Phụ lục D mục 35). THUẦN (client-safe), chỉ dùng để HIỂN THỊ/TỔNG HỢP — KHÔNG ghi DB.
 *
 * Số lưu ở dòng HO · FB là Lead/HVM TỔNG cả B2C (quy ước cũ), còn từng trung tâm là phần quy riêng cho ads trung tâm (page TT). Để bảng CỘNG được
 * (Tổng cộng = tổng các khối: MKT HO + KV1 + KV2 + KV3 + Ecom + VMP + VMT) và mỗi dòng tự chia được Ngân sách ÷ Lead/HVM của đúng dòng đó, ta trừ phần các
 * trung tâm khỏi dòng HO · FB → HO · FB chỉ còn phần của page Tổng. Kỳ nào trung tâm chưa có số (trước 03/2026) thì HO · FB vẫn mang toàn bộ.
 *
 *  - Lead: trừ trực tiếp theo từng kỳ (tuần/tháng) — Lead trung tâm có số theo tuần thật.
 *  - HVM tháng/quý: trừ trực tiếp theo tháng.
 *  - HVM TUẦN: HVM riêng của trung tâm chỉ có theo THÁNG (đã dồn vào tuần cuối tháng) nên phần cần trừ của cả tháng được trừ dần từ tuần cuối tháng
 *    ngược về các tuần trước (mỗi tuần trừ tối đa bằng HVM đã lưu của tuần đó) → tổng các tuần của tháng đúng bằng số trừ trực tiếp theo tháng.
 */

const key = (r: MetricRow) => `${r.periodType}|${r.period}`;
const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);
const own = (stored: number | null, off: number) => (stored == null ? null : String(Math.max(0, stored - off)));

export function splitB2cOwn(rows: MetricRow[]): MetricRow[] {
  const centers = new Map<string, { leads: number | null; hvm: number | null }>();
  const weekHvmByMonth = new Map<string, number>();
  for (const r of rows) {
    if (r.line !== "b2c_center") continue;
    const c = centers.get(key(r)) ?? { leads: null, hvm: null };
    c.leads = add(c.leads, num(r.leads));
    c.hvm = add(c.hvm, num(r.newStudents));
    centers.set(key(r), c);
    const h = num(r.newStudents);
    if (r.periodType === "week" && h != null) weekHvmByMonth.set(weekMonth(r.period), (weekHvmByMonth.get(weekMonth(r.period)) ?? 0) + h);
  }
  if (centers.size === 0) return rows;

  // HVM tuần: trừ dần từ tuần cuối tháng ngược về trước.
  const weekCut = new Map<string, number>(); // key tuần HO → HVM trừ
  const weekOver = new Set<string>(); // tuần cuối còn dư chưa trừ hết (tháng thiếu HVM tổng)
  const hoWeeks = rows.filter((r) => r.line === "b2c_system" && !r.sbuId && r.periodType === "week").sort((a, b) => b.period.localeCompare(a.period));
  const remaining = new Map(weekHvmByMonth);
  for (const r of hoWeeks) {
    const m = weekMonth(r.period);
    const left = remaining.get(m) ?? 0;
    const stored = num(r.newStudents);
    if (left <= 0 || stored == null) continue;
    const take = Math.min(stored, left);
    weekCut.set(key(r), take);
    remaining.set(m, left - take);
  }
  const lastWeekOfMonth = new Map<string, string>();
  for (const r of hoWeeks) if (!lastWeekOfMonth.has(weekMonth(r.period))) lastWeekOfMonth.set(weekMonth(r.period), key(r));
  for (const [m, left] of remaining) if (left > 0 && lastWeekOfMonth.has(m)) weekOver.add(lastWeekOfMonth.get(m)!);

  return rows.map((r) => {
    if (r.line !== "b2c_system" || r.sbuId) return r;
    const c = centers.get(key(r));
    const week = r.periodType === "week";
    const hasHvmCut = week ? weekCut.has(key(r)) || weekOver.has(key(r)) : (c?.hvm ?? null) != null;
    if ((!c || c.leads == null) && !hasHvmCut) return r;
    const leads = num(r.leads);
    const hvm = num(r.newStudents);
    const offLeads = c?.leads ?? 0;
    const offHvm = week ? (weekCut.get(key(r)) ?? 0) : (c?.hvm ?? 0);
    const warn: string[] = [];
    if (leads != null && offLeads > leads) warn.push(`Lead các trung tâm (${offLeads}) lớn hơn tổng B2C đã lưu (${leads})`);
    if (!week && hvm != null && offHvm > hvm) warn.push(`HVM các trung tâm (${offHvm}) lớn hơn tổng B2C đã lưu (${hvm})`);
    if (week && weekOver.has(key(r))) warn.push(`HVM các trung tâm của tháng lớn hơn tổng B2C đã lưu của các tuần trong tháng`);
    return {
      ...r,
      b2cWarn: warn.length ? `${warn.join("; ")} — HO · FB bị chặn ở 0, cần cập nhật số tổng B2C` : undefined,
      leads: own(leads, offLeads),
      newStudents: own(hvm, offHvm),
      b2cOwn: true,
      b2cOffset: { leads: offLeads, newStudents: offHvm },
    };
  });
}
