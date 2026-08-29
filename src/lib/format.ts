/** Trình bày số — SPEC Mục 20.3. Không có dữ liệu => "-", KHÔNG "0". */

export const DASH = "–";

export function fmtVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

/** Số lớn rút gọn cho thẻ chỉ số: "12,3 tr", "1,45 tỷ". */
export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000)
    return `${(v / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (abs >= 1_000)
    return `${(v / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString("vi-VN");
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString("vi-VN");
}

/** Tỷ lệ 0..1 -> phần trăm 1 chữ số thập phân. */
export function fmtPct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return DASH;
  return `${(ratio * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

export function fmtRatioX(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}x`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return DASH;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return DASH;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return DASH;
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
