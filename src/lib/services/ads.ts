import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { adsCampaigns, adsEcomProducts, adsMetrics, adsPlans, appSettings, type AdsCampaign, type AdsMetric, type AdsPlan } from "@/lib/db/schema";
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

export async function listAdsCampaigns(db: DB, filters: { sbuId?: string; period?: string; line?: AdsCampaign["line"] } = {}) {
  return db
    .select()
    .from(adsCampaigns)
    .where(
      and(
        filters.sbuId ? eq(adsCampaigns.sbuId, filters.sbuId) : undefined,
        filters.period ? eq(adsCampaigns.period, filters.period) : undefined,
        filters.line ? eq(adsCampaigns.line, filters.line) : undefined,
      ),
    )
    .orderBy(asc(adsCampaigns.period));
}

export interface UpsertAdsCampaignInput {
  id?: string;
  /** Mảng của request; bỏ trống = giữ nguyên (tạo mới mặc định b2c_center). */
  line?: AdsCampaign["line"];
  /** Chỉ dùng ở mảng b2c_center (request của từng trung tâm). */
  sbuId?: string | null;
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
  /** Ngân sách kế hoạch của request. */
  plannedBudget?: string | null;
  /** Người chạy ads. */
  runnerId?: string | null;
}

/** Sửa 1 phần request (sửa trực tiếp trên bảng) — chỉ ghi các trường có trong `patch`. */
export async function patchAdsCampaign(db: DB, id: string, patch: Partial<UpsertAdsCampaignInput>, actorId: string | null) {
  const { id: _ignore, ...fields } = patch;
  void _ignore;
  const [row] = await db
    .update(adsCampaigns)
    .set({ ...fields, updatedBy: actorId })
    .where(eq(adsCampaigns.id, id))
    .returning();
  await writeAudit(db, { actorId, entity: "ads_campaigns", entityId: id, action: "UPDATE", changes: fields as Record<string, unknown> });
  return row;
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
  const campaigns = await listAdsCampaigns(db, { sbuId, period, line: "b2c_center" });
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
// Kế hoạch ads theo tháng (SPEC Phụ lục D mục 21) — thay cho "kế hoạch giải ngân" cũ.
// Thực tế / % đạt / dự báo đều suy ra ở client từ kế hoạch + ads_metrics (lib/ads-plan.ts).
// ---------------------------------------------------------------------------

export async function listAdsPlans(db: DB, period?: string) {
  return db
    .select()
    .from(adsPlans)
    .where(period ? eq(adsPlans.period, period) : undefined)
    .orderBy(asc(adsPlans.period));
}

/** Các trường người dùng được sửa của 1 dòng kế hoạch. Trường vắng = giữ nguyên; `null`/"" = xoá số. */
export interface AdsPlanValues {
  plannedBudget?: string | null;
  targetLeads?: string | null;
  targetNewStudents?: string | null;
  targetMessages?: string | null;
  targetMql?: string | null;
  targetRevenue?: string | null;
  targetDeals?: string | null;
  notes?: string | null;
}

export interface UpsertAdsPlanInput extends AdsPlanValues {
  line: AdsPlan["line"];
  period: string;
  /** Chỉ b2c_center (kế hoạch từng trung tâm); còn lại null. */
  sbuId?: string | null;
}

/**
 * Sửa tự do (không có bước chốt) nhưng ghi nhật ký audit: ai sửa, trường nào, từ → sang. Chỉ ghi đúng các trường có trong
 * `input` nên sửa 1 ô không đè các ô khác. Khoá = (mảng, tháng, trung tâm).
 */
export async function upsertAdsPlan(db: DB, input: UpsertAdsPlanInput, actorId: string | null): Promise<AdsPlan> {
  const { line, period, sbuId = null, ...rawValues } = input;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Tháng không hợp lệ (định dạng yyyy-mm).");
  if (sbuId && line !== "b2c_center") throw new Error("Chỉ kế hoạch B2C Trung tâm mới gắn với trung tâm.");
  const values: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(rawValues)) {
    if (v === undefined) continue;
    const t = typeof v === "string" ? v.trim() : v;
    if (k !== "notes" && t != null && t !== "" && !/^\d+$/.test(String(t))) throw new Error("Số kế hoạch phải là số nguyên không âm.");
    values[k] = t === "" ? null : (t as string | null);
  }

  const [existing] = await db
    .select()
    .from(adsPlans)
    .where(and(eq(adsPlans.line, line), eq(adsPlans.period, period), sbuId ? eq(adsPlans.sbuId, sbuId) : isNull(adsPlans.sbuId)))
    .limit(1);

  if (existing) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(values)) {
      const before = (existing as Record<string, unknown>)[k] ?? null;
      if (String(before ?? "") !== String(v ?? "")) changes[k] = { from: before, to: v };
    }
    if (Object.keys(changes).length === 0) return existing;
    const [row] = await db
      .update(adsPlans)
      .set({ ...values, updatedBy: actorId })
      .where(eq(adsPlans.id, existing.id))
      .returning();
    await writeAudit(db, { actorId, entity: "ads_plans", entityId: row.id, action: "UPDATE", changes });
    return row;
  }
  const [row] = await db
    .insert(adsPlans)
    .values({ line, period, sbuId, ...values, createdBy: actorId })
    .returning();
  await writeAudit(db, { actorId, entity: "ads_plans", entityId: row.id, action: "CREATE", changes: values });
  return row;
}

