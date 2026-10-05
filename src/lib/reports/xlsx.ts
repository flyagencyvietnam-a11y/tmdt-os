import ExcelJS from "exceljs";
import { LOGO_PNG_BASE64, LOGO_RATIO } from "./logo-data";
import { BRAND_COLORS, type BarsSection, type ColFormat, type ReportColumn, type ReportDoc, type TableSection, type TrendSection } from "./types";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const RED = argb(BRAND_COLORS.red);
const GOLD = argb(BRAND_COLORS.gold);
const GOLD_SOFT = argb(BRAND_COLORS.goldSoft);
const CREAM = argb(BRAND_COLORS.cream);
const GRAY_TEXT = "FF64748B";
const FONT = "Calibri";

const NUMFMT: Record<ColFormat, string | undefined> = {
  text: undefined,
  int: "#,##0",
  money: '#,##0" ₫"',
  pct: "0.0%",
  date: undefined,
  dec1: "#,##0.0",
};

const thin = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

/** Dải đầu trang: logo + tên báo cáo + kỳ, kẻ vàng bên dưới — dùng cho mọi sheet. */
function pageHeader(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, logoId: number, doc: ReportDoc, lastCol: number, sheetTitle?: string) {
  for (let r = 1; r <= 3; r++) {
    ws.getRow(r).height = r === 2 ? 26 : 20;
    for (let c = 1; c <= lastCol; c++) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
  }
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 118, height: Math.round(118 / LOGO_RATIO) } });
  const titleStart = Math.min(3, lastCol);
  ws.mergeCells(2, titleStart, 2, lastCol);
  const t = ws.getCell(2, titleStart);
  t.value = sheetTitle ?? doc.title;
  t.font = { name: FONT, size: 17, bold: true, color: { argb: RED } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.mergeCells(3, titleStart, 3, lastCol);
  const s = ws.getCell(3, titleStart);
  s.value = `${doc.periodLabel} · ${doc.subtitle}`;
  s.font = { name: FONT, size: 10, color: { argb: GRAY_TEXT } };
  s.alignment = { vertical: "top", horizontal: "left" };
  for (let c = 1; c <= lastCol; c++) ws.getCell(4, c).border = { top: { style: "medium", color: { argb: GOLD_SOFT } } };
  ws.getRow(4).height = 6;
  ws.properties.tabColor = { argb: RED };
  ws.pageSetup = { paperSize: 9, orientation: doc.orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: `&L&8VMG MKT OS — ${doc.title}&C&8Trang &P / &N&R&8Xuất ${doc.generatedAt.slice(0, 10).split("-").reverse().join("/")}` };
  void wb;
}

function fillTableRow(ws: ExcelJS.Worksheet, rowNo: number, cols: ReportColumn[], values: Record<string, string | number | null | undefined>, style?: "subtotal" | "total" | "group" | "zebra") {
  cols.forEach((c, i) => {
    const cell = ws.getCell(rowNo, i + 1);
    const v = values[c.key];
    cell.value = v === undefined ? null : v;
    const fmt = NUMFMT[c.format ?? "text"];
    if (fmt && typeof v === "number") cell.numFmt = fmt;
    cell.alignment = { vertical: "middle", horizontal: c.align ?? (c.format && c.format !== "text" && c.format !== "date" ? "right" : "left"), wrapText: c.format === "text" || !c.format };
    cell.border = BORDER;
    cell.font = { name: FONT, size: 10, bold: style === "subtotal" || style === "total" || style === "group" };
    if (style === "zebra") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    if (style === "subtotal") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1E9D8" } };
    if (style === "group") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9DEC4" } };
    if (style === "total") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE6D2" } };
      cell.border = { ...BORDER, top: { style: "medium", color: { argb: GOLD } } };
    }
  });
}

