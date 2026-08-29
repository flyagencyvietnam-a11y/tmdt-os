import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import {
  campaignDailyMetrics,
  campaigns,
  enrollments,
  leads,
  products,
  users,
} from "@/lib/db/schema";
import {
  deriveMetrics,
  evaluateCampaignAlerts,
  getBaseMetrics,
  getOpsDiscipline,
  isDataImmature,
  safeDiv,
} from "./metrics";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db;

const USER = "11111111-1111-1111-1111-111111111111";
const PROD = "22222222-2222-2222-2222-222222222222";
const CAMP = "33333333-3333-3333-3333-333333333333";

beforeAll(async () => {
  ctx = await makeTestDb();

  await db().insert(users).values({
    id: USER,
    email: "ec@vmg.local",
    passwordHash: "x",
    fullName: "EC Test",
    jobTitle: "E-Commerce Executive",
    role: "EC",
  });
  await db().insert(products).values({
    id: PROD,
    code: "TESOL",
    name: "TESOL E-PATH",
    targetCpmql: 600000,
    killThresholdNoMql: 900000,
  });
  await db().insert(campaigns).values({
    id: CAMP,
    internalCode: "TESOL-FB-MSG-2606-01",
    displayName: "TESOL tháng 6",
    productId: PROD,
    channel: "FB",
    ownerId: USER,
    status: "ON",
    startedOn: "2026-06-01",
  });

  // spend/messages nhập tay: 3 ngày, tổng spend 3.000.000, messages 30
  await db().insert(campaignDailyMetrics).values([
    { campaignId: CAMP, metricDate: "2026-06-10", spend: 1_000_000, messages: 10, enteredBy: USER },
    { campaignId: CAMP, metricDate: "2026-06-11", spend: 1_000_000, messages: 10, enteredBy: USER },
    { campaignId: CAMP, metricDate: "2026-06-12", spend: 1_000_000, messages: 10, enteredBy: USER },
  ]);

  // Lead A: lên MQL 12/6 rồi LOST 20/6 -> vẫn phải đếm vào MQL tháng 6 (SPEC 4.3, T01)
  await db().insert(leads).values({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    code: "L-2606-0001",
    receivedAt: new Date("2026-06-05T03:00:00Z"),
    fullName: "Lead A",
    productId: PROD,
    source: "FB",
    campaignId: CAMP,
    stage: "CONSULTING",
    maxStage: "MQL",
    outcome: "LOST",
    lostReason: "Giá cao so với ngân sách gia đình",
    assignedTo: USER,
    mqlAt: new Date("2026-06-12T02:00:00Z"),
  });

  // Lead B: MQL 15/6, SQL 18/6, WON 25/6 (có enrollment)
  await db().insert(leads).values({
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    code: "L-2606-0002",
    receivedAt: new Date("2026-06-08T03:00:00Z"),
    fullName: "Lead B",
    productId: PROD,
    source: "FB",
    campaignId: CAMP,
    stage: "WON",
    maxStage: "WON",
    outcome: "WON",
    assignedTo: USER,
    mqlAt: new Date("2026-06-15T02:00:00Z"),
    sqlAt: new Date("2026-06-18T02:00:00Z"),
    wonAt: new Date("2026-06-25T02:00:00Z"),
  });
  await db().insert(enrollments).values({
    leadId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    productId: PROD,
    contractDate: "2026-06-25",
    grossAmount: 10_000_000,
    discountAmount: 0,
    collectedAmount: 10_000_000,
    studentCount: 1,
    creditedTo: USER,
  });

  // Lead C: received rất sớm (1/1), mql_at 20/6 -> gap > 90 ngày.
  await db().insert(leads).values({
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    code: "L-2601-0003",
    receivedAt: new Date("2026-01-01T03:00:00Z"),
    fullName: "Lead C",
    productId: PROD,
    source: "FB",
    campaignId: CAMP,
    stage: "MQL",
    maxStage: "MQL",
    outcome: "OPEN",
    assignedTo: USER,
    nextContactDate: "2026-06-13",
    mqlAt: new Date("2026-06-20T02:00:00Z"),
  });
});

afterAll(async () => {
  await ctx.pg.close();
});

const JUNE = { from: "2026-06-01", to: "2026-06-30" } as const;

describe("safeDiv", () => {
  it("chia 0 trả null, không trả 0", () => {
    expect(safeDiv(5, 0)).toBeNull();
    expect(safeDiv(0, 0)).toBeNull();
    expect(safeDiv(10, 2)).toBe(5);
  });
});

