import ExcelJS from "exceljs";

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
}

/** Đọc sheet đầu tiên của .xlsx hoặc .csv thành danh sách dòng key-value theo header (SPEC Mục 10.1). */
export async function parseSheet(buf: Buffer, filename: string): Promise<ParsedRow[]> {
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line, i) => {
      const cells = splitCsvLine(line);
      const data: Record<string, string> = {};
      headers.forEach((h, idx) => (data[h.trim()] = (cells[idx] ?? "").trim()));
      return { rowNumber: i + 2, data };
    });
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headerRow = ws.getRow(1).values as unknown[];
  const headers = headerRow.map((v) => (v == null ? "" : String(v).trim()));
  const out: ParsedRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      const v = values[idx];
      data[h] = v == null ? "" : String(v).trim();
    });
    if (Object.values(data).some((v) => v !== "")) out.push({ rowNumber, data });
  });
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
