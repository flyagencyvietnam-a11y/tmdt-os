import { desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { adsMonthly, type AdsMonthly } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";

/** SPEC Mục 9.4 — CPL tính tại truy vấn, không lưu cột (chi tiêu thực tế / lead thực tế). */
export function computeCpl(row: Pick<AdsMonthly, "actualSpend" | "actualLeads">): number | null {
  const spend = row.actualSpend ? Number(row.actualSpend) : 0;
  const leads = row.actualLeads ? Number(row.actualLeads) : 0;
  if (!leads) return null;
  return Math.round(spend / leads);
}

export async function listAdsMonthly(db: DB, period?: string) {
  const rows = await db
    .select()
    .from(adsMonthly)
    .where(period ? eq(adsMonthly.period, period) : undefined)
    .orderBy(desc(adsMonthly.period));
  return rows.map((r) => ({ ...r, cpl: computeCpl(r) }));
}

export interface UpsertAdsMonthlyInput {
  id?: string;
  period: string;
  sbuId: string;
  product?: string | null;
  channel?: string | null;
  objective?: string | null;
  centerBudget?: string | null;
  hoBudget?: string | null;
  actualSpend?: string | null;
  actualLeads?: string | null;
  misaOrderCode?: string | null;
  status?: AdsMonthly["status"];
  reportUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export async function upsertAdsMonthly(db: DB, input: UpsertAdsMonthlyInput, actorId: string | null) {
  if (input.id) {
    const [row] = await db
      .update(adsMonthly)
      .set({ ...input, updatedBy: actorId })
      .where(eq(adsMonthly.id, input.id))
      .returning();
    await writeAudit(db, { actorId, entity: "ads_monthly", entityId: row.id, action: "UPDATE" });
    return row;
  }
  const [row] = await db
    .insert(adsMonthly)
    .values({ ...input, createdBy: actorId })
    .returning();
  await writeAudit(db, { actorId, entity: "ads_monthly", entityId: row.id, action: "CREATE" });
  return row;
}

export async function deleteAdsMonthly(db: DB, id: string, actorId: string | null) {
  await db.delete(adsMonthly).where(eq(adsMonthly.id, id));
  await writeAudit(db, { actorId, entity: "ads_monthly", entityId: id, action: "DELETE" });
}
