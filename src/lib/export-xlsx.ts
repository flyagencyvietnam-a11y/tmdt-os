import ExcelJS from "exceljs";

export interface XlsxSheetSpec {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

/** Dựng workbook .xlsx nhiều sheet từ dữ liệu thuần — dùng cho xuất view & template import. */
export async function buildXlsx(sheets: XlsxSheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    for (const row of s.rows) ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
