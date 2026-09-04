import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import {
  auditLogs,
  campaigns,
  enrollments,
  holidays,
  leadInteractions,
  leadStageHistory,
  leads,
  products,
  users,
} from "@/lib/db/schema";
import { findDuplicates } from "./dedup";
import { createEnrollment } from "./enrollments";
import { nextSilenceCount, suggestNextContactDate } from "./escalate";
import { recordInteraction } from "./interactions";
import { createLead, updateLead } from "./leads";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db;
const ACTOR = { id: "11111111-1111-1111-1111-111111111111", role: "EC" };
const PROD = "22222222-2222-2222-2222-222222222222";
const PROD2 = "22222222-2222-2222-2222-222222222223";
const CAMP = "33333333-3333-3333-3333-333333333333";

beforeAll(async () => {
  ctx = await makeTestDb();
  await db().insert(users).values({
    id: ACTOR.id,
    email: "ec@test",
    passwordHash: "x",
    fullName: "EC",
    jobTitle: "EC",
    role: "EC",
  });
  await db().insert(products).values([
    { id: PROD, code: "TESOL", name: "TESOL" },
    { id: PROD2, code: "IE", name: "IE" },
  ]);
  await db().insert(campaigns).values({
    id: CAMP,
    internalCode: "TESOL-FB-MSG-2608-01",
    displayName: "c",
    productId: PROD,
    channel: "FB",
    ownerId: ACTOR.id,
    status: "ON",
    startedOn: "2026-08-01",
  });
  // Chủ nhật 2026-08-30, ngày lễ 2026-09-02
  await db().insert(holidays).values({ holidayDate: "2026-09-02", name: "Quốc khánh" });
});

afterAll(async () => {
  await ctx.pg.close();
});

beforeEach(async () => {
  await db().delete(auditLogs);
  await db().delete(enrollments);
  await db().delete(leadInteractions);
  await db().delete(leadStageHistory);
  await db().delete(leads);
});

describe("createLead", () => {
  it("V05: nguồn ORGANIC + campaign_id -> chặn", async () => {
    await expect(
      createLead(
        db(),
        { fullName: "A", productId: PROD, source: "ORGANIC", campaignId: CAMP },
        ACTOR,
      ),
    ).rejects.toThrow(/V05/);
  });

  it("V07: stage != NEW mà thiếu assigned_to -> chặn", async () => {
    await expect(
      createLead(
        db(),
        { fullName: "B", productId: PROD, source: "FB", stage: "MQL" },
        ACTOR,
      ),
    ).rejects.toThrow(/V07/);
  });

  it("V01: stage != NEW + đã giao mà thiếu Ngày LH lại -> chặn", async () => {
    await expect(
      createLead(
        db(),
        {
          fullName: "A1",
          productId: PROD,
          source: "FB",
          stage: "MQL",
          assignedTo: ACTOR.id,
        },
        ACTOR,
      ),
    ).rejects.toThrow(/V01/);
  });

  it("tạo lead MQL -> mql_at được set, code dạng L-YYMM-NNNN", async () => {
    const { code, id } = await createLead(
      db(),
      {
        fullName: "Chị Hoa",
        productId: PROD,
        source: "FB",
        campaignId: CAMP,
        stage: "MQL",
        assignedTo: ACTOR.id,
        nextContactDate: "2026-08-18",
        receivedAt: new Date("2026-08-15T03:00:00Z"),
      },
      ACTOR,
    );
    expect(code).toMatch(/^L-2608-\d{4}$/);
    const [row] = await db().select().from(leads).where(eq(leads.id, id));
    expect(row.mqlAt).not.toBeNull();
    expect(row.maxStage).toBe("MQL");
    expect(row.nameNormalized).toBe("hoa");
  });
});

