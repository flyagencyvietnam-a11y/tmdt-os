import { describe, expect, it } from "vitest";
import type { MetricRow } from "./shared";
import { buildAdsUnits, buildUnitGroups, groupFunnel, rowsOfGroup } from "./units";

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
  { id: "vts", code: "VTS", name: "Võ Thị Sáu", region: "KV1" },
  { id: "pvt", code: "PVT", name: "Phạm Văn Thuận", region: "KV1" },
  { id: "tpu", code: "TPU", name: "TPU", region: "KV2" },
  { id: "bph", code: "BPH", name: "BPH", region: "KV3" },
  { id: "xyz", code: "XYZ", name: "XYZ", region: null },
]);

describe("nhóm trung tâm theo khu vực", () => {
  it("nhóm theo sbus.region, KV1 → KV2 → KV3, chưa có khu vực xếp 'Khác' cuối", () => {
    const g = buildUnitGroups(units);
    expect(g.map((x) => x.key)).toEqual(["KV1", "KV2", "KV3", "Khác"]);
    expect(g[0].members.map((u) => u.code)).toEqual(["VTS", "PVT"]);
    expect(g[2].members.map((u) => u.code)).toEqual(["BPH"]);
  });

  it("chỉ trung tâm được nhóm (Hệ thống, Ecom, VMP, VMT đứng riêng)", () => {
    expect(buildUnitGroups(units).flatMap((g) => g.members).every((u) => u.kind === "center")).toBe(true);
  });

  it("dòng cộng khu vực = cộng các trung tâm thành viên; CPL/CAC chỉ chia chi phí của phần đã có Lead/HVM", () => {
    const rows = [
      row({ line: "b2c_center", period: "2026-09", sbuId: "vts", centerOrderBudget: "9000000", hoTopupBudget: "1000000", leads: "100", newStudents: "2", messages: "30" }),
      row({ line: "b2c_center", period: "2026-09", sbuId: "pvt", centerOrderBudget: "5000000", leads: "20", newStudents: "3" }),
      row({ line: "b2c_center", period: "2026-09", sbuId: "tpu", centerOrderBudget: "7000000", leads: "50" }), // khu vực khác: không tính
    ];
    const kv1 = buildUnitGroups(units)[0];
    const f = groupFunnel(rows, kv1.members);
    expect(f.spend).toBe(15_000_000);
    expect(f.leads).toBe(120);
    expect(f.hvm).toBe(5);
    expect(f.messages).toBe(30);
    expect(f.cpl).toBeCloseTo(15_000_000 / 120);
    expect(f.cac).toBeCloseTo(15_000_000 / 5);
    expect(rowsOfGroup(rows, kv1.members)).toHaveLength(2);
  });

  it("khu vực chưa có số thì để trống, không thành 0", () => {
    const f = groupFunnel([], buildUnitGroups(units)[1].members);
    expect(f.spend).toBeNull();
    expect(f.leads).toBeNull();
    expect(f.cpl).toBeNull();
  });
});
