import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  runAllMorningJobs,
  runMonthLockReminder,
  runWeeklySummary,
} from "@/lib/services/jobs";

/**
 * Điểm chạy tác vụ định kỳ trên Vercel (Vercel Cron gọi endpoint này).
 * Bảo vệ bằng CRON_SECRET — Vercel gửi `Authorization: Bearer $CRON_SECRET`.
 * Self-host thì dùng node-cron trong tiến trình (src/lib/cron.ts), không cần route này.
 *
 *   GET /api/cron            -> digest quá hạn + rà R1-R5 + Cold Data + task định kỳ
 *   GET /api/cron?job=weekly -> tổng kết tuần
 *   GET /api/cron?job=month  -> nhắc khóa sổ
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const job = new URL(req.url).searchParams.get("job");
  try {
    if (job === "weekly") {
      return NextResponse.json(await runWeeklySummary(db));
    }
    if (job === "month") {
      return NextResponse.json(await runMonthLockReminder(db));
    }
    return NextResponse.json(await runAllMorningJobs(db));
  } catch (e) {
    console.error("[cron] lỗi", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