describe("updateLead — máy trạng thái", () => {
  it("T01: MQL -> hạ về CONSULTING giữ max_stage=MQL và mql_at", async () => {
    const { id } = await createLead(
      db(),
      { fullName: "C", productId: PROD, source: "FB", stage: "MQL", assignedTo: ACTOR.id, nextContactDate: "2026-08-20" },
      ACTOR,
    );
    const [m1] = await db().select().from(leads).where(eq(leads.id, id));
    await updateLead(db(), id, { stage: "CONSULTING", reason: "khách nguội" }, ACTOR);
    const [m2] = await db().select().from(leads).where(eq(leads.id, id));
    expect(m2.stage).toBe("CONSULTING");
    expect(m2.maxStage).toBe("MQL");
    expect(m2.mqlAt).toEqual(m1.mqlAt);
  });

  it("hạ giai đoạn không kèm lý do -> chặn", async () => {
    const { id } = await createLead(
      db(),
      { fullName: "D", productId: PROD, source: "FB", stage: "SQL", assignedTo: ACTOR.id, nextContactDate: "2026-08-20" },
      ACTOR,
    );
    await expect(
      updateLead(db(), id, { stage: "MQL" }, ACTOR),
    ).rejects.toThrow(/lý do/);
  });

  it("V03: outcome LOST cần lost_reason >= 10 ký tự; tự đặt +45 ngày", async () => {
    const { id } = await createLead(
      db(),
      {
        fullName: "E",
        productId: PROD,
        source: "FB",
        stage: "MQL",
        assignedTo: ACTOR.id,
        nextContactDate: "2026-08-20",
      },
      ACTOR,
    );
    await expect(
      updateLead(db(), id, { outcome: "LOST", lostReason: "ngắn" }, ACTOR),
    ).rejects.toThrow(/V03/);

    await updateLead(
      db(),
      id,
      { outcome: "LOST", lostReason: "Giá cao hơn ngân sách gia đình" },
      ACTOR,
    );
    const [row] = await db().select().from(leads).where(eq(leads.id, id));
    expect(row.outcome).toBe("LOST");
    expect(row.nextContactDate).not.toBeNull(); // remarketing +45
  });

  it("V04: không cho đặt stage/outcome = WON trực tiếp", async () => {
    const { id } = await createLead(
      db(),
      { fullName: "F", productId: PROD, source: "FB", stage: "SQL", assignedTo: ACTOR.id, nextContactDate: "2026-08-20" },
      ACTOR,
    );
    await expect(updateLead(db(), id, { stage: "WON" }, ACTOR)).rejects.toThrow(/V04/);
  });
});

describe("escalate (SPEC 8.2)", () => {
  it("nextSilenceCount theo kết quả", () => {
    expect(nextSilenceCount(2, "NO_RESPONSE")).toBe(3);
    expect(nextSilenceCount(3, "RESPONDED")).toBe(0);
    expect(nextSilenceCount(3, "RESCHEDULED")).toBe(0);
    expect(nextSilenceCount(3, "REFUSED")).toBe(3);
  });

  it("suggestNextContactDate: 0->T+3, 1->T+1, 2->T+3, 3->T+7; >=5 -> null", async () => {
    expect(await suggestNextContactDate(db(), 0, "2026-08-10")).toBe("2026-08-13");
    expect(await suggestNextContactDate(db(), 1, "2026-08-10")).toBe("2026-08-11");
    expect(await suggestNextContactDate(db(), 2, "2026-08-10")).toBe("2026-08-13");
    expect(await suggestNextContactDate(db(), 3, "2026-08-10")).toBe("2026-08-17");
    expect(await suggestNextContactDate(db(), 4, "2026-08-10")).toBe("2026-09-09");
    expect(await suggestNextContactDate(db(), 5, "2026-08-10")).toBeNull();
  });

  it("đẩy khỏi Chủ nhật: silence=2 (T+3) của 2026-08-27 -> qua CN 30/8 -> 2026-08-31", async () => {
    expect(await suggestNextContactDate(db(), 2, "2026-08-27")).toBe("2026-08-31");
  });

  it("recordInteraction NO_RESPONSE x5 -> Cold Data, outcome LOST", async () => {
    const { id } = await createLead(
      db(),
      {
        fullName: "G",
        productId: PROD,
        source: "FB",
        stage: "MQL",
        assignedTo: ACTOR.id,
        nextContactDate: "2026-08-10",
      },
      ACTOR,
    );
    let res;
    for (let i = 0; i < 5; i++) {
      res = await recordInteraction(
        db(),
        { leadId: id, channel: "CALL", direction: "OUTBOUND", result: "NO_RESPONSE" },
        ACTOR,
      );
    }
    expect(res!.becameCold).toBe(true);
    const [row] = await db().select().from(leads).where(eq(leads.id, id));
    expect(row.isCold).toBe(true);
    expect(row.outcome).toBe("LOST");
    expect(row.silenceCount).toBe(5);
  });

  it("lead đã Cold, khách phản hồi lại -> gỡ Cold, outcome về OPEN, có Ngày LH lại", async () => {
    const { id } = await createLead(
      db(),
      {
        fullName: "G2",
        productId: PROD,
        source: "FB",
        stage: "MQL",
        assignedTo: ACTOR.id,
        nextContactDate: "2026-08-10",
      },
      ACTOR,
    );
    for (let i = 0; i < 5; i++)
      await recordInteraction(
        db(),
        { leadId: id, channel: "CALL", direction: "OUTBOUND", result: "NO_RESPONSE" },
        ACTOR,
      );
    const res = await recordInteraction(
      db(),
      { leadId: id, channel: "ZALO", direction: "INBOUND", result: "RESPONDED" },
      ACTOR,
    );
    expect(res.becameCold).toBe(false);
    const [row] = await db().select().from(leads).where(eq(leads.id, id));
    expect(row.isCold).toBe(false);
    expect(row.outcome).toBe("OPEN");
    expect(row.silenceCount).toBe(0);
    expect(row.nextContactDate).not.toBeNull();
  });

  it("sửa Ngày LH lại đề xuất mà thiếu lý do -> chặn", async () => {
    const { id } = await createLead(
      db(),
      { fullName: "H", productId: PROD, source: "FB", stage: "MQL", assignedTo: ACTOR.id, nextContactDate: "2026-08-10" },
      ACTOR,
    );
    await expect(
      recordInteraction(
        db(),
        {
          leadId: id,
          channel: "CALL",
          direction: "OUTBOUND",
          result: "NO_RESPONSE",
          nextContactDateOverride: "2026-09-15",
        },
        ACTOR,
      ),
    ).rejects.toThrow(/lý do/);
  });
});

