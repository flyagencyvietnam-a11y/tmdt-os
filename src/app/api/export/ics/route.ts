import { and, isNull, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { tasks, users } from "@/lib/db/schema";
import { buildIcsCalendar, verifyCalendarToken } from "@/lib/services/ics";

/**
 * SPEC Mục 8.3/10.5 (P2) — Lịch .ics của "Việc của tôi".
 * - Có session: GET /api/export/ics tải trực tiếp.
 * - Không session (Google Calendar "Từ URL"): GET /api/export/ics?user=<id>&token=<token>
 *   (token suy từ AUTH_SECRET, không hết hạn — xem lib/services/ics.ts).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userParam = url.searchParams.get("user");
  const token = url.searchParams.get("token");

  let userId: string;
  let fullName: string;

  if (userParam && token) {
    if (!verifyCalendarToken(userParam, token)) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    const [u] = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.id, userParam)).limit(1);
    if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
    userId = u.id;
    fullName = u.fullName;
  } else {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    userId = sessionUser.id;
    fullName = sessionUser.fullName;
  }

  const rows = await db
    .select({ id: tasks.id, code: tasks.code, title: tasks.title, dueDate: tasks.dueDate, dueTime: tasks.dueTime, description: tasks.description })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), eq(tasks.assigneeId, userId)));

  const ics = buildIcsCalendar(rows, `MKT OS — Việc của ${fullName}`);
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="viec-cua-toi.ics"`,
    },
  });
}
