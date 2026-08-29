/**
 * Lịch chạy tự động — SPEC Mục 17.2. node-cron trong tiến trình, giờ Việt Nam.
 * Bật bằng ENABLE_CRON="true". Khởi động từ src/instrumentation.ts (Node runtime).
 */
import cron from "node-cron";
import { db } from "@/lib/db";
import {
  runAlertScan,
  runColdDataSweep,
  runMonthLockReminder,
  runOverdueDigest,
  runSpawnRecurring,
  runWeeklySummary,
} from "@/lib/services/jobs";

const TZ = "Asia/Ho_Chi_Minh";
let started = false;

export function startCron() {
  if (started) return;
  if (process.env.ENABLE_CRON !== "true") {
    console.log("[cron] ENABLE_CRON != 'true' — bỏ qua lịch tự động.");
    return;
  }
  started = true;

  const wrap = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      const r = await fn();
      console.log(`[cron] ${name} xong`, r);
    } catch (e) {
      console.error(`[cron] ${name} lỗi`, e);
    }
  };

  cron.schedule("0 8 * * *", wrap("overdue-digest", () => runOverdueDigest(db)), { timezone: TZ });
  cron.schedule("0 8 * * *", wrap("alert-scan-8h", () => runAlertScan(db)), { timezone: TZ });
  cron.schedule("0 8 * * *", wrap("spawn-recurring", () => runSpawnRecurring(db)), { timezone: TZ });
  cron.schedule("30 10 * * *", wrap("alert-scan-10h30", () => runAlertScan(db)), { timezone: TZ });
  cron.schedule("30 0 * * *", wrap("cold-data-sweep", () => runColdDataSweep(db)), { timezone: TZ });
  cron.schedule("0 8 * * 1", wrap("weekly-summary", () => runWeeklySummary(db)), { timezone: TZ });
  cron.schedule("0 8 1 * *", wrap("month-lock-reminder", () => runMonthLockReminder(db)), { timezone: TZ });

  console.log("[cron] đã lên lịch 6 tác vụ (giờ Việt Nam).");
}
