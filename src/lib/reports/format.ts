import type { CellValue, ColFormat } from "./types";

/** Định dạng ô cho bản PDF/HTML (bản Excel dùng numFmt riêng, cùng ý nghĩa). */
export function formatCell(v: CellValue | undefined, format: ColFormat | undefined): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "";
  switch (format) {
    case "pct":
      return `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
    case "dec1":
      return v.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case "int":
    case "money":
    default:
      return Math.round(v).toLocaleString("vi-VN");
  }
}

/** Rút gọn số lớn cho trục biểu đồ / nhãn cột: 1,2 tr · 3,4 tỷ · 12,5 N. */
export function compactNumber(v: number, money = false): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${money ? "tr" : "M"}`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${money ? "N" : "K"}`;
  return Math.round(v).toLocaleString("vi-VN");
}
