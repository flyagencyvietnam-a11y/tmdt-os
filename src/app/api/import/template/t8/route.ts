import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** T8 — Foundation (Phase 2, Phụ lục B7), khoá tự nhiên brand_code+component_code. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Mỗi dòng là 1 ô lưới Foundation (SPEC Mục 4.2/9.2): cột = brand, dòng = cấu phần A1..I2." },
        { note: "Nạp lại cùng brand_code+component_code sẽ cập nhật ô đó và lưu bản lịch sử (không tạo trùng)." },
      ],
    },
    {
      name: "FOUNDATION",
      columns: [
        { header: "brand_code*", key: "brand_code", width: 12 },
        { header: "section_code*", key: "section_code", width: 12 },
        { header: "component_code*", key: "component_code", width: 14 },
        { header: "component_label*", key: "component_label", width: 24 },
        { header: "content", key: "content", width: 50 },
        { header: "status", key: "status", width: 16 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [{ header: "status", key: "status", width: 18 }],
      rows: [{ status: "confirmed" }, { status: "needs_confirmation" }, { status: "proposed" }],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T8_Foundation.xlsx"',
    },
  });
}
