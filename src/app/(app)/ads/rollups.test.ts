import { describe, expect, it } from "vitest";
import { b2cSummary, ecomAggregate, ecomPeriods, makeEcomPeriod, overviewTotal, prevQuarter, quarterKey, quarterMonths, type EcomProductRow } from "./rollups";
import type { MetricRow } from "./shared";

let n = 0;
function row(p: Partial<MetricRow> & Pick<MetricRow, "line" | "period">): MetricRow {
  return {
    id: String(++n),
    periodType: "month",
    sbuId: null,
    budget: null,
    centerOrderBudget: null,
    hoTopupBudget: null,
    leads: null,
    newStudents: null,
    messages: null,
    impressions: null,
    revenue: null,
    actualRevenue: null,
    mql: null,
    deals: null,
    status: "planned",
    ...p,
  };
}

describe("quý", () => {
  it("quy đổi tháng ↔ quý", () => {
    expect(quarterKey("2026-09")).toBe("2026-Q3");
    expect(quarterKey("2026-10")).toBe("2026-Q4");
    expect(quarterMonths("2026-Q3")).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(prevQuarter("2026-Q1")).toBe("2025-Q4");
    expect(prevQuarter("2026-Q3")).toBe("2026-Q2");
  });
});

describe("b2cSummary — Lead/HVM tính chung Hệ thống + Trung tâm", () => {
  const rows = [
    // T7: tổng B2C 158 lead / 21 HVM; TT quy riêng 120 lead / 3 HVM
    row({ line: "b2c_system", period: "2026-07", budget: "46500995", leads: "158", newStudents: "21" }),
    row({ line: "b2c_center", period: "2026-07", sbuId: "a", centerOrderBudget: "10000000", hoTopupBudget: "1000000", leads: "100", newStudents: "2" }),
    row({ line: "b2c_center", period: "2026-07", sbuId: "b", centerOrderBudget: "4000000", leads: "20", newStudents: "1" }),
    // T1: chỉ có số tổng, chưa có số TT quy riêng
    row({ line: "b2c_system", period: "2026-01", budget: "20000000", leads: "55", newStudents: "15" }),
    row({ line: "b2c_center", period: "2026-01", sbuId: "a", centerOrderBudget: "5000000" }),
  ];

  it("CPL/CAC dùng TỔNG ngân sách (Hệ thống + TT) chia Lead/HVM TỔNG", () => {
    const s = b2cSummary(rows, ["2026-07"]);
    expect(s.systemSpend).toBe(46500995);
    expect(s.centerSpend).toBe(15000000);
    expect(s.totalSpend).toBe(61500995);
    expect(s.leads).toBe(158);
    expect(s.newStudents).toBe(21);
    expect(s.cpl).toBeCloseTo(61500995 / 158);
    expect(s.cac).toBeCloseTo(61500995 / 21);
  });

  it("số TT quy riêng là tập con: không cộng thêm vào tổng, phần còn lại = tổng − TT", () => {
    const s = b2cSummary(rows, ["2026-07"]);
    expect(s.center.leads).toBe(120);
    expect(s.center.newStudents).toBe(3);
    expect(s.center.cpl).toBeCloseTo(15000000 / 120);
    expect(s.rest.leads).toBe(38);
    expect(s.rest.newStudents).toBe(18);
    expect(s.inconsistentMonths).toEqual([]);
  });

  it("cộng quý: tháng chưa có số TT không kéo lệch phần 'còn lại'", () => {
    const s = b2cSummary(rows, ["2026-01", "2026-07"]);
    expect(s.leads).toBe(213);
    expect(s.attributedMonths).toBe(1);
    expect(s.center.leads).toBe(120);
    expect(s.rest.leads).toBe(38);
    // chi phí TT của tháng chưa quy riêng vẫn nằm trong tổng
    expect(s.centerSpend).toBe(20000000);
  });

  it("báo tháng nhập sai khi số TT lớn hơn số tổng", () => {
    const bad = [row({ line: "b2c_system", period: "2026-08", budget: "1", leads: "10", newStudents: "1" }), row({ line: "b2c_center", period: "2026-08", sbuId: "a", centerOrderBudget: "1", leads: "11", newStudents: "0" })];
    expect(b2cSummary(bad, ["2026-08"]).inconsistentMonths).toEqual(["2026-08"]);
  });
});

describe("overviewTotal — đúng 'TỔNG HỢP DIGITAL' của sheet", () => {
  it("lead tổng gồm MQL của Ecom; B2C chỉ đếm 1 lần", () => {
    const rows = [
      row({ line: "b2c_system", period: "2026-07", budget: "46500995", leads: "158", newStudents: "21" }),
      row({ line: "b2c_center", period: "2026-07", sbuId: "a", centerOrderBudget: "45275706", leads: "120", newStudents: "3" }),
      row({ line: "ecom", period: "2026-07", budget: "43517991", mql: "214", newStudents: "11" }),
      row({ line: "osir", period: "2026-07", budget: "4150734", leads: "24", newStudents: "7" }),
    ];
    const t = overviewTotal(rows, ["2026-07"]);
    expect(t.leads).toBe(158 + 214 + 24);
    expect(t.newStudents).toBe(21 + 11 + 7);
    expect(t.spend).toBe(46500995 + 45275706 + 43517991 + 4150734);
  });
});

describe("Ecom theo sản phẩm", () => {
  const mk = (period: string, periodEnd: string | null, product: string, spend: string, mql: string, hv: string, revenue: string): EcomProductRow => ({
    id: product + period,
    period,
    periodEnd,
    product,
    spend,
    mql,
    newStudents: hv,
    revenue,
    notes: null,
  });
  it("kỳ gộp T6-T7 mở rộng thành 2 tháng", () => {
    const p = makeEcomPeriod("2026-06", "2026-07");
    expect(p.months).toEqual(["2026-06", "2026-07"]);
    expect(makeEcomPeriod("2026-08", null).months).toEqual(["2026-08"]);
    expect(makeEcomPeriod("2026-08", "2026-08").periodEnd).toBeNull();
  });
  it("liệt kê kỳ cũ → mới, không trùng", () => {
    const rows = [mk("2026-08", null, "a", "1", "1", "1", "1"), mk("2026-06", "2026-07", "a", "1", "1", "1", "1"), mk("2026-06", "2026-07", "b", "1", "1", "1", "1")];
    expect(ecomPeriods(rows).map((p) => p.key)).toEqual(["2026-06", "2026-08"]);
  });
  it("CAC/CPMQL/ROAS suy ra từ tổng", () => {
    const a = ecomAggregate([mk("2026-08", null, "a", "10000000", "50", "2", "20000000"), mk("2026-08", null, "b", "5000000", "25", "1", "5000000")]);
    expect(a.spend).toBe(15000000);
    expect(a.cac).toBe(5000000);
    expect(a.cpmql).toBe(200000);
    expect(a.roas).toBeCloseTo(25000000 / 15000000);
  });
});
