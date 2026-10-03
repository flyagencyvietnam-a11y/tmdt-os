import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  runDailyDigest,
  runDueTodayReminder,
  runDueTodayUnfinished,
  runEscalateToManagers,
  runMonitoringAlertsJob,
  runMonthlyReportExportIfLastWorkday,
  runOverdueMorning,
  runSpawnRecurring,
  runWeeklyReportExport,
  runWeeklySummary,
} from "@/lib/services/jobs";

/**
 * Điểm chạy tác vụ định kỳ trên Vercel (Vercel Cron gọi endpoint này — `vercel.json`).
 * Bảo vệ bằng CRON_SECRET — Vercel gửi `Authorization: Bearer $CRON_SECRET`.
 * Self-host thì dùng node-cron trong tiến trình (src/lib/cron.ts), không cần route này.
 *
 *   GET /api/cron?job=nightly  -> sinh task lặp + trễ hạn sáng + tóm tắt hằng ngày
 *   GET /api/cron?job=afternoon -> hôm nay chưa xong (16:30)
 *   GET /api/cron?job=weekly   -> tổng kết tuần (thứ Hai)
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
    if (job === "afternoon") {
      return NextResponse.json(await runDueTodayUnfinished(db));
    }
    if (job === "weekly") {
      const [summary, reportExport] = await Promise.all([runWeeklySummary(db), runWeeklyReportExport(db)]);
      return NextResponse.json({ summary, reportExport });
    }
    const [recurring, overdue, dueToday, escalate, digest, monitoring, monthlyReport] = await Promise.all([
      runSpawnRecurring(db),
      runOverdueMorning(db),
      runDueTodayReminder(db),
      runEscalateToManagers(db),
      runDailyDigest(db),
      runMonitoringAlertsJob(db),
      runMonthlyReportExportIfLastWorkday(db),
    ]);
    return NextResponse.json({ recurring, overdue, dueToday, escalate, digest, monitoring, monthlyReport });
  } catch (e) {
    console.error("[cron] lỗi", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
