/**
 * Mô hình báo cáo trung lập: mỗi báo cáo = 1 ReportDoc gồm các "section". Hai bộ render dùng chung 1 nguồn dữ liệu:
 *  - Excel (lib/reports/xlsx.ts): bìa + mục lục + 1 sheet/section, có logo, định dạng số, tô màu, bộ lọc.
 *  - PDF (components/report/report-doc-view.tsx → trang in /in-bao-cao/[kind]): bố cục A4 có logo, thẻ KPI, bảng, biểu đồ.
 */
export type ReportKind = "sbu" | "brand" | "growth" | "management";
export const REPORT_KINDS: ReportKind[] = ["sbu", "brand", "growth", "management"];

export type CellValue = string | number | null;
export type ColFormat = "text" | "int" | "money" | "pct" | "date" | "dec1";

export interface ReportColumn {
  header: string;
  key: string;
  align?: "left" | "right" | "center";
  /** Bề rộng cột Excel (ký tự). */
  width?: number;
  format?: ColFormat;
  /** Tô nền theo độ lớn (heatmap) — cả Excel lẫn PDF. */
  heat?: boolean;
}

export interface TableSection {
  type: "table";
  title: string;
  note?: string;
  columns: ReportColumn[];
  /** Mỗi dòng: giá trị theo key; `_kind: "subtotal"` = dòng tổng nhóm (in đậm), `"group"` = dòng tiêu đề nhóm. */
  rows: (Record<string, CellValue> & { _kind?: "subtotal" | "group" })[];
  totals?: Record<string, CellValue>;
}

export interface KpiSection {
  type: "kpis";
  items: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "brand" | "neutral" }[];
}

export interface BarsSection {
  type: "bars";
  title: string;
  note?: string;
  format?: ColFormat;
  items: { label: string; value: number; color?: string }[];
}

export interface TrendSection {
  type: "trend";
  title: string;
  note?: string;
  format?: ColFormat;
  periods: string[];
  /** stacked = cột chồng; line = đường (hiển thị PDF dạng cột nhóm/đường). */
  mode?: "stacked" | "grouped";
  series: { label: string; color: string; values: (number | null)[] }[];
}

export interface TextSection {
  type: "text";
  title?: string;
  body: string;
}

export type ReportSection = TableSection | KpiSection | BarsSection | TrendSection | TextSection;

export interface ReportDoc {
  kind: ReportKind;
  title: string;
  subtitle: string;
  /** vd. "Tháng 10/2026" */
  periodLabel: string;
  generatedAt: string;
  generatedBy: string;
  orientation: "portrait" | "landscape";
  sections: ReportSection[];
  /** Ghi chú cuối báo cáo (phạm vi, nguồn số liệu, quy ước). */
  footnotes?: string[];
}

export const BRAND_COLORS = { red: "#be202f", redDark: "#921824", gold: "#8b672a", goldSoft: "#cba656", cream: "#fbf7ef", plum: "#3d2a6d" } as const;
/** Bảng màu series cho biểu đồ (nhất quán Excel/PDF). */
export const SERIES_COLORS = ["#be202f", "#8b672a", "#3d2a6d", "#0e7490", "#059669", "#d97706", "#7c3aed", "#475569"];
