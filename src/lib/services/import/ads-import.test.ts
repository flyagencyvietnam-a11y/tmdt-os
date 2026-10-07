import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/db/test-db";
import { adsCampaigns, adsEcomProducts, adsMetrics, adsPlans, sbus, users } from "@/lib/db/schema";
import type { DB } from "@/lib/db";
import { buildXlsx } from "@/lib/export-xlsx";
import { applyAdsImport, parseDayCell, parseMonthCell, parseNumberCell, planAdsImport, type AdsImportKind } from "./ads-import";

describe("đọc ô", () => {
  it("số kiểu Việt Nam", () => {
    expect(parseNumberCell("1.234.567")).toBe(1234567);
    expect(parseNumberCell("1,234,567")).toBe(1234567);
    expect(parseNumberCell("12,5")).toBe(12.5);
    expect(parseNumberCell("3000000 đ")).toBe(3000000);
    expect(parseNumberCell("")).toBeNull();
    expect(parseNumberCell("abc")).toBeNaN();
  });
  it("tháng và ngày", () => {
    expect(parseMonthCell("09/2026")).toBe("2026-09");
    expect(parseMonthCell("9/2026")).toBe("2026-09");
    expect(parseMonthCell("2026-09")).toBe("2026-09");
    expect(parseMonthCell("T9/2026")).toBe("2026-09");
    expect(parseMonthCell("13/2026")).toBeNull();
    expect(parseDayCell("03/10/2026")).toBe("2026-10-03");
    expect(parseDayCell("2026-10-03")).toBe("2026-10-03");
    expect(parseDayCell("3 tháng 10")).toBeNull();
  });
});

