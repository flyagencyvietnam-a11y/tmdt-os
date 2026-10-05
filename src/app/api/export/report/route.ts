import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canExportReport, parseKind, parsePeriod } from "@/lib/reports/access";
import { buildReport } from "@/lib/reports/builders";
import { renderXlsx } from "@/lib/reports/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Xuất báo cáo Excel: GET /api/export/report?kind=sbu|brand|growth|management&period=yyyy-mm */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const url = new URL(req.url);
  const kind = parseKind(url.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "Loại báo cáo không hợp lệ." }, { status: 400 });
  if (!canExportReport(user.role, kind)) return NextResponse.json({ error: "Không có quyền xuất báo cáo này." }, { status: 403 });
  try {
    const doc = await buildReport(db, kind, { period: parsePeriod(url.searchParams.get("period")), userName: user.fullName });
    const buf = await renderXlsx(doc);
    const stamp = doc.periodLabel.replace(/[^\dA-Za-z]+/g, "-").replace(/^-|-$/g, "");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="VMG_${kind}_${stamp}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Không xuất được báo cáo." }, { status: 500 });
  }
}
