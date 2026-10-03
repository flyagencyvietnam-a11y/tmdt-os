/**
 * Lịch chạy tự động (self-host) — SPEC Mục 11.2. node-cron trong tiến trình, giờ VN.
 * Bật bằng ENABLE_CRON="true". Khởi động từ src/instrumentation.ts (Node runtime).
 * Trên Vercel dùng `vercel.json` crons gọi `/api/cron` thay cho file này.
 */
import cron from "node-cron";
import { db } from "@/lib/db";
import {
  runDailyDigest,
  runDueTodayReminder,
  runDueTodayUnfinished,
  runEscalateToManagers,
  runOverdueMorning,
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

  cron.schedule("30 0 * * *", wrap("spawn-recurring", () => runSpawnRecurring(db)), { timezone: TZ });
  cron.schedule("0 8 * * *", wrap("overdue-morning", () => runOverdueMorning(db)), { timezone: TZ });
  cron.schedule("0 8 * * *", wrap("due-today-reminder", () => runDueTodayReminder(db)), { timezone: TZ });
  cron.schedule("0 8 * * *", wrap("daily-digest", () => runDailyDigest(db)), { timezone: TZ });
  cron.schedule("30 16 * * *", wrap("due-today-unfinished", () => runDueTodayUnfinished(db)), { timezone: TZ });
  cron.schedule("0 8 * * *", wrap("escalate-managers", () => runEscalateToManagers(db)), { timezone: TZ });
  cron.schedule("0 8 * * 1", wrap("weekly-summary", () => runWeeklySummary(db)), { timezone: TZ });

  console.log("[cron] đã lên lịch 7 tác vụ (giờ Việt Nam).");
}
