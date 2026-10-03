import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { buildBodWeeklyWorkbook } from "@/lib/services/bod-export";

/** SPEC Mục 10.5 (P2) — xuất lịch tuần gửi BOD: GET /api/export/bod-schedule?monday=YYYY-MM-DD */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const monday = new URL(req.url).searchParams.get("monday");
  if (!monday || !/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
    return NextResponse.json({ error: "Thiếu hoặc sai tham số monday=YYYY-MM-DD" }, { status: 400 });
  }

  const buf = await buildBodWeeklyWorkbook(db, monday);
  await writeAudit(db, { actorId: user.id, entity: "bod_schedule_export", action: "EXPORT", changes: { monday } });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="lich-tuan-bod-${monday}.xlsx"`,
    },
  });
}
