/** Định dạng hiển thị dùng chung — ngày kiểu Việt Nam dd/mm/yyyy (SPEC Mục 2.6). */

export function fmtDate(dayStr: string | null | undefined): string {
  if (!dayStr) return "—";
  const [y, m, d] = dayStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const vn = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const date = `${String(vn.getUTCDate()).padStart(2, "0")}/${String(vn.getUTCMonth() + 1).padStart(2, "0")}/${vn.getUTCFullYear()}`;
  const hh = String(vn.getUTCHours()).padStart(2, "0");
  const mm = String(vn.getUTCMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mm}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n * 10) / 10}%`;
}
