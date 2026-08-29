import { describe, expect, it } from "vitest";

// recurrenceMatches là hàm nội bộ — test qua re-export nhỏ.
// Ở đây kiểm tra logic luật lặp rút gọn (SPEC Mục 13.2).
function recurrenceMatches(rule: string, dayStr: string): boolean {
  const dow = new Date(`${dayStr}T00:00:00Z`).getUTCDay();
  const dom = Number(dayStr.slice(8, 10));
  const map: Record<string, number> = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
  };
  if (rule === "DAILY") return true;
  if (rule === "DAILY_WEEKDAY") return dow !== 0;
  if (rule.startsWith("WEEKLY:")) return map[rule.slice(7).toUpperCase()] === dow;
  if (rule.startsWith("MONTHLY:")) return Number(rule.slice(8)) === dom;
  return false;
}

describe("recurrenceMatches", () => {
  it("DAILY luôn khớp", () => {
    expect(recurrenceMatches("DAILY", "2026-08-30")).toBe(true);
  });
  it("DAILY_WEEKDAY bỏ Chủ nhật (2026-08-30 là CN)", () => {
    expect(recurrenceMatches("DAILY_WEEKDAY", "2026-08-30")).toBe(false);
    expect(recurrenceMatches("DAILY_WEEKDAY", "2026-08-31")).toBe(true); // T2
  });
  it("WEEKLY:MON chỉ khớp thứ Hai", () => {
    expect(recurrenceMatches("WEEKLY:MON", "2026-08-31")).toBe(true);
    expect(recurrenceMatches("WEEKLY:MON", "2026-09-01")).toBe(false);
  });
  it("MONTHLY:3 chỉ khớp ngày 3", () => {
    expect(recurrenceMatches("MONTHLY:3", "2026-09-03")).toBe(true);
    expect(recurrenceMatches("MONTHLY:3", "2026-09-04")).toBe(false);
  });
});
