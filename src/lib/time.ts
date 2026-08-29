/**
 * Tiện ích thời gian. SPEC Mục 5.2 (3): lưu UTC, hiển thị & cắt ngày theo
 * Asia/Ho_Chi_Minh. Việt Nam cố định UTC+7, KHÔNG có DST — nên ta dùng offset
 * hằng số, tránh phụ thuộc thư viện tz cho phần lõi.
 */
export const VN_TZ = "Asia/Ho_Chi_Minh";
export const VN_TZ_OFFSET = "+07:00";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' của một instant, theo lịch Việt Nam. */
export function vnDayStr(date: Date = new Date()): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Alias dễ đọc. */
export const localDayStr = vnDayStr;
export const todayVnDayStr = (now: Date = new Date()): string => vnDayStr(now);

/**
 * Biên UTC của một ngày local VN: [00:00 hôm đó, 00:00 hôm sau) — nửa mở.
 * Dùng để so sánh với cột timestamptz.
 */
export function vnDayBoundsUtc(dayStr: string): [Date, Date] {
  const start = new Date(`${dayStr}T00:00:00${VN_TZ_OFFSET}`);
  const end = new Date(start.getTime() + DAY_MS);
  return [start, end];
}

/** Cộng/trừ ngày trên chuỗi 'YYYY-MM-DD' (theo lịch VN). */
export function addDaysStr(dayStr: string, days: number): string {
  const [s] = vnDayBoundsUtc(dayStr);
  return vnDayStr(new Date(s.getTime() + days * DAY_MS));
}

/** Số ngày (nguyên, làm tròn xuống) giữa 2 chuỗi ngày: b - a. */
export function diffDaysStr(a: string, b: string): number {
  const [sa] = vnDayBoundsUtc(a);
  const [sb] = vnDayBoundsUtc(b);
  return Math.round((sb.getTime() - sa.getTime()) / DAY_MS);
}

/** Ngày đầu / cuối tháng chứa dayStr. */
export function monthBounds(dayStr: string): [string, string] {
  const [y, m] = dayStr.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [first, last];
}

/** Quý chứa dayStr, dạng [start, end]. */
export function quarterBounds(dayStr: string): [string, string] {
  const [y, m] = dayStr.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const startM = q * 3 + 1;
  const endM = startM + 2;
  const [, end] = monthBounds(`${y}-${String(endM).padStart(2, "0")}-01`);
  return [`${y}-${String(startM).padStart(2, "0")}-01`, end];
}
