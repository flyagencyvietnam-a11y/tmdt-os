import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { adsCampaigns, adsDisbursementPlan, adsMetrics, appSettings, type AdsCampaign, type AdsMetric } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { computeAdsDerived, DEFAULT_EFFECTIVENESS_RUBRIC, type EffectivenessRubric } from "@/lib/ads-metrics";

/**
 * SPEC Mục 9.4 (mở rộng theo dữ liệu thật — xem CLAUDE.md phần "Ads hàng
 * tháng/tuần") — CPL/CAC/CVR/ROAS/CPMQL và điểm hiệu quả đều SUY RA tại truy
 * vấn, không lưu cột (cùng nguyên tắc `overdue`, Mục 4.2).
 */

export {
  computeAdsDerived,
  DEFAULT_EFFECTIVENESS_RUBRIC,
  EFFECTIVENESS_LABELS,
  effectivenessLabel,
  type AdsDerived,
  type AdsMetricLike,
  type EffectivenessRubric,
  type EffectivenessTier,
} from "@/lib/ads-metrics";

export async function loadEffectivenessRubric(db: DB): Promise<EffectivenessRubric> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "ads_effectiveness_rubric"));
  const v = row?.value as Partial<EffectivenessRubric> | undefined;
  if (!v?.cplTiers || !v?.cacTiers) return DEFAULT_EFFECTIVENESS_RUBRIC;
  return { ...DEFAULT_EFFECTIVENESS_RUBRIC, ...v };
}

export async function listAdsMetrics(db: DB, filters: { line?: AdsMetric["line"]; period?: string; periodType?: AdsMetric["periodType"] } = {}) {
  const rubric = await loadEffectivenessRubric(db);
  const rows = await db
    .select()
    .from(adsMetrics)
    .where(
      and(
        filters.line ? eq(adsMetrics.line, filters.line) : undefined,
        filters.period ? eq(adsMetrics.period, filters.period) : undefined,
        filters.periodType ? eq(adsMetrics.periodType, filters.periodType) : undefined,
      ),
    )
    .orderBy(asc(adsMetrics.period));
  return rows.map((r) => ({ ...r, ...computeAdsDerived(r, rubric) }));
}

export interface UpsertAdsMetricInput {
  id?: string;
  line: AdsMetric["line"];
  periodType: AdsMetric["periodType"];
  period: string;
  sbuId?: string | null;
  budget?: string | null;
  centerOrderBudget?: string | null;
  hoTopupBudget?: string | null;
  leads?: string | null;
  newStudents?: string | null;
  messages?: string | null;
  impressions?: string | null;
  revenue?: string | null;
  actualRevenue?: string | null;
  mql?: string | null;
  deals?: string | null;
  misaOrderCode?: string | null;
  status?: AdsMetric["status"];
  reportUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  centerFeedback?: string | null;
  mktAssessment?: string | null;
  notes?: string | null;
}

export async function upsertAdsMetric(db: DB, input: UpsertAdsMetricInput, actorId: string | null) {
  if (input.id) {
    const [row] = await db
      .update(adsMetrics)
      .set({ ...input, updatedBy: actorId })
      .where(eq(adsMetrics.id, input.id))
      .returning();
    await writeAudit(db, { actorId, entity: "ads_metrics", entityId: row.id, action: "UPDATE" });
    return row;
  }
  const [row] = await db
    .insert(adsMetrics)
    .values({ ...input, createdBy: actorId })
    .returning();
  await writeAudit(db, { actorId, entity: "ads_metrics", entityId: row.id, action: "CREATE" });
  return row;
}

export async function deleteAdsMetric(db: DB, id: string, actorId: string | null) {
  await db.delete(adsMetrics).where(eq(adsMetrics.id, id));
  await writeAudit(db, { actorId, entity: "ads_metrics", entityId: id, action: "DELETE" });
}

// ---------------------------------------------------------------------------
// Chiến dịch Facebook (grain thấp nhất, file "ads tt.xlsx")
// ---------------------------------------------------------------------------

export async function listAdsCampaigns(db: DB, filters: { sbuId?: string; period?: string } = {}) {
  return db
    .select()
    .from(adsCampaigns)
    .where(and(filters.sbuId ? eq(adsCampaigns.sbuId, filters.sbuId) : undefined, filters.period ? eq(adsCampaigns.period, filters.period) : undefined))
    .orderBy(asc(adsCampaigns.period));
}

export interface UpsertAdsCampaignInput {
  id?: string;
  sbuId: string;
  period: string;
  campaignName: string;
  misaRequestUrl?: string | null;
  messages?: string | null;
  reach?: string | null;
  impressions?: string | null;
  conversations?: string | null;
  comments?: string | null;
  engagements?: string | null;
  reactions?: string | null;
  spend: string;
  spendWithVat?: string | null;
}

