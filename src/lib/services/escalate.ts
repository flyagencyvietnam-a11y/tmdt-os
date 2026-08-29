import { inArray } from "drizzle-orm";
import { holidays } from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";
import type { AnyDb } from "./metrics";

/**
 * Cỗ máy chăm sóc theo "Ngày LH lại" — SPEC Mục 8.2.
 *
 * Bảng escalate theo số lần im lặng (silence_count SAU lần chăm sóc này):
 *   1 -> T+0   nhắc lại ngay trong ngày
 *   2 -> T+1
 *   3 -> T+3   kèm ưu đãi
 *   4 -> T+7   hỏi thăm, không bán
 *   5 -> T+30  thăm dò lại nhu cầu
 *  >=6 -> không đặt; hệ thống tự chuyển Cold Data (is_cold, outcome=LOST)
 */
export const ESCALATE_OFFSET_DAYS: Record<number, number | null> = {
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 30,
};

export const COLD_SILENCE_THRESHOLD = 6;
export const COLD_LOST_REASON = "Không phản hồi sau 5 nhịp chăm sóc";
export const LOST_REMARKETING_DAYS = 45; // SPEC 8.1 — LOST tự đặt +45 ngày

export const ESCALATE_SCRIPT_HINT: Record<number, string> = {
  1: "Nhắc lại ngay trong ngày.",
  2: "Nhắc lại vào ngày hôm sau.",
  3: "Nhắc lại kèm chương trình ưu đãi.",
  4: "Nhắn hỏi thăm, không bán.",
  5: "Thăm dò lại nhu cầu.",
};

/**
 * Tính silence_count mới theo kết quả tương tác — SPEC Mục 8.2.
 */
export function nextSilenceCount(
  current: number,
  result: "RESPONDED" | "NO_RESPONSE" | "REFUSED" | "RESCHEDULED",
): number {
  switch (result) {
    case "NO_RESPONSE":
      return current + 1;
    case "RESPONDED":
    case "RESCHEDULED":
      return 0;
    case "REFUSED":
      return current; // không đổi
  }
}

/**
 * Ngày LH lại đề xuất theo silence_count, đẩy khỏi Chủ nhật / ngày lễ.
 * Trả `null` nếu silence_count >= 6 (chuyển Cold Data).
 */
export async function suggestNextContactDate(
  db: AnyDb,
  silenceCount: number,
  fromDay: string, // YYYY-MM-DD local VN
): Promise<string | null> {
  const offset = ESCALATE_OFFSET_DAYS[silenceCount];
  if (offset == null) return null; // >= 6
  let candidate = addDaysStr(fromDay, offset);
  candidate = await shiftWorkingDay(db, candidate);
  return candidate;
}

/** Đẩy sang ngày làm việc kế tiếp nếu rơi vào Chủ nhật hoặc ngày lễ. */
export async function shiftWorkingDay(db: AnyDb, dayStr: string): Promise<string> {
  const holidaySet = await loadHolidays(db, dayStr, 14);
  let d = dayStr;
  for (let i = 0; i < 14; i++) {
    // DOW của NGÀY LỊCH (không phải instant): coi YYYY-MM-DD như ngày UTC.
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Chủ nhật
    if (dow !== 0 && !holidaySet.has(d)) return d;
    d = addDaysStr(d, 1);
  }
  return d;
}

async function loadHolidays(
  db: AnyDb,
  fromDay: string,
  spanDays: number,
): Promise<Set<string>> {
  const days: string[] = [];
  for (let i = 0; i <= spanDays; i++) days.push(addDaysStr(fromDay, i));
  const rows = await db
    .select({ d: holidays.holidayDate })
    .from(holidays)
    .where(inArray(holidays.holidayDate, days));
  return new Set(rows.map((r) => r.d));
}