const col = (header: string) => ({ header, key: header.replace(/[*\s(].*$/, ""), width: 14 });

async function file(sheet: string, headers: string[], rows: Record<string, unknown>[]) {
  return buildXlsx([{ name: sheet, columns: headers.map(col), rows }]);
}

describe("import Ads từ Excel", () => {
  let db: TestDb;
  let d: DB;
  let vts: string;

  beforeAll(async () => {
    ({ db } = await makeTestDb());
    d = db as unknown as DB;
    const [s] = await db.insert(sbus).values({ code: "VTS", name: "Võ Thị Sáu", kind: "center", region: "KV2" }).returning();
    vts = s.id;
    await db.insert(users).values({ email: "a@test.local", passwordHash: "x", fullName: "A", role: "admin" });
  }, 60_000);

  const run = async (kind: AdsImportKind, buf: Buffer) => {
    const plan = await planAdsImport(d, kind, buf);
    return { plan, applied: await applyAdsImport(d, kind, plan, (await db.select().from(users))[0].id) };
  };

  it("HÀNG TUẦN: Hệ thống + Trung tâm, bỏ qua dòng chưa điền, báo lỗi không phải Thứ 7", async () => {
    const buf = await file("TUAN", ["week_start*", "sbu_code", "budget", "mess", "impression"], [
      { week_start: "03/10/2026", sbu_code: "", budget: "10.000.000", mess: 120, impression: 300000 },
      { week_start: "03/10/2026", sbu_code: "VTS", budget: 900000, mess: 8 },
      { week_start: "03/10/2026", sbu_code: "XXX", budget: 1 },
      { week_start: "04/10/2026", sbu_code: "VTS", budget: 1 },
      { week_start: "03/10/2026", sbu_code: "", budget: "", mess: "" },
    ]);
    const { plan, applied } = await run("week", buf);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create", "error", "error", "skip"]);
    expect(plan.rows[2].errors[0]).toMatch(/sbu_code không tồn tại/);
    expect(plan.rows[3].errors[0]).toMatch(/không phải Thứ 7/);
    expect(applied).toMatchObject({ created: 2, skipped: 1, errors: 2 });
    const sys = await db.select().from(adsMetrics).where(and(eq(adsMetrics.line, "b2c_system"), eq(adsMetrics.period, "2026-10-03")));
    expect(sys[0].budget).toBe("10000000");
    expect(sys[0].messages).toBe("120");
    const ctr = await db.select().from(adsMetrics).where(and(eq(adsMetrics.line, "b2c_center"), eq(adsMetrics.sbuId, vts)));
    expect(ctr[0].centerOrderBudget).toBe("900000"); // NS tuần TT lưu ở centerOrderBudget
  });

  it("nạp lại cùng file = cập nhật, không nhân đôi; ô trống giữ nguyên số cũ", async () => {
    const buf = await file("TUAN", ["week_start*", "sbu_code", "budget", "mess", "impression"], [{ week_start: "03/10/2026", sbu_code: "", budget: 11000000 }]);
    const { plan } = await run("week", buf);
    expect(plan.rows[0].action).toBe("update");
    const sys = await db.select().from(adsMetrics).where(and(eq(adsMetrics.line, "b2c_system"), eq(adsMetrics.period, "2026-10-03")));
    expect(sys).toHaveLength(1);
    expect(sys[0].budget).toBe("11000000");
    expect(sys[0].messages).toBe("120"); // không bị xoá
  });

  it("HÀNG THÁNG: lead/HVM tổng ở b2c_system, từng TT ở b2c_center, kiểm tra mảng/cột không hợp lệ", async () => {
    const headers = ["month*", "line*", "sbu_code", "budget", "center_order_budget", "ho_topup_budget", "leads", "new_students", "mql", "revenue"];
    const buf = await file("THANG", headers, [
      { month: "09/2026", line: "b2c_system", budget: 56568382, leads: 211, new_students: 33 },
      { month: "09/2026", line: "b2c_center", sbu_code: "VTS", center_order_budget: 2999537, leads: 20, new_students: 3 },
      { month: "09/2026", line: "b2c_center", sbu_code: "", leads: 1 },
      { month: "09/2026", line: "b2c_center", sbu_code: "VTS", budget: 5 },
      { month: "09/2026", line: "ecom", budget: 46163697, mql: 134, new_students: 12, revenue: 143188000 },
      { month: "09/2026", line: "ecom", mql: 1, leads: 5 },
      { month: "09/2026", line: "osir" },
    ]);
    const { plan, applied } = await run("month", buf);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create", "error", "error", "create", "error", "skip"]);
    expect(plan.rows[2].errors.join()).toMatch(/bắt buộc có sbu_code/);
    expect(plan.rows[3].errors.join()).toMatch(/center_order_budget/);
    expect(plan.rows[5].errors.join()).toMatch(/leads không áp dụng cho Ecom/);
    expect(applied.created).toBe(3);
    const sys = await db.select().from(adsMetrics).where(and(eq(adsMetrics.line, "b2c_system"), eq(adsMetrics.periodType, "month"), eq(adsMetrics.period, "2026-09")));
    expect(sys[0]).toMatchObject({ budget: "56568382", leads: "211", newStudents: "33" });
  });

  it("HÀNG THÁNG: sheet ECOM_SP theo sản phẩm, kỳ gộp T6-T7, nhận cả tên hiển thị", async () => {
    const buf = await file("ECOM_SP", ["month_from*", "month_to", "product*", "spend", "mql", "hv", "revenue"], [
      { month_from: "06/2026", month_to: "07/2026", product: "tesol_epath", spend: 23988734, mql: 121, hv: 14, revenue: 107492000 },
      { month_from: "09/2026", product: "Fast Track 1.5 (FT15)", spend: 372889, mql: 5, hv: 1, revenue: 4080000 },
      { month_from: "09/2026", product: "khong-co", spend: 1 },
    ]);
    const { plan } = await run("month", buf);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create", "error"]);
    const rows = await db.select().from(adsEcomProducts);
    const t = rows.find((r) => r.product === "tesol_epath")!;
    expect(t).toMatchObject({ period: "2026-06", periodEnd: "2026-07", spend: "23988734", newStudents: "14" });
    expect(rows.find((r) => r.product === "ft15")?.period).toBe("2026-09");
  });

  it("THEO REQUEST: chiến dịch mới cần spend; nạp lại cập nhật theo (tháng, TT, tên)", async () => {
    const headers = ["month*", "sbu_code*", "campaign_name*", "spend*", "messages", "reach", "misa_request_url"];
    const first = await file("REQUEST", headers, [
      { month: "09/2026", sbu_code: "VTS", campaign_name: "Khai giảng", spend: 1500000, messages: 12, reach: 9000 },
      { month: "09/2026", sbu_code: "VTS", campaign_name: "Không có spend", messages: 3 },
    ]);
    const r1 = await run("request", first);
    expect(r1.plan.rows.map((r) => r.action)).toEqual(["create", "error"]);
    const again = await file("REQUEST", headers, [{ month: "09/2026", sbu_code: "vts", campaign_name: "khai giảng", messages: 15 }]);
    const r2 = await run("request", again);
    expect(r2.plan.rows[0].action).toBe("update");
    const all = await db.select().from(adsCampaigns);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ spend: "1500000", messages: "15", reach: "9000" });
  });

  it("HÀNG TUẦN mở cho mảng khác: cột theo phễu của mảng, báo lỗi cột không áp dụng", async () => {
    const headers = ["week_start*", "line", "sbu_code", "budget", "mess", "leads", "mql", "new_students", "revenue", "deals"];
    const buf = await file("TUAN", headers, [
      { week_start: "03/10/2026", line: "ecom", budget: 5000000, mql: 30, new_students: 2, revenue: 12000000 },
      { week_start: "03/10/2026", line: "vmt", budget: 1000000, leads: 9 },
      { week_start: "03/10/2026", line: "ecom", budget: 1, leads: 4 },
      { week_start: "03/10/2026", line: "vmp", sbu_code: "VTS", budget: 1 },
      { week_start: "03/10/2026", line: "b2b", budget: 2000000, deals: 1, mess: 7 },
    ]);
    const { plan } = await run("week", buf);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create", "error", "error", "create"]);
    expect(plan.rows[2].errors.join()).toMatch(/leads không áp dụng cho báo cáo tuần của Ecom/);
    expect(plan.rows[3].errors.join()).toMatch(/không dùng sbu_code/);
    const ecom = await db.select().from(adsMetrics).where(and(eq(adsMetrics.line, "ecom"), eq(adsMetrics.periodType, "week")));
    expect(ecom[0]).toMatchObject({ budget: "5000000", mql: "30", newStudents: "2", revenue: "12000000" });
    const vmt = await db.select().from(adsMetrics).where(and(eq(adsMetrics.line, "osir"), eq(adsMetrics.periodType, "week")));
    expect(vmt[0]).toMatchObject({ budget: "1000000", leads: "9" });
  });

  it("KẾ HOẠCH: ngân sách + mục tiêu theo phễu mảng; TT chỉ có ngân sách; ô trống giữ nguyên; nạp lại không nhân đôi", async () => {
    const headers = ["month*", "line*", "sbu_code", "planned_budget", "target_leads", "target_new_students", "target_mql", "target_revenue", "target_deals", "notes"];
    const buf = await file("KE_HOACH", headers, [
      { month: "11/2026", line: "b2c_system", planned_budget: "60.000.000", target_leads: 220, target_new_students: 35 },
      { month: "11/2026", line: "b2c_center", sbu_code: "VTS", planned_budget: 3000000 },
      { month: "11/2026", line: "b2c_center", sbu_code: "VTS", target_leads: 5 },
      { month: "11/2026", line: "ecom", planned_budget: 45000000, target_mql: 140, target_revenue: 150000000, notes: "Ra mắt EduNext" },
      { month: "11/2026", line: "ecom", target_leads: 5 },
      { month: "11/2026", line: "vmt", planned_budget: 22500000, target_leads: 60 },
      { month: "11/2026", line: "vmp" },
      { month: "13/2026", line: "b2b", planned_budget: 1 },
    ]);
    const { plan, applied } = await run("plan", buf);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create", "error", "create", "error", "create", "skip", "error"]);
    expect(plan.rows[2].errors.join()).toMatch(/không áp dụng cho từng trung tâm/);
    expect(plan.rows[4].errors.join()).toMatch(/target_leads không áp dụng cho Ecom/);
    expect(applied).toMatchObject({ created: 4, skipped: 1, errors: 3 });
    const sys = (await db.select().from(adsPlans).where(and(eq(adsPlans.line, "b2c_system"), eq(adsPlans.period, "2026-11"))))[0];
    expect(sys).toMatchObject({ plannedBudget: "60000000", targetLeads: "220", targetNewStudents: "35" });
    const vtsPlan = (await db.select().from(adsPlans).where(and(eq(adsPlans.line, "b2c_center"), eq(adsPlans.sbuId, vts))))[0];
    expect(vtsPlan.plannedBudget).toBe("3000000");
    const ecom = (await db.select().from(adsPlans).where(eq(adsPlans.line, "ecom")))[0];
    expect(ecom).toMatchObject({ plannedBudget: "45000000", targetMql: "140", targetRevenue: "150000000", notes: "Ra mắt EduNext" });
    expect((await db.select().from(adsPlans).where(eq(adsPlans.line, "osir")))[0].plannedBudget).toBe("22500000");

    // Nạp lại: chỉ đổi ngân sách Ecom, ô trống (mục tiêu) giữ nguyên, không tạo dòng mới.
    const again = await file("KE_HOACH", headers, [{ month: "11/2026", line: "ecom", planned_budget: 50000000 }]);
    const r2 = await run("plan", again);
    expect(r2.plan.rows[0].action).toBe("update");
    const all = await db.select().from(adsPlans).where(eq(adsPlans.line, "ecom"));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ plannedBudget: "50000000", targetMql: "140" });
  });

  it("THEO REQUEST mở cho mảng khác: không dùng sbu_code, tạo request cấp mảng", async () => {
    const headers = ["month*", "line", "sbu_code", "campaign_name*", "spend*", "planned_budget"];
    const buf = await file("REQUEST", headers, [
      { month: "10/2026", line: "ecom", campaign_name: "EduNext ra mắt", spend: 3000000, planned_budget: 5000000 },
      { month: "10/2026", line: "vmp", sbu_code: "VTS", campaign_name: "Sai", spend: 1 },
      { month: "10/2026", line: "b2c_system", campaign_name: "Sai", spend: 1 },
    ]);
    const { plan } = await run("request", buf);
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "error", "error"]);
    const rows = await db.select().from(adsCampaigns).where(eq(adsCampaigns.line, "ecom"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sbuId: null, plannedBudget: "5000000", spend: "3000000" });
  });

  it("file thiếu sheet → báo lỗi rõ ràng", async () => {
    const buf = await file("SAI_TEN", ["a"], [{ a: 1 }]);
    await expect(planAdsImport(d, "week", buf)).rejects.toThrow(/TUAN/);
  });
});