function writeTable(ws: ExcelJS.Worksheet, startRow: number, section: TableSection): number {
  const cols = section.columns;
  let r = startRow;
  ws.mergeCells(r, 1, r, Math.max(cols.length, 2));
  const title = ws.getCell(r, 1);
  title.value = section.title;
  title.font = { name: FONT, size: 13, bold: true, color: { argb: GOLD } };
  r++;
  if (section.note) {
    ws.mergeCells(r, 1, r, Math.max(cols.length, 2));
    const n = ws.getCell(r, 1);
    n.value = section.note;
    n.font = { name: FONT, size: 9, italic: true, color: { argb: GRAY_TEXT } };
    n.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 26;
    r++;
  }
  const headerRow = r;
  cols.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    cell.alignment = { vertical: "middle", horizontal: c.align ?? (c.format && c.format !== "text" && c.format !== "date" ? "right" : "left"), wrapText: true };
    cell.border = BORDER;
    const col = ws.getColumn(i + 1);
    col.width = Math.max(col.width ?? 0, c.width ?? (c.format && c.format !== "text" ? 14 : 24));
  });
  ws.getRow(r).height = 30;
  r++;
  const firstData = r;
  let zebra = false;
  for (const row of section.rows) {
    const kind = row._kind;
    fillTableRow(ws, r, cols, row, kind ?? (zebra ? "zebra" : undefined));
    if (!kind) zebra = !zebra;
    r++;
  }
  const lastData = r - 1;
  if (section.totals) {
    fillTableRow(ws, r, cols, section.totals, "total");
    r++;
  }
  // heatmap cho cột heat
  cols.forEach((c, i) => {
    if (!c.heat || lastData < firstData) return;
    const col = ws.getColumn(i + 1).letter;
    ws.addConditionalFormatting({
      ref: `${col}${firstData}:${col}${lastData}`,
      rules: [{ type: "colorScale", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FFF0D9A8" }] }],
    });
  });
  if (lastData >= firstData) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols.length } };
  return r + 1;
}

function barsToTable(s: BarsSection): TableSection {
  const total = s.items.reduce((a, b) => a + b.value, 0);
  return {
    type: "table",
    title: s.title,
    note: s.note,
    columns: [
      { header: "Hạng mục", key: "label", width: 32 },
      { header: "Giá trị", key: "value", format: s.format ?? "int", heat: true },
      { header: "Tỷ trọng", key: "share", format: "pct" },
    ],
    rows: s.items.map((i) => ({ label: i.label, value: i.value, share: total ? i.value / total : null })),
    totals: s.format === "pct" ? undefined : { label: "Tổng", value: total, share: total ? 1 : null },
  };
}

function trendToTable(s: TrendSection): TableSection {
  return {
    type: "table",
    title: s.title,
    note: s.note,
    columns: [{ header: "Kỳ", key: "period", width: 14 }, ...s.series.map((x, i) => ({ header: x.label, key: `s${i}`, format: s.format ?? ("int" as ColFormat), heat: true })), ...(s.series.length > 1 ? [{ header: "Tổng", key: "sum", format: s.format ?? ("int" as ColFormat) }] : [])],
    rows: s.periods.map((p, pi) => {
      const row: Record<string, string | number | null> = { period: p };
      let sum = 0;
      let any = false;
      s.series.forEach((x, i) => {
        row[`s${i}`] = x.values[pi];
        if (x.values[pi] != null) {
          sum += x.values[pi]!;
          any = true;
        }
      });
      row.sum = any ? sum : null;
      return row;
    }),
  };
}

