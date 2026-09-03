import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { leads, products } from "@/lib/db/schema";
import { addDaysStr, todayVnDayStr, vnDayBoundsUtc } from "@/lib/time";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";

export interface ProductConfigRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  listPrice: number | null;
  cacRoomPct: number;
  targetCpmql: number;
  killThresholdNoMql: number;
  budgetSharePct: number | null;
  priority: number | null;
  /** SPEC Mục 9.5 — ngưỡng suy ra = giá × room CAC% × tỷ lệ MQL→Chốt 90 ngày. */
  crMqlWon90d: number | null;
  suggestedCpmql: number | null;
  mql90d: number;
  won90d: number;
}

export async function listProductConfigs(
  db: AnyDb,
  now = new Date(),
): Promise<ProductConfigRow[]> {
  const rows = await db
    .select()
    .from(products)
    .orderBy(products.sortOrder);

  const to = todayVnDayStr(now);
  const from = addDaysStr(to, -89);
  const [startUtc] = vnDayBoundsUtc(from);
  const [, endUtc] = vnDayBoundsUtc(to);

  const out: ProductConfigRow[] = [];
  for (const p of rows) {
    const [mqlRow] = await db
      .select({ c: sql<number>`count(*)` })
      .from(leads)
      .where(
        and(
          eq(leads.productId, p.id),
          isNull(leads.deletedAt),
          isNull(leads.duplicateOf),
          gte(leads.maxStage, "MQL"),
          gte(leads.mqlAt, startUtc),
          lt(leads.mqlAt, endUtc),
        ),
      );
    const [wonRow] = await db
      .select({ c: sql<number>`count(*)` })
      .from(leads)
      .where(
        and(
          eq(leads.productId, p.id),
          isNull(leads.deletedAt),
          isNull(leads.duplicateOf),
          eq(leads.outcome, "WON"),
          gte(leads.wonAt, startUtc),
          lt(leads.wonAt, endUtc),
        ),
      );
    const mql = Number(mqlRow?.c ?? 0);
    const won = Number(wonRow?.c ?? 0);
    const cr = mql > 0 ? won / mql : null;
    const listPrice = p.listPrice == null ? null : Number(p.listPrice);
    const cacRoom = p.cacRoomPct == null ? 15 : Number(p.cacRoomPct);
    const suggested =
      listPrice != null && cr != null
        ? Math.round(listPrice * (cacRoom / 100) * cr)
        : null;

    out.push({
      id: p.id,
      code: p.code,
      name: p.name,
      isActive: p.isActive,
      listPrice,
      cacRoomPct: cacRoom,
      targetCpmql: Number(p.targetCpmql ?? 600000),
      killThresholdNoMql: Number(p.killThresholdNoMql ?? 900000),
      budgetSharePct: p.budgetSharePct == null ? null : Number(p.budgetSharePct),
      priority: p.priority,
      crMqlWon90d: cr,
      suggestedCpmql: suggested,
      mql90d: mql,
      won90d: won,
    });
  }
  return out;
}

export interface ProductConfigPatch {
  targetCpmql?: number;
  killThresholdNoMql?: number;
  budgetSharePct?: number | null;
  listPrice?: number | null;
  cacRoomPct?: number;
  isActive?: boolean;
  priority?: number | null;
}

export async function updateProductConfig(
  db: AnyDb,
  productId: string,
  patch: ProductConfigPatch,
  actor: Actor,
): Promise<void> {
  if (!["ADMIN", "MANAGER"].includes(actor.role))
    throw new ServiceError("Chỉ ADMIN/MANAGER được sửa cấu hình sản phẩm.", "FORBIDDEN");

  const [before] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!before) throw new ServiceError("Không tìm thấy sản phẩm.", "NOT_FOUND");

  const set: Partial<typeof products.$inferInsert> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (patch.targetCpmql != null && Math.round(patch.targetCpmql) !== Number(before.targetCpmql)) {
    set.targetCpmql = Math.round(patch.targetCpmql);
    changes.target_cpmql = { from: before.targetCpmql, to: set.targetCpmql };
  }
  if (
    patch.killThresholdNoMql != null &&
    Math.round(patch.killThresholdNoMql) !== Number(before.killThresholdNoMql)
  ) {
    set.killThresholdNoMql = Math.round(patch.killThresholdNoMql);
    changes.kill_threshold_no_mql = {
      from: before.killThresholdNoMql,
      to: set.killThresholdNoMql,
    };
  }
  if (patch.budgetSharePct !== undefined) {
    set.budgetSharePct = patch.budgetSharePct == null ? null : String(patch.budgetSharePct);
    changes.budget_share_pct = { from: before.budgetSharePct, to: set.budgetSharePct };
  }
  if (patch.listPrice !== undefined) {
    set.listPrice = patch.listPrice == null ? null : Math.round(patch.listPrice);
    changes.list_price = { from: before.listPrice, to: set.listPrice };
  }
  if (patch.cacRoomPct != null) {
    set.cacRoomPct = String(patch.cacRoomPct);
    changes.cac_room_pct = { from: before.cacRoomPct, to: set.cacRoomPct };
  }
  if (patch.isActive !== undefined && patch.isActive !== before.isActive) {
    set.isActive = patch.isActive;
    changes.is_active = { from: before.isActive, to: patch.isActive };
  }
  if (patch.priority !== undefined) {
    set.priority = patch.priority;
    changes.priority = { from: before.priority, to: patch.priority };
  }

  if (Object.keys(set).length === 0) return;
  await db.update(products).set(set).where(eq(products.id, productId));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "products",
    entityId: productId,
    action: "UPDATE",
    changes,
  });
}
