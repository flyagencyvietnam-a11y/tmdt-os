import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** SPEC Phụ lục B2 — template T2 (Người dùng và SBU). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Sheet USERS: 1 dòng = 1 người dùng. Sheet SBUS: 1 dòng = 1 SBU." },
        { note: "role: admin / manager / member / center_contributor / viewer." },
        { note: "Người dùng mới sẽ nhận mật khẩu tạm — thông báo trực tiếp (không ghi trong file nạp lại)." },
      ],
    },
    {
      name: "USERS",
      columns: [
        { header: "email*", key: "email", width: 24 },
        { header: "full_name*", key: "full_name", width: 22 },
        { header: "role*", key: "role", width: 18 },
        { header: "team", key: "team", width: 16 },
        { header: "sbu_code", key: "sbu_code", width: 12 },
        { header: "can_assign", key: "can_assign", width: 10 },
        { header: "active", key: "active", width: 10 },
      ],
      rows: [],
    },
    {
      name: "SBUS",
      columns: [
        { header: "code*", key: "code", width: 12 },
        { header: "name*", key: "name", width: 24 },
        { header: "kind*", key: "kind", width: 16 },
        { header: "region*", key: "region", width: 12 },
        { header: "ho_owner_email", key: "ho_owner_email", width: 24 },
        { header: "active", key: "active", width: 10 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [
        { header: "role", key: "role", width: 20 },
        { header: "kind", key: "kind", width: 16 },
        { header: "region", key: "region", width: 12 },
      ],
      rows: [
        { role: "admin", kind: "center", region: "KV1" },
        { role: "manager", kind: "online_center", region: "KV2" },
        { role: "member", kind: "group", region: "KV3" },
        { role: "center_contributor", kind: "", region: "KV2_KV3" },
        { role: "viewer", kind: "", region: "ONLINE" },
        { role: "", kind: "", region: "RND" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T2_UsersSbus.xlsx"',
    },
  });
}
