export async function register() {
  // Chỉ chạy ở Node runtime (không phải edge/middleware).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCron } = await import("@/lib/cron");
    startCron();
  }
}
