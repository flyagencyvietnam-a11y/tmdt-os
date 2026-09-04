/**
 * Đối chiếu bản GOM NHÓM (getBaseMetricsGrouped / getTrendSeries) với bản gốc
 * (gọi getBaseMetrics cho từng id). Hai bên PHẢI ra cùng số — đây là chốt chặn
 * để bản gộp không "trôi" khỏi nguồn công thức duy nhất.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import {
  campaignDailyMetrics,
  campaigns,
  enrollments,
  leads,
  otherCosts,
  products,
  users,
} from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";
import {
  getBaseMetrics,
  getBaseMetricsGrouped,
  getOpsDiscipline,
  getOpsDisciplineGrouped,
  getTrendSeries,
  type BaseMetrics,
  type MetricsFilter,
} from "./metrics";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db;

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "11111111-1111-1111-1111-111111111112";
const P1 = "22222222-2222-2222-2222-222222222221";
const P2 = "22222222-2222-2222-2222-222222222222";
const C1 = "33333333-3333-3333-3333-333333333331";
const C2 = "33333333-3333-3333-3333-333333333332";

beforeAll(async () => {
  ctx = await makeTestDb();

  await db().insert(users).values([
    { id: U1, email: "u1@vmg.local", passwordHash: "x", fullName: "EC Một", jobTitle: "EC", role: "EC" },
    { id: U2, email: "u2@vmg.local", passwordHash: "x", fullName: "EC Hai", jobTitle: "EC", role: "EC" },
  ]);
  await db().insert(products).values([
    { id: P1, code: "FT15", name: "Fast Track 1.5", targetCpmql: 600000, killThresholdNoMql: 900000 },
    { id: P2, code: "IE", name: "IELTS Express", targetCpmql: 500000, killThresholdNoMql: 800000 },
  ]);
  await db().insert(campaigns).values([
    { id: C1, internalCode: "FT15-FB-01", displayName: "FT15 T6", productId: P1, channel: "FB", ownerId: U1, status: "ON", startedOn: "2026-06-01" },
    { id: C2, internalCode: "IE-GG-01", displayName: "IE T6", productId: P2, channel: "GOOGLE", ownerId: U2, status: "ON", startedOn: "2026-06-01" },
  ]);

  await db().insert(campaignDailyMetrics).values([
    { campaignId: C1, metricDate: "2026-06-03", spend: 1_000_000, messages: 12, enteredBy: U1 },
    { campaignId: C1, metricDate: "2026-06-11", spend: 1_500_000, messages: 8, enteredBy: U1 },
    { campaignId: C1, metricDate: "2026-06-20", spend: 800_000, messages: 5, enteredBy: U1 },
    { campaignId: C2, metricDate: "2026-06-05", spend: 2_000_000, messages: 20, enteredBy: U2 },
    { campaignId: C2, metricDate: "2026-06-19", spend: 900_000, messages: 7, enteredBy: U2 },
  ]);

  // Leads — trải trên 2 sản phẩm / 2 campaign / 2 người, nhiều mốc thời gian.
  await db().insert(leads).values([
    // P1/C1/U1: MQL 12/6, SQL 18/6, WON 25/6
    { id: "a0000000-0000-0000-0000-000000000001", code: "L-2606-0001", receivedAt: new Date("2026-06-05T03:00:00Z"), fullName: "A", productId: P1, source: "FB", campaignId: C1, assignedTo: U1, stage: "WON", maxStage: "WON", outcome: "WON", mqlAt: new Date("2026-06-12T02:00:00Z"), sqlAt: new Date("2026-06-18T02:00:00Z"), wonAt: new Date("2026-06-25T02:00:00Z") },
    // P1/C1/U1: MQL 15/6 rồi LOST — vẫn đếm MQL
    { id: "a0000000-0000-0000-0000-000000000002", code: "L-2606-0002", receivedAt: new Date("2026-06-08T03:00:00Z"), fullName: "B", productId: P1, source: "FB", campaignId: C1, assignedTo: U1, stage: "CONSULTING", maxStage: "MQL", outcome: "LOST", lostReason: "Ngân sách gia đình chưa sẵn sàng", mqlAt: new Date("2026-06-15T02:00:00Z") },
    // P2/C2/U2: MQL 20/6, SQL 28/6
    { id: "a0000000-0000-0000-0000-000000000003", code: "L-2606-0003", receivedAt: new Date("2026-06-10T03:00:00Z"), fullName: "C", productId: P2, source: "GOOGLE", campaignId: C2, assignedTo: U2, stage: "SQL", maxStage: "SQL", outcome: "OPEN", nextContactDate: "2026-06-30", mqlAt: new Date("2026-06-20T02:00:00Z"), sqlAt: new Date("2026-06-28T02:00:00Z") },
    // P2/C2/U2: received sớm 1/1, MQL 20/6 -> gap > 90 ngày (test cửa sổ quy kết campaign)
    { id: "a0000000-0000-0000-0000-000000000004", code: "L-2601-0004", receivedAt: new Date("2026-01-01T03:00:00Z"), fullName: "D", productId: P2, source: "GOOGLE", campaignId: C2, assignedTo: U2, stage: "MQL", maxStage: "MQL", outcome: "OPEN", nextContactDate: "2026-06-15", mqlAt: new Date("2026-06-20T02:00:00Z") },
    // P1/C1/U2 (người chốt khác người nhận): WON 27/6
    { id: "a0000000-0000-0000-0000-000000000005", code: "L-2606-0005", receivedAt: new Date("2026-06-12T03:00:00Z"), fullName: "E", productId: P1, source: "FB", campaignId: C1, assignedTo: U2, stage: "WON", maxStage: "WON", outcome: "WON", mqlAt: new Date("2026-06-18T02:00:00Z"), sqlAt: new Date("2026-06-22T02:00:00Z"), wonAt: new Date("2026-06-27T02:00:00Z") },
    // ngoài kỳ (tháng 7) — không được đếm vào tháng 6
    { id: "a0000000-0000-0000-0000-000000000006", code: "L-2607-0006", receivedAt: new Date("2026-07-02T03:00:00Z"), fullName: "F", productId: P2, source: "GOOGLE", campaignId: C2, assignedTo: U2, stage: "MQL", maxStage: "MQL", outcome: "OPEN", nextContactDate: "2026-07-20", mqlAt: new Date("2026-07-10T02:00:00Z") },
  ]);

  await db().insert(enrollments).values([
    // A: P1, người chốt U1
    { leadId: "a0000000-0000-0000-0000-000000000001", productId: P1, contractDate: "2026-06-25", grossAmount: 12_000_000, discountAmount: 2_000_000, collectedAmount: 8_000_000, studentCount: 1, creditedTo: U1 },
    // E: P1, người chốt U2
    { leadId: "a0000000-0000-0000-0000-000000000005", productId: P1, contractDate: "2026-06-27", grossAmount: 10_000_000, discountAmount: 0, collectedAmount: 10_000_000, studentCount: 2, creditedTo: U2 },
  ]);

  await db().insert(otherCosts).values([
    { costType: "KOL_KOC", incurredOn: "2026-06-10", productId: P1, amount: 3_000_000 },
    { costType: "KOL_KOC", incurredOn: "2026-06-15", productId: P2, amount: 1_500_000 },
    { costType: "KOL_KOC", incurredOn: "2026-07-01", productId: P1, amount: 9_000_000 }, // ngoài kỳ
  ]);
});

afterAll(async () => {
  await ctx.pg.close();
});

const JUNE: MetricsFilter = { from: "2026-06-01", to: "2026-06-30" };

function pick(m: BaseMetrics, keys: (keyof BaseMetrics)[]) {
  return Object.fromEntries(keys.map((k) => [k, m[k]]));
}

const ALL: (keyof BaseMetrics)[] = [
  "spend", "leads", "leadsRecorded", "mql", "sql", "won",
  "hvm", "revenueGross", "revenueNet", "cashCollected", "kolCost",
];
const NO_SPEND_KOL = ALL.filter((k) => !["spend", "leads", "kolCost"].includes(k));
const NO_KOL = ALL.filter((k) => k !== "kolCost");

const ZERO: BaseMetrics = {
  spend: 0, leads: 0, leadsRecorded: 0, mql: 0, sql: 0, won: 0,
  hvm: 0, revenueGross: 0, revenueNet: 0, cashCollected: 0, kolCost: 0,
};

describe("getBaseMetricsGrouped == vòng lặp getBaseMetrics", () => {
  it("chiều product (mọi chỉ số, kể cả KOL)", async () => {
    const g = await getBaseMetricsGrouped(db(), JUNE, "product");
    for (const pid of [P1, P2]) {
      const ref = await getBaseMetrics(db(), { ...JUNE, productIds: [pid] });
      expect(pick(g.get(pid) ?? ZERO, ALL)).toEqual(pick(ref, ALL));
    }
  });

  it("chiều campaign + cửa sổ quy kết 90 ngày", async () => {
    const f = { ...JUNE, campaignAttribution: true };
    const g = await getBaseMetricsGrouped(db(), f, "campaign");
    for (const cid of [C1, C2]) {
      const ref = await getBaseMetrics(db(), { ...f, campaignIds: [cid] });
      expect(pick(g.get(cid) ?? ZERO, NO_KOL)).toEqual(pick(ref, NO_KOL));
    }
    // Lead D (gap > 90 ngày) bị loại khỏi MQL của C2
    expect((g.get(C2) ?? ZERO).mql).toBe(1);
  });

  it("chiều assignee (doanh thu theo người chốt)", async () => {
    const g = await getBaseMetricsGrouped(db(), JUNE, "assignee");
    for (const uid of [U1, U2]) {
      const ref = await getBaseMetrics(db(), { ...JUNE, assignedTo: [uid] });
      expect(pick(g.get(uid) ?? ZERO, NO_SPEND_KOL)).toEqual(
        pick(ref, NO_SPEND_KOL),
      );
    }
    // U2 chốt lead E (2 HV, 10tr) dù U1 là người nhận lead A
    expect((g.get(U2) ?? ZERO).hvm).toBe(2);
    expect((g.get(U1) ?? ZERO).hvm).toBe(1);
  });

  it("lọc thêm (channels) vẫn khớp", async () => {
    const f: MetricsFilter = { ...JUNE, channels: ["FB"] };
    const g = await getBaseMetricsGrouped(db(), f, "product");
    for (const pid of [P1, P2]) {
      const ref = await getBaseMetrics(db(), { ...f, productIds: [pid] });
      expect(pick(g.get(pid) ?? ZERO, ALL)).toEqual(pick(ref, ALL));
    }
  });
});

describe("getOpsDisciplineGrouped == getOpsDiscipline theo người", () => {
  it("overdueRate / firstResponseRate khớp getOpsDiscipline", async () => {
    const g = await getOpsDisciplineGrouped(db(), { from: JUNE.from, to: JUNE.to });
    for (const uid of [U1, U2]) {
      const ref = await getOpsDiscipline(db(), {
        assignedTo: [uid],
        from: JUNE.from,
        to: JUNE.to,
      });
      const row = g.get(uid) ?? {
        leadsAssigned: 0,
        overdueRate: null,
        firstResponseRate: null,
      };
      expect(row.overdueRate).toEqual(ref.overdueRate);
      expect(row.firstResponseRate).toEqual(ref.firstResponseRate);
    }
  });

  it("leadsAssigned = lead nhận trong kỳ theo người", async () => {
    const g = await getOpsDisciplineGrouped(db(), { from: JUNE.from, to: JUNE.to });
    expect(g.get(U1)?.leadsAssigned).toBe(2); // A, B
    expect(g.get(U2)?.leadsAssigned).toBe(2); // C, E (D nhận 1/1 ngoài kỳ)
  });
});

describe("getTrendSeries == vòng lặp getBaseMetrics theo tuần", () => {
  it("spend/mql/won mỗi tuần khớp", async () => {
    // 5 tuần bắt đầu Thứ 7: 31/5, 7/6, 14/6, 21/6, 28/6
    const weekStarts = ["2026-05-30", "2026-06-06", "2026-06-13", "2026-06-20", "2026-06-27"];
    const series = await getTrendSeries(db(), weekStarts, {});
    for (let i = 0; i < weekStarts.length; i++) {
      const ws = weekStarts[i];
      const ref = await getBaseMetrics(db(), { from: ws, to: addDaysStr(ws, 6) });
      expect({ spend: series[i].spend, mql: series[i].mql, won: series[i].won }).toEqual({
        spend: ref.spend,
        mql: ref.mql,
        won: ref.won,
      });
    }
  });
});
