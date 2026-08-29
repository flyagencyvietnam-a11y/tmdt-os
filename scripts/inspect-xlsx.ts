import ExcelJS from "exceljs";
import path from "node:path";

const file = path.resolve("data/seed/VMG_Ads_Lead_Tracker.xlsx");

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  console.log("=== SHEETS ===");
  wb.eachSheet((ws) => {
    console.log(`- "${ws.name}"  rows=${ws.rowCount} cols=${ws.columnCount} state=${ws.state}`);
  });

  const target = process.argv[2];
  if (!target) return;

  const ws = wb.getWorksheet(target);
  if (!ws) {
    console.log(`sheet "${target}" not found`);
    return;
  }
  const maxRows = Number(process.argv[3] ?? 15);
  console.log(`\n=== "${target}" first ${maxRows} rows ===`);
  for (let r = 1; r <= Math.min(maxRows, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const vals: unknown[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c);
      let v: unknown = cell.value;
      if (v && typeof v === "object" && "result" in (v as any)) v = (v as any).result;
      if (v && typeof v === "object" && "text" in (v as any)) v = (v as any).text;
      if (v && typeof v === "object" && "richText" in (v as any))
        v = (v as any).richText.map((t: any) => t.text).join("");
      vals.push(v);
    }
    console.log(`R${r}:`, JSON.stringify(vals));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
