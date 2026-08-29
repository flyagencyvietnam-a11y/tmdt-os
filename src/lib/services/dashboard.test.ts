import { describe, expect, it } from "vitest";
import { comparePeriod } from "./dashboard";

describe("comparePeriod (SPEC 12.2)", () => {
  it("prev: kỳ liền trước cùng độ dài", () => {
    // tháng 8 (31 ngày) -> tháng 7
    expect(comparePeriod("2026-08-01", "2026-08-31", "prev")).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("prev: 7 ngày -> 7 ngày liền trước", () => {
    expect(comparePeriod("2026-08-10", "2026-08-16", "prev")).toEqual({
      from: "2026-08-03",
      to: "2026-08-09",
    });
  });

  it("yoy: cùng kỳ năm trước", () => {
    expect(comparePeriod("2026-08-01", "2026-08-31", "yoy")).toEqual({
      from: "2025-08-01",
      to: "2025-08-31",
    });
  });

  it("none -> null", () => {
    expect(comparePeriod("2026-08-01", "2026-08-31", "none")).toBeNull();
  });
});
