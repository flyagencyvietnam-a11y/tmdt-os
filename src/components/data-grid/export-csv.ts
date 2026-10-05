import type { GridColumn } from "./types";

/** Ngày xuất ra file luôn dd/mm/yyyy (kể cả cột ngày giờ → dd/mm/yyyy). */
function exportValue(kind: string, raw: unknown): unknown {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10).split("-").reverse().join("/");
  if ((kind === "date" || kind === "datetime") && typeof raw === "string") {
    const m = /^(d{4})-(d{2})-(d{2})/.exec(raw);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return raw;
}

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
          return esc(exportValue(c.kind, raw));
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

/** Xuất XLSX qua API (ghi audit ở server). SPEC Mục 16.1. */
export async function downloadXlsx<Row>(
  filename: string,
  entity: string,
  rows: Row[],
  columns: GridColumn<Row>[],
): Promise<void> {
  const payload = {
    filename,
    entity,
    sheets: [
      {
        name: entity,
        columns: columns.map((c) => ({ header: c.header, key: c.field })),
        rows: rows.map((r) => {
          const o: Record<string, unknown> = {};
          for (const c of columns) {
            const raw = c.accessor(r);
            o[c.field] =
              c.kind === "enum" && c.enumLabels && typeof raw === "string"
                ? (c.enumLabels[raw] ?? raw)
                : exportValue(c.kind, raw);
          }
          return o;
        }),
      },
    ],
  };
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Xuất XLSX thất bại");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
