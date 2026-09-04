import { inArray } from "drizzle-orm";
import { holidays } from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";
import type { AnyDb } from "./metrics";

/**
 * Cỗ máy chăm sóc theo "Ngày LH lại" — SPEC Mục 8.2.
 *
 * ĐÚNG 5 PHIÊN LIÊN TIẾP không phản hồi thì thành Cold. `silence_count` là số lần
 * NO_RESPONSE liên tiếp; `RESPONDED`/`RESCHEDULED` reset về 0 (khách ấm lại).
 *
 * Ngày LH lại đề xuất theo `silence_count` SAU phiên vừa ghi (= khoảng cách tới
 * phiên kế tiếp):
 *   0  -> T+3   (khách vừa phản hồi — hẹn theo dõi lại)
 *   1  -> T+1
 *   2  -> T+3
 *   3  -> T+7
 *   4  -> T+30  (nhịp cuối trước Cold)
 *  >=5 -> không đặt; hệ thống tự chuyển Cold Data (is_cold, outcome=LOST)
 */
export const ESCALATE_OFFSET_DAYS: Record<number, number | null> = {
  1: 1,
  2: 3,
  3: 7,
  4: 30,
};

/** Sau khi khách phản hồi (silence về 0): hẹn theo dõi lại sau ngần này ngày. */
export const WARM_FOLLOWUP_DAYS = 3;

export const COLD_SILENCE_THRESHOLD = 5;
export const COLD_LOST_REASON = "Không phản hồi sau 5 phiên chăm sóc liên tiếp";
export const LOST_REMARKETING_DAYS = 45; // SPEC 8.1 — LOST tự đặt +45 ngày

export const ESCALATE_SCRIPT_HINT: Record<number, string> = {
  1: "Nhắc lại vào ngày hôm sau.",
  2: "Nhắc lại kèm chương trình ưu đãi.",
  3: "Nhắn hỏi thăm, không bán.",
  4: "Thăm dò lại nhu cầu — nhịp cuối trước khi chuyển Cold.",
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
 *  - silence 0  -> T+`WARM_FOLLOWUP_DAYS` (khách vừa phản hồi)
 *  - silence 1..4 -> theo `ESCALATE_OFFSET_DAYS`
 *  - silence >= 5 -> `null` (chuyển Cold Data)
 */
export async function suggestNextContactDate(
  db: AnyDb,
  silenceCount: number,
  fromDay: string, // YYYY-MM-DD local VN
): Promise<string | null> {
  const offset =
    silenceCount <= 0 ? WARM_FOLLOWUP_DAYS : ESCALATE_OFFSET_DAYS[silenceCount];
  if (offset == null) return null; // >= 5
  const candidate = addDaysStr(fromDay, offset);
  return shiftWorkingDay(db, candidate);
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
