import type { GridColumn } from "./types";

/** Xuất đúng các dòng đang lọc + cột đang hiện (SPEC Mục 16.1). */
export function rowsToCsv<Row>(
  rows: Row[],
  columns: GridColumn<Row>[],
): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.header)).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const raw = c.accessor(r);
          if (c.kind === "enum" && c.enumLabels && typeof raw === "string")
            return esc(c.enumLabels[raw] ?? raw);
          return esc(raw instanceof Date ? raw.toISOString() : raw);
        })
        .join(","),
    )
    .join("\n");
  return `﻿${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
