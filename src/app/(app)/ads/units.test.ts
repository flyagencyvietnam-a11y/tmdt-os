import { describe, expect, it } from "vitest";
import type { MetricRow } from "./shared";
import { splitB2cOwn } from "./b2c-own";
import { bucketRows, buildAdsUnits, indexRows, totalFunnel, unitFunnel } from "./units";

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

const units = buildAdsUnits([
  { id: "a", code: "VTS", name: "Võ Thị Sáu" },
  { id: "b", code: "PVT", name: "Phạm Văn Thuận" },
]);
const unit = (key: string) => units.find((u) => u.key === key)!;

describe("buildAdsUnits — SBU ngang hàng", () => {
  it("một danh sách: HO · FB, HO · Google, trung tâm, Ecom, VMP, VMT", () => {
    expect(units.map((u) => u.code)).toEqual(["HO · FB", "HO · Google", "VTS", "PVT", "Ecom", "VMP", "VMT"]);
    expect(unit("ecom").leadField).toBe("mql");
    expect(unit("osir").label).toBe("VMT (khảo thí)");
  });
});

describe("unitFunnel / totalFunnel", () => {
  const rows = [
    row({ line: "b2c_system", period: "2026-09", budget: "40000000", leads: "150", newStudents: "20", messages: "300" }),
    row({ line: "b2c_center", period: "2026-09", sbuId: "a", centerOrderBudget: "9000000", hoTopupBudget: "1000000", leads: "100", newStudents: "2" }),
    row({ line: "b2c_center", period: "2026-09", sbuId: "b", centerOrderBudget: "5000000", leads: "20", newStudents: "1" }),
    row({ line: "ecom", period: "2026-09", budget: "30000000", mql: "300", newStudents: "30", revenue: "90000000" }),
    row({ line: "vmp", period: "2026-09", budget: "10000000", leads: "50", newStudents: "5" }),
  ];

  it("Ecom lấy MQL làm Lead; CPL = chi ÷ MQL; ROAS = doanh thu ÷ chi", () => {
    const f = unitFunnel(rows, unit("ecom"));
    expect(f.leads).toBe(300);
    expect(f.cpl).toBeCloseTo(100000);
    expect(f.cac).toBeCloseTo(1000000);
    expect(f.roas).toBeCloseTo(3);
  });

  it("trung tâm: chi = NS TT order + P.MKT thêm; Lead/HVM là phần quy riêng", () => {
    const f = unitFunnel(rows, unit("a"));
    expect(f.spend).toBe(10000000);
    expect(f.leads).toBe(100);
    expect(f.cpl).toBeCloseTo(100000);
  });

  it("dòng Hệ thống: CPL/CAC = NS Hệ thống ÷ Lead/HVM của chính dòng đó", () => {
    const f = unitFunnel(rows, unit("ho"));
    expect(f.spend).toBe(40000000);
    expect(f.leads).toBe(150);
    expect(f.cpl).toBeCloseTo(40000000 / 150);
    expect(f.cac).toBeCloseTo(40000000 / 20);
  });

  it("sau khi tách phần trung tâm (b2c-own): HO · FB chỉ còn page Tổng, Tổng cộng CỘNG thẳng các khối", () => {
    const split = splitB2cOwn(rows);
    const f = unitFunnel(split, unit("ho"));
    expect(f.leads).toBe(150 - 120);
    expect(f.cpl).toBeCloseTo(40000000 / 30);
    const t = totalFunnel(split);
    expect(t.spend).toBe(95000000);
    expect(t.leads).toBe(30 + 120 + 300 + 50); // = 150 (tổng B2C) + 300 + 50
    expect(t.hvm).toBe(17 + 3 + 30 + 5);
    expect(t.cpl).toBeCloseTo(95000000 / 500);
    expect(t.cac).toBeCloseTo(95000000 / 55);
  });

  it("Tổng cộng: dòng Hệ thống chưa nhập thì tạm cộng Lead/HVM từ các trung tâm", () => {
    const noSys = rows.filter((r) => r.line !== "b2c_system");
    const t = totalFunnel(noSys);
    expect(t.leads).toBe(120 + 300 + 50);
    expect(t.hvm).toBe(3 + 30 + 5);
  });

  it("fallback tính theo từng kỳ, không trộn giữa các tháng", () => {
    const two = [
      row({ line: "b2c_system", period: "2026-08", budget: "1", leads: "50" }),
      row({ line: "b2c_center", period: "2026-08", sbuId: "a", centerOrderBudget: "1", leads: "40" }),
      row({ line: "b2c_center", period: "2026-09", sbuId: "a", centerOrderBudget: "1", leads: "30" }),
    ];
    // Tháng 8: HO 50 là tổng B2C gồm cả trung tâm (40) → HO còn 10; tháng 9 không có dòng HO → chỉ có trung tâm (30). Tổng = 10 + 40 + 30.
    expect(totalFunnel(splitB2cOwn(two)).leads).toBe(80);
  });

  it("CPL/CAC của dòng Tổng = tổng chi ÷ tổng Lead/HVM của kỳ (một kỳ: đọc được ngay từ ô Ngân sách và Lead)", () => {
    const partial = [
      row({ line: "b2c_system", period: "2026-09", budget: "40000000" }),
      row({ line: "ecom", period: "2026-09", budget: "30000000", mql: "300", newStudents: "30" }),
    ];
    const t = totalFunnel(partial);
    expect(t.spend).toBe(70000000);
    expect(t.cpl).toBeCloseTo(70000000 / 300);
    expect(t.cac).toBeCloseTo(70000000 / 30);
    expect(t.cplBase).toBe(70000000);
  });

  it("Tổng nhiều kỳ: chỉ chia chi phí của kỳ đã nhập Lead", () => {
    const t = totalFunnel([row({ line: "vmp", period: "2026-07", budget: "10000000" }), row({ line: "vmp", period: "2026-08", budget: "10000000", leads: "100" })]);
    expect(t.cpl).toBeCloseTo(100000);
  });

  it("nhiều kỳ (quý): CPL chỉ chia chi phí của tháng đã nhập Lead", () => {
    const q = [
      row({ line: "vmp", period: "2026-07", budget: "10000000" }), // tháng 7 chưa nhập Lead
      row({ line: "vmp", period: "2026-08", budget: "10000000", leads: "100" }),
    ];
    const f = unitFunnel(q, unit("vmp"));
    expect(f.spend).toBe(20000000);
    expect(f.cpl).toBeCloseTo(100000); // 10tr ÷ 100, không phải 20tr ÷ 100
  });

  it("chưa có số thì để trống (null), không thành 0", () => {
    const f = unitFunnel([row({ line: "vmp", period: "2026-09", budget: "1000" })], unit("vmp"));
    expect(f.leads).toBeNull();
    expect(f.cpl).toBeNull();
    expect(totalFunnel([]).spend).toBeNull();
  });

  it("chỉ mục theo kỳ tách đúng tuần / tháng", () => {
    const mixed = [row({ line: "ecom", period: "2026-09", budget: "1" }), row({ line: "ecom", period: "2026-09-05", periodType: "week", budget: "2" })];
    const idx = indexRows(mixed);
    expect(bucketRows(idx, "month", ["2026-09"])).toHaveLength(1);
    expect(bucketRows(idx, "week", ["2026-09-05"])[0].budget).toBe("2");
  });
});
