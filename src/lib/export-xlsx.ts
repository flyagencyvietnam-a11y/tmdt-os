import ExcelJS from "exceljs";

export interface XlsxSheet {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

/** Dựng file XLSX nhiều sheet. SPEC Mục 16.1 (xuất CSV + XLSX). */
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VMG TMĐT OS";
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 2),
    }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F0EF" },
    };
    for (const r of s.rows) ws.addRow(r);
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}
