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
    expect(ho1.b2cOffset).toEqual({ leads: 120, newStudents: 3 });
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

describe("HVM theo TUẦN: phần HVM tháng của trung tâm (nằm ở tuần cuối tháng) trừ dần từ tuần cuối ngược về trước", () => {
  const wk = (period: string, p: Partial<MetricRow> & Pick<MetricRow, "line">) => row({ periodType: "week", period, ...p });
  // Tháng 9/2026 theo đa số ngày gồm 4 tuần: 31/08, 07/09, 14/09, 21/09. HVM tổng B2C của HO: 5, 7, 12, 7 = 31; trung tâm: 23 dồn vào tuần 21/09.
  const rows = [
    wk("2026-08-31", { line: "b2c_system", budget: "10000000", leads: "20", newStudents: "5" }),
    wk("2026-09-07", { line: "b2c_system", budget: "10000000", leads: "20", newStudents: "7" }),
    wk("2026-09-14", { line: "b2c_system", budget: "10000000", leads: "20", newStudents: "12" }),
    wk("2026-09-21", { line: "b2c_system", budget: "10000000", leads: "20", newStudents: "7" }),
    wk("2026-09-21", { line: "b2c_center", sbuId: "a", centerOrderBudget: "4000000", leads: "6", newStudents: "23" }),
  ];
  const out = splitB2cOwn(rows);
  const hvmOf = (p: string) => out.find((r) => r.line === "b2c_system" && r.period === p)!.newStudents;

  it("HVM của HO · FB: 5, 3, 0, 0 — tổng 8 = 31 − 23 (đúng số trừ trực tiếp theo tháng)", () => {
    expect([hvmOf("2026-08-31"), hvmOf("2026-09-07"), hvmOf("2026-09-14"), hvmOf("2026-09-21")]).toEqual(["5", "3", "0", "0"]);
  });

  it("Tổng cộng cả 4 tuần = HVM tổng B2C đã lưu (31): cộng thẳng HO + trung tâm", () => {
    expect(totalFunnel(out).hvm).toBe(31);
  });

  it("Lead tuần trừ trực tiếp theo từng tuần", () => {
    expect(out.find((r) => r.line === "b2c_system" && r.period === "2026-09-21")!.leads).toBe("14");
    expect(out.find((r) => r.line === "b2c_system" && r.period === "2026-09-07")!.leads).toBe("20");
  });
});

describe("Tổng cộng = cộng các khối; CPL/CAC mỗi dòng tự chia", () => {
  const rows = splitB2cOwn(month);

  it("HO · FB: CPL = NS HO ÷ Lead page Tổng; CAC = NS HO ÷ HVM page Tổng", () => {
    const f = unitFunnel(rows, ho);
    expect(f.leads).toBe(38);
    expect(f.cpl).toBeCloseTo(40_000_000 / 38);
    expect(f.cac).toBeCloseTo(40_000_000 / 18);
    expect(f.cplBase).toBe(40_000_000);
  });

  it("nhóm MKT HO: CPL = (HO + Google) ÷ (Lead HO + Lead Google)", () => {
    const g = buildUnitGroups(units)[0];
    const f = groupFunnel(rows, g.members);
    expect(f.spend).toBe(45_000_000);
    expect(f.leads).toBe(48);
    expect(f.cpl).toBeCloseTo(45_000_000 / 48);
  });

  it("Tổng cộng: Ngân sách, Lead, HVM đều bằng tổng các nhóm; CPL = tổng chi ÷ tổng Lead", () => {
    const groups = buildUnitGroups(units);
    const parts = groups.map((g) => groupFunnel(rows, g.members));
    const f = totalFunnel(rows);
    const sum = (k: "spend" | "leads" | "hvm") => parts.reduce((s, x) => s + (x[k] ?? 0), 0);
    expect(f.spend).toBe(sum("spend"));
    expect(f.leads).toBe(sum("leads"));
    expect(f.hvm).toBe(sum("hvm"));
    expect(f.leads).toBe(38 + 120 + 10);
    expect(f.hvm).toBe(18 + 3);
    expect(f.cpl).toBeCloseTo(60_000_000 / 168);
    expect(f.cac).toBeCloseTo(60_000_000 / 21);
  });
});
