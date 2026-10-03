import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** T9 — Danh mục hạng mục SBU (Phase 2, Phụ lục B7), khoá `code`. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Mỗi dòng là 1 hạng mục trong ma trận SBU (SPEC Mục 4.2/9.3). code là khoá chống trùng." },
        { note: "ho_plan/ho_execute/ho_control: nhập 'x' nếu có. default_recurring_rule_code (nếu có) phải trùng rule_code đã tạo ở T4." },
      ],
    },
    {
      name: "CATALOG",
      columns: [
        { header: "code*", key: "code", width: 12 },
        { header: "group*", key: "group", width: 18 },
        { header: "title*", key: "title", width: 30 },
        { header: "description", key: "description", width: 36 },
        { header: "ho_plan", key: "ho_plan", width: 10 },
        { header: "ho_execute", key: "ho_execute", width: 10 },
        { header: "ho_control", key: "ho_control", width: 10 },
        { header: "center_role", key: "center_role", width: 24 },
        { header: "cycle", key: "cycle", width: 14 },
        { header: "priority", key: "priority", width: 10 },
        { header: "reference_text", key: "reference_text", width: 30 },
        { header: "default_recurring_rule_code", key: "default_recurring_rule_code", width: 22 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [{ header: "group", key: "group", width: 20 }],
      rows: [
        { group: "online_inbound" },
        { group: "online_outbound" },
        { group: "offline_inbound" },
        { group: "offline_outbound" },
        { group: "cross" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T9_SbuCatalog.xlsx"',
    },
  });
}