/**
 * Sao chép kế hoạch của tháng `from` sang tháng `to` cho các mảng `lines` — chỉ tạo dòng CHƯA có ở tháng đích (không đè số đã lập).
 * Chép ngân sách + mục tiêu; ghi chú không chép.
 */
export async function copyAdsPlans(db: DB, input: { lines: AdsPlan["line"][]; from: string; to: string }, actorId: string | null): Promise<number> {
  const src = await db
    .select()
    .from(adsPlans)
    .where(and(eq(adsPlans.period, input.from), inArray(adsPlans.line, input.lines)));
  const dst = await db
    .select()
    .from(adsPlans)
    .where(and(eq(adsPlans.period, input.to), inArray(adsPlans.line, input.lines)));
  const key = (p: { line: string; sbuId: string | null }) => `${p.line}|${p.sbuId ?? ""}`;
  const have = new Set(dst.map(key));
  let n = 0;
  for (const p of src) {
    if (have.has(key(p))) continue;
    const [row] = await db
      .insert(adsPlans)
      .values({
        line: p.line,
        period: input.to,
        sbuId: p.sbuId,
        plannedBudget: p.plannedBudget,
        targetLeads: p.targetLeads,
        targetNewStudents: p.targetNewStudents,
        targetMessages: p.targetMessages,
        targetMql: p.targetMql,
        targetRevenue: p.targetRevenue,
        targetDeals: p.targetDeals,
        createdBy: actorId,
      })
      .returning({ id: adsPlans.id });
    await writeAudit(db, { actorId, entity: "ads_plans", entityId: row.id, action: "CREATE", changes: { copiedFrom: input.from } });
    n++;
  }
  return n;
}

export async function deleteAdsPlan(db: DB, id: string, actorId: string | null) {
  await db.delete(adsPlans).where(eq(adsPlans.id, id));
  await writeAudit(db, { actorId, entity: "ads_plans", entityId: id, action: "DELETE" });
}

// ---------------------------------------------------------------------------
// Ecom theo sản phẩm (báo cáo "TMĐT theo SP theo tháng")
// ---------------------------------------------------------------------------

export async function listEcomProducts(db: DB) {
  return db.select().from(adsEcomProducts).orderBy(asc(adsEcomProducts.period));
}

export interface EcomProductRowInput {
  product: string;
  spend?: string | null;
  mql?: string | null;
  newStudents?: string | null;
  revenue?: string | null;
}

/**
 * Lưu cả 1 kỳ (mọi sản phẩm) một lần. Dòng trống hoàn toàn (không số nào) bị xoá
 * để bảng không đầy dòng rỗng; dòng có số thì upsert theo (kỳ, sản phẩm).
 */
export async function saveEcomProductPeriod(
  db: DB,
  input: { period: string; periodEnd?: string | null; rows: EcomProductRowInput[] },
  actorId: string | null,
) {
  const periodEnd = input.periodEnd && input.periodEnd !== input.period ? input.periodEnd : null;
  const keys = input.rows.map((r) => r.product);
  const empty = (r: EcomProductRowInput) => [r.spend, r.mql, r.newStudents, r.revenue].every((v) => v == null || v === "");
  const toDelete = input.rows.filter(empty).map((r) => r.product);
  if (toDelete.length) {
    await db.delete(adsEcomProducts).where(and(eq(adsEcomProducts.period, input.period), inArray(adsEcomProducts.product, toDelete)));
  }
  for (const r of input.rows.filter((r) => !empty(r))) {
    const vals = { period: input.period, periodEnd, product: r.product, spend: r.spend || null, mql: r.mql || null, newStudents: r.newStudents || null, revenue: r.revenue || null };
    await db
      .insert(adsEcomProducts)
      .values({ ...vals, createdBy: actorId })
      .onConflictDoUpdate({ target: [adsEcomProducts.period, adsEcomProducts.product], set: { ...vals, updatedBy: actorId } });
  }
  await writeAudit(db, { actorId, entity: "ads_ecom_products", entityId: input.period, action: "UPDATE", changes: { products: keys.length } });
}

export async function deleteEcomProductPeriod(db: DB, period: string, actorId: string | null) {
  await db.delete(adsEcomProducts).where(eq(adsEcomProducts.period, period));
  await writeAudit(db, { actorId, entity: "ads_ecom_products", entityId: period, action: "DELETE" });
}

/** Upsert 1 dòng (kỳ, sản phẩm); chỉ ghi các trường có trong `values` — trường vắng giữ nguyên (dùng cho import Excel). */
export async function upsertEcomProduct(
  db: DB,
  input: { period: string; periodEnd?: string | null; product: string; values: { spend?: string; mql?: string; newStudents?: string; revenue?: string } },
  actorId: string | null,
) {
  const periodEnd = input.periodEnd && input.periodEnd !== input.period ? input.periodEnd : null;
  const set = { periodEnd, ...input.values, updatedBy: actorId };
  await db
    .insert(adsEcomProducts)
    .values({ period: input.period, product: input.product, ...set, createdBy: actorId })
    .onConflictDoUpdate({ target: [adsEcomProducts.period, adsEcomProducts.product], set });
}