export async function upsertAdsCampaign(db: DB, input: UpsertAdsCampaignInput, actorId: string | null) {
  if (input.id) {
    const [row] = await db
      .update(adsCampaigns)
      .set({ ...input, updatedBy: actorId })
      .where(eq(adsCampaigns.id, input.id))
      .returning();
    await writeAudit(db, { actorId, entity: "ads_campaigns", entityId: row.id, action: "UPDATE" });
    return row;
  }
  const [row] = await db
    .insert(adsCampaigns)
    .values({ ...input, createdBy: actorId })
    .returning();
  await writeAudit(db, { actorId, entity: "ads_campaigns", entityId: row.id, action: "CREATE" });
  return row;
}

export async function deleteAdsCampaign(db: DB, id: string, actorId: string | null) {
  await db.delete(adsCampaigns).where(eq(adsCampaigns.id, id));
  await writeAudit(db, { actorId, entity: "ads_campaigns", entityId: id, action: "DELETE" });
}

/**
 * Cộng dồn chiến dịch → dòng ads_metrics (line=b2c_center) của (sbu, tháng):
 * messages/impressions lấy tổng, centerOrderBudget = tổng spend (CLAUDE.md
 * Mục 9.4: ngân sách Trung tâm chỉ tính phần TT tự order — nếu có phần HO hỗ
 * trợ thêm, sửa tay hoTopupBudget riêng sau khi cộng dồn, không tự suy ra được
 * từ dữ liệu chiến dịch thô). Dùng nút "Cộng dồn từ chiến dịch" ở UI, KHÔNG
 * tự động chạy mỗi lần sửa 1 chiến dịch — tránh ghi đè số liệu đã sửa tay.
 */
export async function rollupCampaignsToMetric(db: DB, sbuId: string, period: string, actorId: string | null) {
  const campaigns = await listAdsCampaigns(db, { sbuId, period });
  const sum = (f: (c: AdsCampaign) => string | null) => campaigns.reduce((s, c) => s + (f(c) ? Number(f(c)) : 0), 0);
  const totalSpend = sum((c) => c.spend);
  const totalMessages = sum((c) => c.messages);
  const totalImpressions = sum((c) => c.impressions);

  const [existing] = await db
    .select()
    .from(adsMetrics)
    .where(and(eq(adsMetrics.line, "b2c_center"), eq(adsMetrics.periodType, "month"), eq(adsMetrics.period, period), eq(adsMetrics.sbuId, sbuId)))
    .limit(1);

  return upsertAdsMetric(
    db,
    {
      id: existing?.id,
      line: "b2c_center",
      periodType: "month",
      period,
      sbuId,
      centerOrderBudget: String(totalSpend),
      hoTopupBudget: existing?.hoTopupBudget ?? null,
      messages: String(totalMessages),
      impressions: String(totalImpressions),
      leads: existing?.leads ?? null,
      newStudents: existing?.newStudents ?? null,
    },
    actorId,
  );
}

// ---------------------------------------------------------------------------
// Kế hoạch giải ngân (sheet "Giải ngân Digital") — chỉ Mục 1 (b2c_system) +
// Mục 3 (ecom) + Mục 5 (osir), không gồm b2c_center/b2b/vmp (đúng phạm vi gốc).
// ---------------------------------------------------------------------------

export const DISBURSEMENT_LINES = ["b2c_system", "ecom", "osir"] as const;

export async function listDisbursementPlan(db: DB, period?: string) {
  return db
    .select()
    .from(adsDisbursementPlan)
    .where(period ? eq(adsDisbursementPlan.period, period) : undefined)
    .orderBy(asc(adsDisbursementPlan.period));
}

export async function upsertDisbursementPlan(
  db: DB,
  input: { id?: string; line: (typeof DISBURSEMENT_LINES)[number]; period: string; plannedAmount: string; notes?: string | null },
  actorId: string | null,
) {
  if (input.id) {
    const [row] = await db
      .update(adsDisbursementPlan)
      .set({ ...input, updatedBy: actorId })
      .where(eq(adsDisbursementPlan.id, input.id))
      .returning();
    await writeAudit(db, { actorId, entity: "ads_disbursement_plan", entityId: row.id, action: "UPDATE" });
    return row;
  }
  const [row] = await db
    .insert(adsDisbursementPlan)
    .values({ ...input, createdBy: actorId })
    .returning();
  await writeAudit(db, { actorId, entity: "ads_disbursement_plan", entityId: row.id, action: "CREATE" });
  return row;
}

/** Thực tế = SUM(budget hoặc centerOrderBudget+hoTopupBudget) của mọi dòng tháng đó thuộc line (Mục 9.4: tính tại truy vấn). */
export async function actualSpendForLine(db: DB, line: AdsMetric["line"], period: string): Promise<number> {
  const rows = await db
    .select()
    .from(adsMetrics)
    .where(and(eq(adsMetrics.line, line), eq(adsMetrics.periodType, "month"), eq(adsMetrics.period, period)));
  return rows.reduce((s, r) => {
    const amt = r.line === "b2c_center" ? (r.centerOrderBudget ? Number(r.centerOrderBudget) : 0) + (r.hoTopupBudget ? Number(r.hoTopupBudget) : 0) : r.budget ? Number(r.budget) : 0;
    return s + amt;
  }, 0);
}
