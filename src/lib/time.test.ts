import { describe, expect, it } from "vitest";
import {
  monthsOfYear,
  parsePeriodParts,
  resolvePeriodValue,
  weeksOfMonth,
  yearBounds,
} from "./time";

describe("yearBounds", () => {
  it("năm đầy đủ", () => {
    expect(yearBounds(2026)).toEqual(["2026-01-01", "2026-12-31"]);
    expect(yearBounds("2026-08")).toEqual(["2026-01-01", "2026-12-31"]);
  });
});

describe("resolvePeriodValue — thêm cấp năm", () => {
  it("year:YYYY -> cả năm", () => {
    expect(resolvePeriodValue("year:2026")).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
  it("quarter / month / week vẫn chạy", () => {
    expect(resolvePeriodValue("quarter:2026-Q3")).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(resolvePeriodValue("month:2026-08")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });
});

describe("parsePeriodParts — bộ chọn 4 cấp", () => {
  it("year:", () => {
    expect(parsePeriodParts("year:2025")).toEqual({
      year: 2025,
      quarter: null,
      month: null,
      weekFrom: null,
    });
  });
  it("quarter: điền năm + quý", () => {
    expect(parsePeriodParts("quarter:2026-Q2")).toEqual({
      year: 2026,
      quarter: 2,
      month: null,
      weekFrom: null,
    });
  });
  it("month: suy ra quý từ tháng", () => {
    expect(parsePeriodParts("month:2026-08")).toEqual({
      year: 2026,
      quarter: 3,
      month: 8,
      weekFrom: null,
    });
  });
  it("week: điền đủ năm/quý/tháng + weekFrom", () => {
    const p = parsePeriodParts("week:2026-08-08");
    expect(p).toEqual({ year: 2026, quarter: 3, month: 8, weekFrom: "2026-08-08" });
  });
  it("preset this_month/last_month phản chiếu lên tháng", () => {
    const tm = parsePeriodParts("this_month");
    expect(tm.month).not.toBeNull();
    expect(tm.quarter).toBe(Math.floor(((tm.month ?? 1) - 1) / 3) + 1);
  });
});

describe("monthsOfYear / weeksOfMonth", () => {
  it("12 tháng, value YYYY-MM", () => {
    const ms = monthsOfYear(2026);
    expect(ms).toHaveLength(12);
    expect(ms[0]).toEqual({ value: "2026-01", label: "Tháng 1" });
    expect(ms[11].value).toBe("2026-12");
  });

  it("weeksOfMonth: tuần báo cáo T7→T6 giao với tháng, value 'week:<T7>'", () => {
    const ws = weeksOfMonth(2026, 8);
    expect(ws.length).toBeGreaterThanOrEqual(4);
    expect(ws.length).toBeLessThanOrEqual(6);
    for (const w of ws) {
      expect(w.value).toBe(`week:${w.from}`);
      // mỗi tuần 7 ngày, bắt đầu Thứ 7 (UTC getUTCDay === 6)
      expect(new Date(`${w.from}T00:00:00Z`).getUTCDay()).toBe(6);
      // có giao với tháng 8
      expect(w.to >= "2026-08-01" && w.from <= "2026-08-31").toBe(true);
    }
  });
});
