import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** T5 — Request hàng loạt (Phase 2, Phụ lục B7). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Mỗi dòng là 1 request (SPEC Mục 4.2/7.4). request_key là khoá chống trùng khi nạp lại." },
        { note: "Ngày định dạng dd/mm/yyyy. requester_sbu_code để trống nếu không thuộc trung tâm nào." },
      ],
    },
    {
      name: "REQUESTS",
      columns: [
        { header: "request_key*", key: "request_key", width: 16 },
        { header: "received_date*", key: "received_date", width: 14 },
        { header: "source_channel", key: "source_channel", width: 14 },
        { header: "requester_name*", key: "requester_name", width: 20 },
        { header: "requester_sbu_code", key: "requester_sbu_code", width: 16 },
        { header: "request_type", key: "request_type", width: 14 },
        { header: "description*", key: "description", width: 40 },
        { header: "reference_url", key: "reference_url", width: 24 },
        { header: "priority", key: "priority", width: 10 },
        { header: "desired_date", key: "desired_date", width: 14 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [
        { header: "source_channel", key: "a", width: 16 },
        { header: "request_type", key: "b", width: 14 },
      ],
      rows: [
        { a: "misa", b: "design" },
        { a: "email", b: "ads" },
        { a: "zalo", b: "content" },
        { a: "direct", b: "media" },
        { a: "meeting", b: "posm" },
        { a: "other", b: "event" },
        { a: "", b: "consulting" },
        { a: "", b: "other" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T5_Requests.xlsx"',
    },
  });
}
