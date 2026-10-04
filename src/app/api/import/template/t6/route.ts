import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** T6 — Content calendar (Phase 2, Phụ lục B5). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Mỗi dòng là 1 content_item (SPEC Mục 4.2/7.2/9.6). content_key là khoá chống trùng khi nạp lại." },
        { note: "Nạp xong tự sinh task cha 'Đăng: {chủ đề} - {kênh}' + task con theo workflow mặc định (Soạn/Thiết kế/Duyệt/Đăng)." },
      ],
    },
    {
      name: "CONTENT",
      columns: [
        { header: "content_key*", key: "content_key", width: 16 },
        { header: "brand_code* (nhiều: VMG, VMP)", key: "brand_code", width: 22 },
        { header: "campaign_code", key: "campaign_code", width: 14 },
        { header: "sbu_code", key: "sbu_code", width: 12 },
        { header: "publish_date*", key: "publish_date", width: 14 },
        { header: "publish_time", key: "publish_time", width: 12 },
        { header: "channel* (nhiều: Fanpage, TikTok)", key: "channel", width: 24 },
        { header: "content_pillar", key: "content_pillar", width: 16 },
        { header: "topic*", key: "topic", width: 28 },
        { header: "target_audience", key: "target_audience", width: 20 },
        { header: "key_message", key: "key_message", width: 24 },
        { header: "format", key: "format", width: 14 },
        { header: "resource_source", key: "resource_source", width: 16 },
        { header: "owner_email*", key: "owner_email", width: 22 },
        { header: "cta", key: "cta", width: 16 },
        { header: "target_metric", key: "target_metric", width: 16 },
        { header: "support_needed", key: "support_needed", width: 16 },
        { header: "status", key: "status", width: 14 },
        { header: "post_url", key: "post_url", width: 22 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [{ header: "status", key: "status", width: 16 }],
      rows: [
        { status: "brief" },
        { status: "drafting" },
        { status: "designing" },
        { status: "in_review" },
        { status: "approved" },
        { status: "published" },
        { status: "cancelled" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T6_Content.xlsx"',
    },
  });
}