describe("getBaseMetrics", () => {
  it("leads = tổng messages nhập tay, KHÁC số bản ghi lead", async () => {
    const b = await getBaseMetrics(db(), { ...JUNE });
    expect(b.spend).toBe(3_000_000);
    expect(b.leads).toBe(30); // messages nhập tay
    expect(b.leadsRecorded).toBe(2); // A và B received trong tháng 6 (C nhận 1/1)
  });

  it("MQL đếm theo max_stage: lead MQL->LOST vẫn tính (T01)", async () => {
    const b = await getBaseMetrics(db(), { ...JUNE });
    // A (MQL,LOST) + B (WON) + C (MQL) = 3
    expect(b.mql).toBe(3);
    expect(b.sql).toBe(1); // chỉ B
    expect(b.won).toBe(1); // chỉ B
  });

  it("cửa sổ quy kết 90 ngày loại Lead C khỏi chỉ số campaign", async () => {
    const withAttr = await getBaseMetrics(db(), {
      ...JUNE,
      campaignIds: [CAMP],
      campaignAttribution: true,
    });
    expect(withAttr.mql).toBe(2); // C bị loại (gap > 90 ngày)

    const noAttr = await getBaseMetrics(db(), { ...JUNE, campaignIds: [CAMP] });
    expect(noAttr.mql).toBe(3);
  });

  it("doanh thu & HVM theo contract_date", async () => {
    const b = await getBaseMetrics(db(), { ...JUNE });
    expect(b.revenueGross).toBe(10_000_000);
    expect(b.revenueNet).toBe(10_000_000);
    expect(b.cashCollected).toBe(10_000_000);
    expect(b.hvm).toBe(1);
  });
});

describe("deriveMetrics", () => {
  it("CPMQL = spend / mql; CAC = spend / won", async () => {
    const b = await getBaseMetrics(db(), { ...JUNE });
    const d = deriveMetrics(b);
    expect(d.cpmql).toBe(3_000_000 / 3);
    expect(d.cac).toBe(3_000_000 / 1);
    expect(d.roas).toBe(10_000_000 / 3_000_000);
  });

  it("chia 0 -> null (ví dụ kỳ không có won)", () => {
    const d = deriveMetrics({
      spend: 500_000,
      leads: 0,
      leadsRecorded: 0,
      mql: 0,
      sql: 0,
      won: 0,
      hvm: 0,
      revenueGross: 0,
      revenueNet: 0,
      cashCollected: 0,
      kolCost: 0,
    });
    expect(d.cpl).toBeNull();
    expect(d.cpmql).toBeNull();
    expect(d.cac).toBeNull();
    expect(d.revenueAfterMkt).toBe(-500_000);
  });
});

describe("isDataImmature", () => {
  it("kỳ kết thúc trong 7 ngày gần đây => chưa chín", () => {
    const now = new Date("2026-06-15T10:00:00+07:00");
    expect(isDataImmature("2026-06-14", now)).toBe(true);
    expect(isDataImmature("2026-06-01", now)).toBe(false);
  });
});

describe("getOpsDiscipline", () => {
  it("đếm lead quá hạn theo Ngày LH lại < hôm nay", async () => {
    // 'hôm nay' cố định = 2026-06-30; Lead C có next_contact_date 2026-06-13 (OPEN)
    const ops = await getOpsDiscipline(db(), {
      now: new Date("2026-06-30T10:00:00+07:00"),
    });
    expect(ops.openLeads).toBe(1); // chỉ C còn OPEN
    expect(ops.overdueLeads).toBe(1);
    expect(ops.overdueRate).toBe(1);
  });
});

describe("evaluateCampaignAlerts", () => {
  it("R3 khi CPMQL rolling > target", async () => {
    // rolling 14 ngày tính tới 2026-06-13: spend gồm 10-12/6 = 3.000.000,
    // mql trong cửa sổ (mql_at 10-13/6, gap<=90) = chỉ Lead A -> CPMQL = 3.000.000 > 600.000
    const alerts = await evaluateCampaignAlerts(
      db(),
      new Date("2026-06-13T10:00:00+07:00"),
    );
    const rules = alerts.map((a) => a.rule);
    expect(rules).toContain("R2"); // 3.000.000 > 1,5 * 600.000 -> thực ra R2
  });
});
