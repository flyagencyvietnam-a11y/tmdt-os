import { describe, expect, it } from "vitest";
import { splitB2cOwn } from "./b2c-own";
import type { MetricRow } from "./shared";
import { buildAdsUnits, buildUnitGroups, groupFunnel, totalFunnel, unitFunnel } from "./units";

let n = 0;
const row = (p: Partial<MetricRow> & Pick<MetricRow, "line" | "period">): MetricRow => ({
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
});
const units = buildAdsUnits([
  { id: "a", code: "VTS", name: "Võ Thị Sáu", region: "KV1" },
  { id: "b", code: "PVT", name: "Phạm Văn Thuận", region: "KV1" },
]);
const ho = units.find((u) => u.kind === "ho")!;

const month = [
  row({ line: "b2c_system", period: "2026-09", budget: "40000000", leads: "158", newStudents: "21" }),
  row({ line: "b2c_google", period: "2026-09", budget: "5000000", leads: "10" }),
  row({ line: "b2c_center", period: "2026-09", sbuId: "a", centerOrderBudget: "9000000", leads: "100", newStudents: "2" }),
  row({ line: "b2c_center", period: "2026-09", sbuId: "b", centerOrderBudget: "6000000", leads: "20", newStudents: "1" }),
];

describe("splitB2cOwn — HO · FB chỉ còn phần page Tổng", () => {
  it("tháng: Lead và HVM trừ phần trung tâm, ghi nhớ phần đã trừ để cộng lại khi sửa", () => {
    const ho1 = splitB2cOwn(month).find((r) => r.line === "b2c_system")!;
    expect(ho1.leads).toBe("38");
    expect(ho1.newStudents).toBe("18");
    expect(ho1.b2cOwn).toBe(true);
    expect(ho1.hvmTotal).toBe(false);
    expect(ho1.b2cOffset).toEqual({ leads: 120, newStudents: 3 });
  });

  it("tuần: Lead trừ theo tuần, HVM giữ TỔNG (HVM riêng trung tâm chỉ có theo tháng)", () => {
    const wk = month.map((r) => ({ ...r, periodType: "week" as const, period: "2026-09-07" }));
    const ho1 = splitB2cOwn(wk).find((r) => r.line === "b2c_system")!;
    expect(ho1.leads).toBe("38");
    expect(ho1.newStudents).toBe("21");
    expect(ho1.hvmTotal).toBe(true);
  });

  it("kỳ trung tâm chưa có số: HO · FB giữ nguyên toàn bộ, không trừ, không âm", () => {
    const early = [row({ line: "b2c_system", period: "2026-02", budget: "10", leads: "50" }), row({ line: "b2c_center", period: "2026-02", sbuId: "a", centerOrderBudget: "5" })];
    expect(splitB2cOwn(early).find((r) => r.line === "b2c_system")!.leads).toBe("50");
    const tooMany = [row({ line: "b2c_system", period: "2026-03", leads: "5" }), row({ line: "b2c_center", period: "2026-03", sbuId: "a", leads: "9" })];
    const over = splitB2cOwn(tooMany).find((r) => r.line === "b2c_system")!;
    expect(over.leads).toBe("0");
    expect(over.b2cWarn).toContain("Lead các trung tâm (9) lớn hơn tổng B2C đã lưu (5)");
    expect(splitB2cOwn(early).find((r) => r.line === "b2c_system")!.b2cWarn).toBeUndefined();
  });

  it("không có dòng trung tâm nào thì trả nguyên dữ liệu", () => {
    const only = [month[0]];
    expect(splitB2cOwn(only)).toBe(only);
  });
});

describe("CPL/CAC: mỗi dòng tự chia", () => {
  const rows = splitB2cOwn(month);

  it("HO · FB: CPL = NS HO ÷ Lead page Tổng; CAC = NS HO ÷ HVM page Tổng (tháng)", () => {
    const f = unitFunnel(rows, ho);
    expect(f.leads).toBe(38);
    expect(f.cpl).toBeCloseTo(40_000_000 / 38);
    expect(f.cac).toBeCloseTo(40_000_000 / 18);
    expect(f.cplBase).toBe(40_000_000);
  });

  it("HO · FB theo TUẦN: HVM là tổng B2C nên CAC chia tổng chi B2C (HO + trung tâm)", () => {
    const wk = splitB2cOwn(month.map((r) => ({ ...r, periodType: "week" as const, period: "2026-09-07" })));
    const f = unitFunnel(wk, ho);
    expect(f.cpl).toBeCloseTo(40_000_000 / 38);
    expect(f.cac).toBeCloseTo(55_000_000 / 21);
  });

  it("nhóm MKT HO: CPL = (HO + Google) ÷ (Lead HO + Lead Google)", () => {
    const g = buildUnitGroups(units)[0];
    const f = groupFunnel(rows, g.members);
    expect(f.spend).toBe(45_000_000);
    expect(f.leads).toBe(48);
    expect(f.cpl).toBeCloseTo(45_000_000 / 48);
  });

  it("Tổng cộng cộng thẳng HO + trung tâm + Google; CPL = chi các SBU có Lead ÷ Lead", () => {
    const f = totalFunnel(rows);
    expect(f.leads).toBe(38 + 120 + 10);
    expect(f.hvm).toBe(18 + 3);
    expect(f.cpl).toBeCloseTo(60_000_000 / 168); // 40 + 9 + 6 + 5
    expect(f.cplBase).toBe(60_000_000);
  });

  it("dữ liệu chưa tách (không qua splitB2cOwn) vẫn tính như quy ước cũ: HO = tổng B2C", () => {
    const f = unitFunnel(month, ho);
    expect(f.leads).toBe(158);
    expect(f.cpl).toBeCloseTo(55_000_000 / 158);
  });
});
