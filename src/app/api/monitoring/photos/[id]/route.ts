import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getMonitoringPhotoBytes } from "@/lib/services/monitoring";

export const runtime = "nodejs";

/** Phục vụ ảnh giám sát (?size=thumb|full). Ảnh không bao giờ đổi nên cache mạnh ở trình duyệt. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const row = await getMonitoringPhotoBytes(db, id, size);
  if (!row) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: { "content-type": row.mime, "cache-control": "private, max-age=31536000, immutable" },
  });
}