describe("createEnrollment", () => {
  it("enrollment đầu tiên -> lead WON + won_at = contract_date", async () => {
    const { id } = await createLead(
      db(),
      { fullName: "I", productId: PROD, source: "FB", stage: "SQL", assignedTo: ACTOR.id, nextContactDate: "2026-08-20" },
      ACTOR,
    );
    const r = await createEnrollment(
      db(),
      { leadId: id, productId: PROD, contractDate: "2026-08-22", grossAmount: 10_000_000, collectedAmount: 10_000_000 },
      ACTOR,
    );
    expect(r.leadBecameWon).toBe(true);
    const [row] = await db().select().from(leads).where(eq(leads.id, id));
    expect(row.outcome).toBe("WON");
    expect(row.stage).toBe("WON");
    expect(row.wonAt).not.toBeNull();
  });

  it("V11: collected > net -> chặn", async () => {
    const { id } = await createLead(
      db(),
      { fullName: "J", productId: PROD, source: "FB", stage: "SQL", assignedTo: ACTOR.id, nextContactDate: "2026-08-20" },
      ACTOR,
    );
    await expect(
      createEnrollment(
        db(),
        { leadId: id, productId: PROD, contractDate: "2026-08-22", grossAmount: 5_000_000, collectedAmount: 6_000_000 },
        ACTOR,
      ),
    ).rejects.toThrow(/V11/);
  });
});

describe("dedup (SPEC 8.3)", () => {
  it("trùng SĐT -> level red", async () => {
    await createLead(
      db(),
      { fullName: "Nguyễn Văn Khoa", phone: "0912345678", productId: PROD, source: "FB", campaignId: CAMP },
      ACTOR,
    );
    const res = await findDuplicates(db(), {
      fullName: "Khoa NV",
      phone: "+84912345678",
      productId: PROD,
    });
    expect(res.level).toBe("red");
    expect(res.candidates[0].reasons).toContain("Trùng số điện thoại");
  });

  it("tên khác hẳn, khác mọi thứ -> none", async () => {
    await createLead(
      db(),
      { fullName: "Trần Thị Lan", phone: "0900000001", productId: PROD, source: "FB", campaignId: CAMP },
      ACTOR,
    );
    const res = await findDuplicates(db(), { fullName: "Phạm Hùng", phone: "0900000999" });
    expect(res.level).toBe("none");
  });
});
