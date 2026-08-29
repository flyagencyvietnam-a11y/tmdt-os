import { and, eq, isNull } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { campaigns, products } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import { nextCampaignCode } from "./codes";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

export interface CreateCampaignInput {
  displayName: string;
  productId: string;
  channel: "FB" | "GOOGLE" | "TIKTOK" | "KHAC";
  objective?: "MESSAGE" | "LEADFORM" | "TRAFFIC" | "KHAC" | null;
  ownerId: string;
  dailyBudget?: number | null;
  externalId?: string | null;
  startedOn?: string; // YYYY-MM-DD
  notes?: string | null;
}

export async function createCampaign(
  db: AnyDb,
  input: CreateCampaignInput,
  actor: Actor,
): Promise<{ id: string; internalCode: string }> {
  const [product] = await db
    .select({ code: products.code })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!product) throw new ServiceError("Sản phẩm không tồn tại.", "NO_PRODUCT");

  const startedOn = input.startedOn ?? todayVnDayStr();
  const internalCode = await nextCampaignCode(db, {
    productCode: product.code,
    channel: input.channel,
    objective: input.objective ?? null,
    startedOn,
  });

  const [row] = await db
    .insert(campaigns)
    .values({
      internalCode,
      displayName: input.displayName.trim(),
      externalId: input.externalId?.trim() || null,
      productId: input.productId,
      channel: input.channel,
      objective: input.objective ?? null,
      ownerId: input.ownerId,
      status: "ON",
      dailyBudget: input.dailyBudget ?? null,
      startedOn,
      notes: input.notes?.trim() || null,
      createdBy: actor.id,
      updatedBy: actor.id,
    })
    .returning({ id: campaigns.id, internalCode: campaigns.internalCode });

  await writeAudit(db, {
    actorId: actor.id,
    entity: "campaigns",
    entityId: row.id,
    action: "CREATE",
    changes: {
      internal_code: { from: null, to: internalCode },
      status: { from: null, to: "ON" },
    },
  });

  return row;
}

/**
 * Bật/tắt/tạm dừng campaign — SPEC Mục 7.3.
 * Khi -> OFF: ghi ended_on = hôm nay và bắt buộc lý do (audit).
 */
export async function setCampaignStatus(
  db: AnyDb,
  id: string,
  status: "ON" | "OFF" | "PAUSED",
  actor: Actor,
  reason?: string,
): Promise<void> {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt)))
    .limit(1);
  if (!c) throw new ServiceError("Không tìm thấy campaign.", "NOT_FOUND");
  if (c.status === status) return;

  if (status === "OFF" && !reason?.trim()) {
    throw new ServiceError("Tắt campaign phải kèm lý do (SPEC 7.3).", "NEED_REASON");
  }

  const set: Partial<typeof campaigns.$inferInsert> = {
    status,
    updatedBy: actor.id,
  };
  if (status === "OFF") set.endedOn = todayVnDayStr();
  if (status === "ON" && c.endedOn) set.endedOn = null;

  await db.update(campaigns).set(set).where(eq(campaigns.id, id));

  await writeAudit(db, {
    actorId: actor.id,
    entity: "campaigns",
    entityId: id,
    action: "UPDATE",
    changes: {
      status: { from: c.status, to: status },
      ...(reason ? { reason: { from: null, to: reason } } : {}),
    },
  });
}
