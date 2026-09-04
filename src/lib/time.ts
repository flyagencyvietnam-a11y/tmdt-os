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

/** Năm chứa dayStr / năm Y, dạng [YYYY-01-01, YYYY-12-31]. */
export function yearBounds(yearOrDay: string | number): [string, string] {
  const y =
    typeof yearOrDay === "number" ? yearOrDay : Number(String(yearOrDay).slice(0, 4));
  return [`${y}-01-01`, `${y}-12-31`];
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

/**
 * "Tuần báo cáo" theo quy ước VMG: **Thứ 7 tuần trước → Thứ 6 tuần này** (7 ngày).
 * Trả [from = Thứ 7, to = Thứ 6].
 */
export function reportWeekBounds(dayStr: string): [string, string] {
  const dow = new Date(`${dayStr}T00:00:00Z`).getUTCDay(); // 0=CN … 6=T7
  const backToSat = (dow + 1) % 7; // T7->0, CN->1, … T6->6
  const from = addDaysStr(dayStr, -backToSat);
  return [from, addDaysStr(from, 6)];
}

function dm(dayStr: string): string {
  const [, m, d] = dayStr.split("-");
  return `${d}/${m}`;
}

/** Nhãn tuần báo cáo: "12/07 – 18/07". */
export function reportWeekLabel(fromSat: string): string {
  const [from, to] = reportWeekBounds(fromSat);
  return `${dm(from)} – ${dm(to)}`;
}

export interface PeriodOption {
  value: string; // week:YYYY-MM-DD | month:YYYY-MM | quarter:YYYY-Q#
  label: string;
  from: string;
  to: string;
}

/**
 * Danh sách các kỳ gần đây để chọn cụ thể trên bộ lọc dashboard.
 * kind: "week" (tuần báo cáo T7→T6) | "month" | "quarter". i=0 là kỳ hiện tại.
 */
export function recentPeriods(
  kind: "week" | "month" | "quarter",
  count: number,
  now: Date = new Date(),
): PeriodOption[] {
  const today = vnDayStr(now);
  const out: PeriodOption[] = [];

  if (kind === "week") {
    const [thisSat] = reportWeekBounds(today);
    for (let i = 0; i < count; i++) {
      const sat = addDaysStr(thisSat, -7 * i);
      const [from, to] = reportWeekBounds(sat);
      out.push({
        value: `week:${from}`,
        label: `${reportWeekLabel(from)}${i === 0 ? " (tuần này)" : i === 1 ? " (tuần trước)" : ""}`,
        from,
        to,
      });
    }
    return out;
  }

  if (kind === "month") {
    const [y, m] = today.split("-").map(Number);
    for (let i = 0; i < count; i++) {
      const mm = m - 1 - i; // 0-based month index rồi trừ
      const d = new Date(Date.UTC(y, mm, 1));
      const yy = d.getUTCFullYear();
      const mo = d.getUTCMonth() + 1;
      const key = `${yy}-${String(mo).padStart(2, "0")}`;
      const [from, to] = monthBounds(`${key}-01`);
      out.push({
        value: `month:${key}`,
        label: `Tháng ${mo}/${yy}${i === 0 ? " (này)" : i === 1 ? " (trước)" : ""}`,
        from,
        to,
      });
    }
    return out;
  }

  // quarter
  const [y0, m0] = today.split("-").map(Number);
  let q0 = Math.floor((m0 - 1) / 3); // 0..3
  let yq = y0;
  for (let i = 0; i < count; i++) {
    const startMonth = q0 * 3 + 1;
    const [from, to] = quarterBounds(`${yq}-${String(startMonth).padStart(2, "0")}-01`);
    out.push({
      value: `quarter:${yq}-Q${q0 + 1}`,
      label: `Q${q0 + 1}/${yq}${i === 0 ? " (này)" : i === 1 ? " (trước)" : ""}`,
      from,
      to,
    });
    q0 -= 1;
    if (q0 < 0) {
      q0 = 3;
      yq -= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Bộ chọn thời gian 4 cấp: Năm › Quý › Tháng › Tuần (SPEC 12.2)
// ---------------------------------------------------------------------------

/** N năm gần nhất (i=0 là năm hiện tại). */
export function recentYears(count: number, now: Date = new Date()): number[] {
  const y = Number(vnDayStr(now).slice(0, 4));
  return Array.from({ length: count }, (_, i) => y - i);
}

/** 12 tháng của năm y: [{ value: "YYYY-MM", label: "Tháng M" }]. */
export function monthsOfYear(y: number): { value: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    value: `${y}-${String(i + 1).padStart(2, "0")}`,
    label: `Tháng ${i + 1}`,
  }));
}

/** Các tuần báo cáo VMG (T7→T6) có phần giao với tháng y-m. */
export function weeksOfMonth(y: number, m: number): PeriodOption[] {
  const [mFirst, mLast] = monthBounds(`${y}-${String(m).padStart(2, "0")}-01`);
  const out: PeriodOption[] = [];
  let [satFrom] = reportWeekBounds(mFirst);
  // Bắt đầu từ tuần chứa ngày 1; đi tới khi qua hết tháng.
  for (let guard = 0; guard < 8; guard++) {
    const [from, to] = reportWeekBounds(satFrom);
    if (from > mLast) break;
    out.push({ value: `week:${from}`, label: reportWeekLabel(from), from, to });
    satFrom = addDaysStr(from, 7);
  }
  return out;
}

/** Phân tích giá trị `range` 4 cấp thành các mảnh đã chọn. */
export function parsePeriodParts(range: string): {
  year: number;
  quarter: number | null;
  month: number | null;
  weekFrom: string | null;
} {
  const today = vnDayStr();
  const nowY = Number(today.slice(0, 4));

  // Preset "nhanh" có phạm vi rõ ràng theo tháng/tuần → phản chiếu lên bộ chọn.
  if (range === "this_month" || range === "last_month") {
    const base =
      range === "this_month"
        ? today
        : addDaysStr(monthBounds(today)[0], -1);
    const [y, m] = base.split("-").map(Number);
    return { year: y, quarter: Math.floor((m - 1) / 3) + 1, month: m, weekFrom: null };
  }
  if (range === "this_quarter") {
    const [y, m] = today.split("-").map(Number);
    return { year: y, quarter: Math.floor((m - 1) / 3) + 1, month: null, weekFrom: null };
  }
  if (range === "this_week") {
    const [sat] = reportWeekBounds(today);
    const [y, m] = sat.split("-").map(Number);
    return {
      year: y,
      quarter: Math.floor((m - 1) / 3) + 1,
      month: m,
      weekFrom: sat,
    };
  }

  const [kind, rest] = range.split(":");
  if (kind === "year" && /^\d{4}$/.test(rest ?? ""))
    return { year: Number(rest), quarter: null, month: null, weekFrom: null };
  if (kind === "quarter") {
    const mq = /^(\d{4})-Q([1-4])$/.exec(rest ?? "");
    if (mq)
      return { year: Number(mq[1]), quarter: Number(mq[2]), month: null, weekFrom: null };
  }
  if (kind === "month" && /^(\d{4})-(\d{2})$/.test(rest ?? "")) {
    const [yy, mm] = rest.split("-").map(Number);
    return { year: yy, quarter: Math.floor((mm - 1) / 3) + 1, month: mm, weekFrom: null };
  }
  if (kind === "week" && /^\d{4}-\d{2}-\d{2}$/.test(rest ?? "")) {
    // Tuần thuộc tháng chứa ngày Thứ 7 bắt đầu tuần.
    const [yy, mm] = rest.split("-").map(Number);
    return {
      year: yy,
      quarter: Math.floor((mm - 1) / 3) + 1,
      month: mm,
      weekFrom: rest,
    };
  }
  return { year: nowY, quarter: null, month: null, weekFrom: null };
}

/** Giải mã 1 giá trị period (từ recentPeriods.value) thành [from, to]. */
export function resolvePeriodValue(
  value: string,
): { from: string; to: string } | null {
  const [kind, rest] = value.split(":");
  if (kind === "year" && /^\d{4}$/.test(rest ?? "")) {
    const [from, to] = yearBounds(Number(rest));
    return { from, to };
  }
  if (kind === "week" && /^\d{4}-\d{2}-\d{2}$/.test(rest ?? "")) {
    const [from, to] = reportWeekBounds(rest);
    return { from, to };
  }
  if (kind === "month" && /^\d{4}-\d{2}$/.test(rest ?? "")) {
    const [from, to] = monthBounds(`${rest}-01`);
    return { from, to };
  }
  if (kind === "quarter") {
    const mq = /^(\d{4})-Q([1-4])$/.exec(rest ?? "");
    if (mq) {
      const startMonth = (Number(mq[2]) - 1) * 3 + 1;
      const [from, to] = quarterBounds(
        `${mq[1]}-${String(startMonth).padStart(2, "0")}-01`,
      );
      return { from, to };
    }
  }
  return null;
}
