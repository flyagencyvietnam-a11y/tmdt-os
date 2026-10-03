import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** T7 — Media production plan (Phase 2, Phụ lục B6): sheet SHOOTS + DELIVERABLES. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Sheet SHOOTS: mỗi dòng 1 đợt quay (SPEC Mục 4.2/7.3). shoot_code là khoá — tự đặt, duy nhất." },
        { note: "Sheet DELIVERABLES: mỗi dòng 1 sản phẩm hậu kỳ của 1 đợt quay, tham chiếu shoot_code." },
      ],
    },
    {
      name: "SHOOTS",
      columns: [
        { header: "shoot_code*", key: "shoot_code", width: 14 },
        { header: "shoot_date*", key: "shoot_date", width: 14 },
        { header: "location", key: "location", width: 20 },
        { header: "sbu_code", key: "sbu_code", width: 12 },
        { header: "brand_code", key: "brand_code", width: 12 },
        { header: "purpose", key: "purpose", width: 24 },
        { header: "crew", key: "crew", width: 20 },
        { header: "equipment", key: "equipment", width: 20 },
        { header: "script_url", key: "script_url", width: 22 },
        { header: "status", key: "status", width: 12 },
        { header: "notes", key: "notes", width: 24 },
      ],
      rows: [],
    },
    {
      name: "DELIVERABLES",
      columns: [
        { header: "shoot_code*", key: "shoot_code", width: 14 },
        { header: "deliverable_type*", key: "deliverable_type", width: 18 },
        { header: "quantity", key: "quantity", width: 10 },
        { header: "channel", key: "channel", width: 14 },
        { header: "brand_code", key: "brand_code", width: 12 },
        { header: "campaign_code", key: "campaign_code", width: 14 },
        { header: "editor_email", key: "editor_email", width: 22 },
        { header: "due_date", key: "due_date", width: 14 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [{ header: "status", key: "status", width: 16 }],
      rows: [{ status: "planned" }, { status: "prepared" }, { status: "shot" }, { status: "editing" }, { status: "done" }, { status: "cancelled" }],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T7_Media.xlsx"',
    },
  });
}