export async function renderXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VMG MKT OS";
  wb.created = new Date(doc.generatedAt);
  wb.title = `${doc.title} — ${doc.periodLabel}`;
  const logoId = wb.addImage({ base64: LOGO_PNG_BASE64, extension: "png" });
  const used = new Set<string>();

  // ===== Sheet bìa / tổng quan =====
  const ov = wb.addWorksheet(safeSheetName("Tổng quan", used), { views: [{ showGridLines: false }] });
  const OV_COLS = 8;
  for (let c = 1; c <= OV_COLS; c++) ov.getColumn(c).width = 17;
  pageHeader(wb, ov, logoId, doc, OV_COLS);
  let r = 6;
  const meta: [string, string][] = [
    ["Kỳ báo cáo", doc.periodLabel],
    ["Phạm vi", doc.subtitle],
    ["Ngày xuất", new Date(doc.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
    ["Người xuất", doc.generatedBy],
  ];
  for (const [k, v] of meta) {
    ov.mergeCells(r, 1, r, 2);
    ov.getCell(r, 1).value = k;
    ov.getCell(r, 1).font = { name: FONT, size: 10, color: { argb: GRAY_TEXT } };
    ov.mergeCells(r, 3, r, OV_COLS);
    ov.getCell(r, 3).value = v;
    ov.getCell(r, 3).font = { name: FONT, size: 10, bold: true };
    r++;
  }
  r++;

  const tableSections: TableSection[] = [];
  const index: { sheet: string; title: string }[] = [];
  for (const sec of doc.sections) {
    if (sec.type === "kpis") {
      const toneColor = { good: "FF047857", bad: "FFB91C1C", brand: RED, neutral: "FF0F172A" } as const;
      sec.items.forEach((k, i) => {
        const c0 = (i % 4) * 2 + 1;
        const r0 = r + Math.floor(i / 4) * 4;
        for (let rr = r0; rr < r0 + 3; rr++) for (let cc = c0; cc < c0 + 2; cc++) ov.getCell(rr, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        ov.mergeCells(r0, c0, r0, c0 + 1);
        ov.mergeCells(r0 + 1, c0, r0 + 1, c0 + 1);
        ov.mergeCells(r0 + 2, c0, r0 + 2, c0 + 1);
        const l = ov.getCell(r0, c0);
        l.value = k.label;
        l.font = { name: FONT, size: 9, bold: true, color: { argb: GRAY_TEXT } };
        l.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: true };
        const v = ov.getCell(r0 + 1, c0);
        v.value = k.value;
        v.font = { name: FONT, size: 18, bold: true, color: { argb: toneColor[k.tone ?? "neutral"] } };
        v.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        const sb = ov.getCell(r0 + 2, c0);
        sb.value = k.sub ?? "";
        sb.font = { name: FONT, size: 9, color: { argb: GRAY_TEXT } };
        sb.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        ov.getRow(r0 + 1).height = 30;
        // viền thẻ
        for (let rr = r0; rr < r0 + 3; rr++)
          for (let cc = c0; cc < c0 + 2; cc++)
            ov.getCell(rr, cc).border = {
              top: rr === r0 ? { style: "thin", color: { argb: "FFE2E8F0" } } : undefined,
              bottom: rr === r0 + 2 ? { style: "thin", color: { argb: "FFE2E8F0" } } : undefined,
              left: cc === c0 ? { style: "medium", color: { argb: GOLD_SOFT } } : undefined,
              right: cc === c0 + 1 ? { style: "thin", color: { argb: "FFE2E8F0" } } : undefined,
            };
      });
      r += Math.ceil(sec.items.length / 4) * 4 + 1;
    } else if (sec.type === "text") {
      if (sec.title) {
        ov.getCell(r, 1).value = sec.title;
        ov.getCell(r, 1).font = { name: FONT, size: 12, bold: true, color: { argb: GOLD } };
        r++;
      }
      ov.mergeCells(r, 1, r, OV_COLS);
      const c = ov.getCell(r, 1);
      c.value = sec.body;
      c.font = { name: FONT, size: 10 };
      c.alignment = { wrapText: true, vertical: "top" };
      ov.getRow(r).height = Math.max(30, Math.ceil(sec.body.length / 110) * 15);
      r += 2;
    } else if (sec.type === "table") tableSections.push(sec);
    else if (sec.type === "bars") tableSections.push(barsToTable(sec));
    else tableSections.push(trendToTable(sec));
  }

  // ===== Mỗi bảng 1 sheet =====
  tableSections.forEach((t, i) => {
    const name = safeSheetName(`${i + 1}. ${t.title}`, used);
    index.push({ sheet: name, title: t.title });
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
    const lastCol = Math.max(t.columns.length, 4);
    pageHeader(wb, ws, logoId, doc, lastCol, t.title);
    const end = writeTable(ws, 6, t);
    void end;
    // đóng băng cột đầu + dòng tiêu đề bảng (dòng 6 tiêu đề [+ ghi chú] → header ở dòng 7/8)
    const headerRowNo = t.note ? 8 : 7;
    ws.views = [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: headerRowNo }];
  });

  // ===== Mục lục (liên kết) =====
  if (index.length) {
    ov.getCell(r, 1).value = "Nội dung báo cáo";
    ov.getCell(r, 1).font = { name: FONT, size: 12, bold: true, color: { argb: GOLD } };
    r++;
    index.forEach((x, i) => {
      ov.mergeCells(r, 1, r, OV_COLS);
      const c = ov.getCell(r, 1);
      c.value = { text: `${i + 1}. ${x.title}`, hyperlink: `#'${x.sheet}'!A1` };
      c.font = { name: FONT, size: 10, underline: true, color: { argb: "FF1D4ED8" } };
      r++;
    });
  }
  if (doc.footnotes?.length) {
    r++;
    for (const f of doc.footnotes) {
      ov.mergeCells(r, 1, r, OV_COLS);
      const c = ov.getCell(r, 1);
      c.value = `• ${f}`;
      c.font = { name: FONT, size: 9, italic: true, color: { argb: GRAY_TEXT } };
      c.alignment = { wrapText: true, vertical: "top" };
      ov.getRow(r).height = Math.max(15, Math.ceil(f.length / 120) * 14);
      r++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
