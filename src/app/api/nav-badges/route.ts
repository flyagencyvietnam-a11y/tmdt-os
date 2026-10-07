import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getNavBadges } from "@/lib/services/nav-badges";

export const dynamic = "force-dynamic";

/** Badge điểm nóng của menu cho tài khoản đang đăng nhập — tải riêng sau khi trang đã hiện, không chặn render layout. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const badges = await getNavBadges(db, user);
  return NextResponse.json({ badges }, { headers: { "Cache-Control": "private, no-store" } });
}
