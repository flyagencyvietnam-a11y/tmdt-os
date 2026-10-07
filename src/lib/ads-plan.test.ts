import { describe, expect, it } from "vitest";
import { ADS_GROUPS, groupOfLine } from "./ads-lines";
import { budgetProgress, monthElapsed, plannedUnitCost, targetProgress } from "./ads-plan";

describe("monthElapsed", () => {
  it("tháng đã qua = 1, chưa tới = 0, giữa tháng theo ngày", () => {
    expect(monthElapsed("2026-09", "2026-10-05")).toBe(1);
    expect(monthElapsed("2026-11", "2026-10-05")).toBe(0);
    expect(monthElapsed("2026-10", "2026-10-31")).toBe(1);
    expect(monthElapsed("2026-10", "2026-10-01")).toBeCloseTo(1 / 31);
    expect(monthElapsed("2026-10", "2026-10-15")).toBeCloseTo(15 / 31);
  });
});

describe("budgetProgress", () => {
  it("chưa lập kế hoạch / chưa có số", () => {
    expect(budgetProgress(null, 5, "2026-10", "2026-10-15").status).toBe("no_plan");
    expect(budgetProgress(100, null, "2026-10", "2026-10-15").status).toBe("no_actual");
  });
  it("đúng tiến độ giữa tháng", () => {
    const p = budgetProgress(31_000_000, 15_000_000, "2026-10", "2026-10-15");
    expect(p.status).toBe("on_track");
    expect(p.used).toBeCloseTo(15 / 31);
    expect(p.forecast).toBeCloseTo(31_000_000, -5);
  });
  it("đi nhanh: dự báo vượt KH hơn 10% nhưng chưa vượt", () => {
    expect(budgetProgress(31_000_000, 25_000_000, "2026-10", "2026-10-15").status).toBe("fast");
  });
  it("vượt kế hoạch", () => {
    expect(budgetProgress(10_000_000, 11_000_000, "2026-10", "2026-10-20").status).toBe("over");
  });
  it("đi chậm chỉ khi tháng đã qua quá nửa; tháng đã qua dùng thực tế", () => {
    expect(budgetProgress(31_000_000, 5_000_000, "2026-10", "2026-10-10").status).toBe("on_track");
    expect(budgetProgress(31_000_000, 5_000_000, "2026-10", "2026-10-25").status).toBe("slow");
    expect(budgetProgress(100, 50, "2026-09", "2026-10-05").status).toBe("slow");
    expect(budgetProgress(100, 95, "2026-09", "2026-10-05").forecast).toBe(95);
  });
});

describe("targetProgress", () => {
  it("đạt / đúng nhịp / chậm / chưa có mục tiêu", () => {
    expect(targetProgress("leads", 100, 120, 0.5).status).toBe("achieved");
    expect(targetProgress("leads", 100, 45, 0.5).status).toBe("on_pace");
    expect(targetProgress("leads", 100, 20, 0.5).status).toBe("behind");
    expect(targetProgress("leads", 100, 90, 1).status).toBe("behind");
    expect(targetProgress("leads", null, 90, 1).status).toBe("no_target");
    expect(targetProgress("leads", 100, null, 1).status).toBe("no_actual");
  });
});

describe("cấu hình mảng", () => {
  it("plannedUnitCost", () => {
    expect(plannedUnitCost(30_000_000, 100)).toBe(300_000);
    expect(plannedUnitCost(null, 100)).toBeNull();
  });
  it("mọi line thuộc đúng 1 mảng; osir hiển thị là VMT", () => {
    const all = ADS_GROUPS.flatMap((g) => g.lines);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(["b2b", "b2c_center", "b2c_system", "ecom", "osir", "vmp"]);
    expect(groupOfLine("osir").label).toContain("VMT");
    expect(groupOfLine("b2c_center").key).toBe("b2c");
  });
});
