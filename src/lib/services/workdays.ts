import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { appSettings, holidays } from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";

/** SPEC Mục 6.3 — ngày làm việc cuối/đầu tháng, dịch ngày lễ. Thuần hàm, không DB. */

export function isoWeekday(dayStr: string): number {
  // 1=Thứ Hai..7=Chủ Nhật, tính theo lịch (không lệch múi giờ vì dùng UTC neutral).
  const d = new Date(`${dayStr}T00:00:00Z`).getUTCDay(); // 0=CN..6=T7
  return d === 0 ? 7 : d;
}

export function isWorkday(dayStr: string, workDays: number[], holidaySet: Set<string>): boolean {
  if (holidaySet.has(dayStr)) return false;
  return workDays.includes(isoWeekday(dayStr));
}

/** Lùi/tiến tới ngày làm việc gần nhất theo hướng `dir` (-1 lùi, +1 tiến). */
export function nearestWorkday(
  dayStr: string,
  workDays: number[],
  holidaySet: Set<string>,
  dir: -1 | 1,
): string {
  let d = dayStr;
  let guard = 0;
  while (!isWorkday(d, workDays, holidaySet) && guard < 60) {
    d = addDaysStr(d, dir);
    guard++;
  }
  return d;
}

/** Áp holiday_policy (Mục 6.2/6.3): shift_earlier -> lùi, shift_later -> tiến, none -> giữ nguyên. */
export function applyHolidayPolicy(
  dayStr: string,
  policy: "none" | "shift_earlier" | "shift_later",
  workDays: number[],
  holidaySet: Set<string>,
): string {
  if (policy === "none") return dayStr;
  if (isWorkday(dayStr, workDays, holidaySet)) return dayStr;
  return nearestWorkday(dayStr, workDays, holidaySet, policy === "shift_earlier" ? -1 : 1);
}

/** Ngày làm việc cuối cùng của tháng chứa `anyDayInMonth` ("YYYY-MM-DD"). */
export function lastWorkingDayOfMonth(
  anyDayInMonth: string,
  workDays: number[],
  holidaySet: Set<string>,
): string {
  const [y, m] = anyDayInMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return nearestWorkday(last, workDays, holidaySet, -1);
}

/** Ngày làm việc đầu tiên của tháng chứa `anyDayInMonth`. */
export function firstWorkingDayOfMonth(
  anyDayInMonth: string,
  workDays: number[],
  holidaySet: Set<string>,
): string {
  const [y, m] = anyDayInMonth.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  return nearestWorkday(first, workDays, holidaySet, 1);
}

/**
 * Cộng/trừ N ngày LÀM VIỆC từ `dayStr` (N âm = lùi). Dùng cho hạn task con tự
 * sinh từ content calendar / media plan (Mục 7.2/7.3: "publish_date - 3 ngày
 * làm việc"...). N=0 trả về chính ngày làm việc gần nhất (không lùi/tiến nếu
 * đã là ngày làm việc).
 */
export function addWorkdays(
  dayStr: string,
  n: number,
  workDays: number[],
  holidaySet: Set<string>,
): string {
  if (n === 0) return dayStr;
  const dir: 1 | -1 = n > 0 ? 1 : -1;
  let d = dayStr;
  let remaining = Math.abs(n);
  let guard = 0;
  while (remaining > 0 && guard < 3660) {
    d = addDaysStr(d, dir);
    if (isWorkday(d, workDays, holidaySet)) remaining--;
    guard++;
  }
  return d;
}

/** Nạp set ngày lễ (YYYY-MM-DD) trong khoảng rộng — gọi 1 lần mỗi lượt chạy cron. */
export async function loadHolidaySet(db: DB): Promise<Set<string>> {
  const rows = await db.select({ d: holidays.holidayDate }).from(holidays);
  return new Set(rows.map((r) => r.d));
}

/** Tuần làm việc mặc định của phòng (app_settings key 'work_days'), fallback T2-T6. */
export async function loadDeptWorkDays(db: DB): Promise<number[]> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "work_days"))
    .limit(1);
  const v = row?.value as number[] | undefined;
  return Array.isArray(v) && v.length ? v : [1, 2, 3, 4, 5];
}
