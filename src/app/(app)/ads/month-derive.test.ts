import { describe, expect, it } from "vitest";
import { expectedWeeks, isDerivedField, isSynthetic, officialOf, weekMonth, withDerivedMonths } from "./month-derive";
import type { MetricRow } from "./shared";

let n = 0;
function row(p: Partial<MetricRow> & Pick<MetricRow, "line" | "period" | "periodType">): MetricRow {
  return {
    id: String(++n),
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
const wk = (period: string, p: Partial<MetricRow> & Pick<MetricRow, "line">) => row({ periodType: "week", period, ...p });

describe("tuần → tháng theo đa số ngày", () => {
  it("tháng chứa Thứ 3 của tuần (ngày thứ 4)", () => {
    expect(weekMonth("2026-08-29")).toBe("2026-09"); // 29/08–04/09: 4 ngày T9
    expect(weekMonth("2026-09-26")).toBe("2026-09"); // 26/09–02/10: 5 ngày T9
    expect(weekMonth("2026-10-24")).toBe("2026-10");
    expect(weekMonth("2026-10-31")).toBe("2026-11"); // 31/10–06/11: 6 ngày T11
  });

  it("mỗi tuần thuộc đúng 1 tháng (không trùng, không sót)", () => {
    expect(expectedWeeks("2026-09")).toEqual(["2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
    expect(expectedWeeks("2026-10")).toEqual(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"]);
    expect(expectedWeeks("2026-11")[0]).toBe("2026-10-31");
    const all = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"].flatMap(expectedWeeks);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("withDerivedMonths", () => {
  const sep = expectedWeeks("2026-09");
  const sepWeeks = (spend: number) => sep.map((w) => wk(w, { line: "ecom", budget: String(spend), mql: "10" }));

  it("tháng đã qua, ĐỦ tuần: cộng các tuần vào dòng tháng ảo", () => {
    const out = withDerivedMonths(sepWeeks(1_000_000), "2026-10-19");
    const m = out.find((r) => r.periodType === "month" && r.period === "2026-09" && r.line === "ecom")!;
    expect(m.budget).toBe("5000000");
    expect(m.mql).toBe("50");
    expect(isSynthetic(m)).toBe(true);
    expect(m.derivedWeeks).toBe("5/5");
  });

  it("tháng đã qua, THIẾU tuần đã kết thúc: không cộng dở", () => {
    const out = withDerivedMonths(sepWeeks(1_000_000).slice(0, 3), "2026-10-19");
    expect(out.some((r) => r.periodType === "month")).toBe(false);
  });

  it("tháng đang chạy: cộng lũy kế các tuần đã có, ghi x/y tuần", () => {
    const oct = expectedWeeks("2026-10").slice(0, 2).map((w) => wk(w, { line: "b2c_system", budget: "2000000", messages: "50" }));
    const out = withDerivedMonths(oct, "2026-10-19");
    const m = out.find((r) => r.periodType === "month")!;
    expect(m).toMatchObject({ period: "2026-10", budget: "4000000", messages: "100", derivedWeeks: "2/4" });
  });

  it("số chính thức luôn thắng; chỉ ô trống mới lấy từ tuần (kể cả khi chính thức = 0)", () => {
    const official = row({ line: "ecom", periodType: "month", period: "2026-09", budget: "9000000", mql: "0" });
    const out = withDerivedMonths([...sepWeeks(1_000_000).map((w) => ({ ...w, messages: "4" })), official], "2026-10-19");
    const m = out.find((r) => r.id === official.id)!;
    expect(m.budget).toBe("9000000"); // chính thức
    expect(m.mql).toBe("0"); // 0 vẫn là số chính thức
    expect(m.messages).toBe("20"); // ô trống → cộng từ tuần
    expect(m.derivedFields).toEqual(["messages"]);
    expect(isSynthetic(m)).toBe(false);
    expect(isDerivedField(m, "messages")).toBe(true);
    expect(isDerivedField(m, "budget")).toBe(false);
  });

  it("tính riêng từng SBU: trung tâm này có số chính thức, trung tâm kia lấy từ tuần", () => {
    const a = "sbu-a";
    const b = "sbu-b";
    const rows = [
      ...sep.map((w) => wk(w, { line: "b2c_center", sbuId: a, centerOrderBudget: "100" })),
      ...sep.map((w) => wk(w, { line: "b2c_center", sbuId: b, centerOrderBudget: "200" })),
      row({ line: "b2c_center", sbuId: a, periodType: "month", period: "2026-09", centerOrderBudget: "777" }),
    ];
    const out = withDerivedMonths(rows, "2026-10-19").filter((r) => r.periodType === "month");
    expect(out.find((r) => r.sbuId === a)!.centerOrderBudget).toBe("777");
    expect(out.find((r) => r.sbuId === b)!.centerOrderBudget).toBe("1000");
  });

  it("officialOf bỏ phần tạm tính để mở form sửa không ghi nhầm vào số chính thức", () => {
    const official = row({ line: "ecom", periodType: "month", period: "2026-09", budget: "9" });
    const out = withDerivedMonths([...sepWeeks(1).map((w) => ({ ...w, messages: "4" })), official], "2026-10-19");
    const merged = out.find((r) => r.id === official.id)!;
    expect(officialOf(merged)).toMatchObject({ budget: "9", messages: null });
    expect(officialOf(merged)!.derivedFields).toBeUndefined();
    const syn = withDerivedMonths(sepWeeks(1), "2026-10-19").find((r) => r.periodType === "month")!;
    expect(officialOf(syn)).toBeNull();
  });

  it("không có dòng tuần thì trả nguyên dữ liệu", () => {
    const rows = [row({ line: "ecom", periodType: "month", period: "2026-09", budget: "1" })];
    expect(withDerivedMonths(rows, "2026-10-19")).toBe(rows);
  });
});
