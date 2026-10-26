import { num, type MetricRow } from "./shared";

/**
 * TÁCH LEAD/HVM CỦA HO · FB THÀNH PHẦN "RIÊNG PAGE TỔNG" (SPEC Phụ lục D mục 35). THUẦN (client-safe), chỉ dùng để HIỂN THỊ bảng theo dõi — KHÔNG ghi DB.
 *
 * Số lưu ở dòng HO · FB là Lead/HVM TỔNG cả B2C (quy ước cũ), còn từng trung tâm là phần quy riêng cho ads trung tâm (page TT). Để mỗi dòng tự chia
 * được Ngân sách ÷ Lead/HVM của đúng dòng đó, ta trừ phần các trung tâm khỏi dòng HO · FB → HO · FB chỉ còn lead của page Tổng; sau đó mọi dòng
 * CỘNG được với nhau (Tổng cộng = HO + trung tâm + Google + …). Kỳ nào trung tâm chưa có số (trước 03/2026) thì HO · FB vẫn mang toàn bộ.
 *
 * Riêng HVM THEO TUẦN không tách được: HVM riêng của trung tâm chỉ có theo THÁNG (đã dồn vào tuần cuối tháng) nên trừ theo tuần sẽ sai —
 * dòng tuần giữ HVM TỔNG B2C (`hvmTotal`), CAC của nó chia tổng chi B2C.
 */

const key = (r: MetricRow) => `${r.periodType}|${r.period}`;
const add = (a: number | null, b: number | null) => (b == null ? a : (a ?? 0) + b);

export function splitB2cOwn(rows: MetricRow[]): MetricRow[] {
  const centers = new Map<string, { leads: number | null; hvm: number | null }>();
  for (const r of rows) {
    if (r.line !== "b2c_center") continue;
    const c = centers.get(key(r)) ?? { leads: null, hvm: null };
    c.leads = add(c.leads, num(r.leads));
    c.hvm = add(c.hvm, num(r.newStudents));
    centers.set(key(r), c);
  }
  if (centers.size === 0) return rows;
  return rows.map((r) => {
    if (r.line !== "b2c_system" || r.sbuId) return r;
    const c = centers.get(key(r));
    if (!c || (c.leads == null && c.hvm == null)) return r;
    const week = r.periodType === "week";
    const leads = num(r.leads);
    const hvm = num(r.newStudents);
    const offLeads = c.leads ?? 0;
    const offHvm = week ? 0 : (c.hvm ?? 0);
    const warn: string[] = [];
    if (leads != null && offLeads > leads) warn.push(`Lead các trung tâm (${offLeads}) lớn hơn tổng B2C đã lưu (${leads})`);
    if (!week && hvm != null && offHvm > hvm) warn.push(`HVM các trung tâm (${offHvm}) lớn hơn tổng B2C đã lưu (${hvm})`);
    return {
      ...r,
      b2cWarn: warn.length ? `${warn.join("; ")} — HO · FB hiển thị 0, cần cập nhật số tổng B2C` : undefined,
      leads: leads == null ? null : String(Math.max(0, leads - offLeads)),
      newStudents: hvm == null || week ? r.newStudents : String(Math.max(0, hvm - offHvm)),
      b2cOwn: true,
      hvmTotal: week,
      b2cOffset: { leads: offLeads, newStudents: offHvm },
    };
  });
}
