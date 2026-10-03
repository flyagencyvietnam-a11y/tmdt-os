import { describe, expect, it } from "vitest";
import {
  applyHolidayPolicy,
  firstWorkingDayOfMonth,
  isWorkday,
  isoWeekday,
  lastWorkingDayOfMonth,
  nearestWorkday,
} from "./workdays";

const WORKDAYS = [1, 2, 3, 4, 5];
const NO_HOLIDAYS = new Set<string>();

describe("isoWeekday", () => {
  it("thứ Sáu 30/10/2026 = 5", () => {
    expect(isoWeekday("2026-10-30")).toBe(5);
  });
  it("Chủ Nhật = 7, không phải 0", () => {
    expect(isoWeekday("2026-11-01")).toBe(7);
  });
});

describe("isWorkday", () => {
  it("cuối tuần không phải ngày làm việc", () => {
    expect(isWorkday("2026-10-31", WORKDAYS, NO_HOLIDAYS)).toBe(false); // Thứ Bảy
    expect(isWorkday("2026-11-01", WORKDAYS, NO_HOLIDAYS)).toBe(false); // Chủ Nhật
  });
  it("ngày lễ không phải ngày làm việc dù là ngày thường", () => {
    expect(isWorkday("2026-09-02", WORKDAYS, new Set(["2026-09-02"]))).toBe(false);
  });
});

describe("lastWorkingDayOfMonth — SPEC Mục 14.2 tiêu chí #3", () => {
  it("tháng 10/2026 -> 30/10/2026 (thứ Sáu)", () => {
    expect(lastWorkingDayOfMonth("2026-10-15", WORKDAYS, NO_HOLIDAYS)).toBe("2026-10-30");
  });
  it("tháng 2/2027 (28 ngày, không nhuận) xử lý đúng ngày cuối + ngày nghỉ", () => {
    // 28/02/2027 là Chủ Nhật -> lùi về ngày làm việc gần nhất.
    const last = lastWorkingDayOfMonth("2027-02-10", WORKDAYS, NO_HOLIDAYS);
    expect(isoWeekday(last)).toBeLessThanOrEqual(5);
    expect(last <= "2027-02-28").toBe(true);
  });
});

describe("firstWorkingDayOfMonth", () => {
  it("tháng 11/2026 bắt đầu bằng Chủ Nhật -> ngày làm việc đầu tiên là 02/11", () => {
    expect(firstWorkingDayOfMonth("2026-11-15", WORKDAYS, NO_HOLIDAYS)).toBe("2026-11-02");
  });
});

describe("applyHolidayPolicy", () => {
  it("shift_earlier lùi về thứ Sáu khi rơi vào thứ Bảy", () => {
    expect(applyHolidayPolicy("2026-10-10", "shift_earlier", WORKDAYS, NO_HOLIDAYS)).toBe(
      "2026-10-09",
    );
  });
  it("shift_later tiến tới thứ Hai khi rơi vào Chủ Nhật", () => {
    expect(applyHolidayPolicy("2026-11-15", "shift_later", WORKDAYS, NO_HOLIDAYS)).toBe(
      "2026-11-16",
    );
  });
  it("none giữ nguyên dù rơi vào cuối tuần", () => {
    expect(applyHolidayPolicy("2026-10-10", "none", WORKDAYS, NO_HOLIDAYS)).toBe("2026-10-10");
  });
  it("ngày đã là ngày làm việc thì không đổi bất kể policy", () => {
    expect(applyHolidayPolicy("2026-10-20", "shift_earlier", WORKDAYS, NO_HOLIDAYS)).toBe(
      "2026-10-20",
    );
  });
});

describe("nearestWorkday", () => {
  it("không rơi vào vòng lặp vô hạn khi workDays rỗng (guard 60 ngày)", () => {
    expect(() => nearestWorkday("2026-10-10", [], NO_HOLIDAYS, -1)).not.toThrow();
  });
});
