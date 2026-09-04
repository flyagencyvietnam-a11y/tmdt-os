/**
 * ============================================================================
 *  metrics.ts — NGUỒN CÔNG THỨC DUY NHẤT (SPEC Mục 9)
 * ============================================================================
 *  Mọi chỉ số của hệ thống (dashboard, KPI, cảnh báo campaign, báo cáo) PHẢI
 *  gọi hàm trong file này. Không định nghĩa lại công thức ở bất kỳ nơi nào khác.
 *  Không tính chỉ số ở client.
 *
 *  Quy ước:
 *   - Chia cho 0  -> trả về `null` (KHÔNG phải 0). Tầng hiển thị đổi null -> "-".
 *   - "leads" (số Lead báo cáo) = SUM(campaign_daily_metrics.messages), số nhập tay.
 *   - mql/sql = đếm bản ghi theo `max_stage` (giai đoạn cao nhất từng đạt).
 *   - Quy kết thời gian: spend/leads theo metric_date; mql theo mql_at; sql theo
 *     sql_at; won/doanh thu theo enrollments.contract_date. (SPEC Mục 9.3)
 * ============================================================================
 */
import {
  and,
  type AnyColumn,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  campaignDailyMetrics,
  campaigns,
  enrollments,
  leadInteractions,
  leads,
  otherCosts,
  products,
} from "@/lib/db/schema";
import {
  VN_TZ_OFFSET,
  addDaysStr,
  localDayStr,
  vnDayBoundsUtc,
  todayVnDayStr,
} from "@/lib/time";

// Chấp nhận cả postgres-js drizzle lẫn pglite drizzle.
export type AnyDb = PgDatabase<any, any, any>;

/** Cửa sổ quy kết campaign — SPEC Mục 9.3. */
export const ATTRIBUTION_WINDOW_DAYS = 90;
/** Dữ liệu "chưa chín" nếu kỳ kết thúc trong vòng N ngày — SPEC Mục 9.3. */
export const DATA_MATURITY_DAYS = 7;
/** Cửa sổ rolling cho cảnh báo campaign — SPEC Mục 9.4. */
export const ROLLING_WINDOW_DAYS = 14;

export interface MetricsFilter {
  /** Ngày local VN, dạng YYYY-MM-DD, bao gồm cả 2 đầu. */
  from: string;
  to: string;
  campaignIds?: string[];
  productIds?: string[];
  channels?: ("FB" | "GOOGLE" | "TIKTOK" | "KHAC")[];
  sources?: string[];
  assignedTo?: string[];
  /**
   * Khi true, áp cửa sổ quy kết 90 ngày cho mql/sql (dùng cho chỉ số cấp campaign).
   * SPEC Mục 9.3.
   */
  campaignAttribution?: boolean;
}

export interface BaseMetrics {
  spend: number;
  leads: number; // = SUM(messages) nhập tay
  leadsRecorded: number; // = COUNT bản ghi lead (khác leads!)
  mql: number;
  sql: number;
  won: number;
  hvm: number;
  revenueGross: number;
  revenueNet: number;
  cashCollected: number;
  kolCost: number;
}

export interface DerivedMetrics {
  cpl: number | null;
  cpmql: number | null;
  cpsql: number | null;
  cac: number | null;
  crLeadMql: number | null;
  crMqlSql: number | null;
  crSqlWon: number | null;
  crLeadWon: number | null;
  roas: number | null;
  aov: number | null;
  revenueAfterMkt: number | null;
}

export interface FullMetrics extends BaseMetrics, DerivedMetrics {
  filter: MetricsFilter;
  dataImmature: boolean;
}

/** a / b với quy tắc chia 0 -> null (SPEC Mục 9.2). */
export function safeDiv(a: number, b: number): number | null {
  if (!b || !Number.isFinite(b)) return null;
  return a / b;
}

function n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
}

// ---------------------------------------------------------------------------
//  BASE METRICS
// ---------------------------------------------------------------------------

export async function getBaseMetrics(
  db: AnyDb,
  filter: MetricsFilter,
): Promise<BaseMetrics> {
  const { from, to } = filter;
  const [startUtc, endUtc] = [vnDayBoundsUtc(from)[0], vnDayBoundsUtc(to)[1]];

  // --- spend & leads (nhập tay) : lọc theo campaign_daily_metrics.metric_date ---
  const cdmConds = [
    gte(campaignDailyMetrics.metricDate, from),
    lte(campaignDailyMetrics.metricDate, to),
  ];
  if (filter.campaignIds?.length)
    cdmConds.push(inArray(campaignDailyMetrics.campaignId, filter.campaignIds));

  const needCampaignJoin =
    !!filter.productIds?.length || !!filter.channels?.length;

  const jc = [...cdmConds];
  if (needCampaignJoin) {
    if (filter.productIds?.length)
      jc.push(inArray(campaigns.productId, filter.productIds));
    if (filter.channels?.length)
      jc.push(inArray(campaigns.channel, filter.channels));
  }
  const spendLeadsPromise = needCampaignJoin
    ? db
        .select({
          spend: sql`coalesce(sum(${campaignDailyMetrics.spend}), 0)`,
          leads: sql`coalesce(sum(${campaignDailyMetrics.messages}), 0)`,
        })
        .from(campaignDailyMetrics)
        .innerJoin(campaigns, eq(campaigns.id, campaignDailyMetrics.campaignId))
        .where(and(...jc))
    : db
        .select({
          spend: sql`coalesce(sum(${campaignDailyMetrics.spend}), 0)`,
          leads: sql`coalesce(sum(${campaignDailyMetrics.messages}), 0)`,
        })
        .from(campaignDailyMetrics)
        .where(and(...cdmConds));

  // --- các chỉ số từ bản ghi lead ---
  const leadBase = [isNull(leads.deletedAt), isNull(leads.duplicateOf)];
  if (filter.campaignIds?.length)
    leadBase.push(inArray(leads.campaignId, filter.campaignIds));
  if (filter.productIds?.length)
    leadBase.push(inArray(leads.productId, filter.productIds));
  if (filter.sources?.length)
    leadBase.push(inArray(leads.source, filter.sources as any));
  if (filter.assignedTo?.length)
    leadBase.push(inArray(leads.assignedTo, filter.assignedTo));

  // cửa sổ quy kết 90 ngày cho chỉ số cấp campaign
  const attributionOk = filter.campaignAttribution
    ? [
        sql`(${leads.mqlAt} is null or ${leads.mqlAt} - ${leads.receivedAt} <= interval '${sql.raw(
          String(ATTRIBUTION_WINDOW_DAYS),
        )} days')`,
      ]
    : [];

  const leadsRecordedPromise = db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...leadBase,
        gte(leads.receivedAt, startUtc),
        lt(leads.receivedAt, endUtc),
      ),
    );

  const mqlPromise = db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...leadBase,
        ...attributionOk,
        gte(leads.maxStage, "MQL"),
        gte(leads.mqlAt, startUtc),
        lt(leads.mqlAt, endUtc),
      ),
    );

  const sqlPromise = db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...leadBase,
        ...attributionOk,
        gte(leads.maxStage, "SQL"),
        gte(leads.sqlAt, startUtc),
        lt(leads.sqlAt, endUtc),
      ),
    );

  const wonPromise = db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...leadBase,
        eq(leads.outcome, "WON"),
        gte(leads.wonAt, startUtc),
        lt(leads.wonAt, endUtc),
      ),
    );

  // --- doanh thu : lọc theo enrollments.contract_date, join lead cho các filter ---
  const enrConds = [
    gte(enrollments.contractDate, from),
    lte(enrollments.contractDate, to),
    isNull(leads.deletedAt),
    isNull(leads.duplicateOf),
  ];
  if (filter.campaignIds?.length)
    enrConds.push(inArray(leads.campaignId, filter.campaignIds));
  if (filter.productIds?.length)
    enrConds.push(inArray(enrollments.productId, filter.productIds));
  if (filter.sources?.length)
    enrConds.push(inArray(leads.source, filter.sources as any));
  if (filter.assignedTo?.length)
    enrConds.push(inArray(enrollments.creditedTo, filter.assignedTo));

  const revPromise = db
    .select({
      hvm: sql`coalesce(sum(${enrollments.studentCount}), 0)`,
      gross: sql`coalesce(sum(${enrollments.grossAmount}), 0)`,
      net: sql`coalesce(sum(${enrollments.netAmount}), 0)`,
      collected: sql`coalesce(sum(${enrollments.collectedAmount}), 0)`,
    })
    .from(enrollments)
    .innerJoin(leads, eq(leads.id, enrollments.leadId))
    .where(and(...enrConds));

  // Các truy vấn trên độc lập nhau — chạy song song để giảm round-trip DB.
  const [
    spendLeadsRow,
    [leadsRecordedRow],
    [mqlRow],
    [sqlRow],
    [wonRow],
    [revRow],
    kolCost,
  ] = await Promise.all([
    spendLeadsPromise,
    leadsRecordedPromise,
    mqlPromise,
    sqlPromise,
    wonPromise,
    revPromise,
    getKolCost(db, filter),
  ]);

  return {
    spend: n(spendLeadsRow[0]?.spend),
    leads: n(spendLeadsRow[0]?.leads),
    leadsRecorded: n(leadsRecordedRow?.c),
    mql: n(mqlRow?.c),
    sql: n(sqlRow?.c),
    won: n(wonRow?.c),
    hvm: n(revRow?.hvm),
    revenueGross: n(revRow?.gross),
    revenueNet: n(revRow?.net),
    cashCollected: n(revRow?.collected),
    kolCost,
  };
}

/** SPEC Mục 14.2 — chi phí KOL/KOC + chi phí khác, lọc theo incurred_on. */
export async function getKolCost(
  db: AnyDb,
  filter: Pick<MetricsFilter, "from" | "to" | "productIds">,
): Promise<number> {
  const conds = [
    gte(otherCosts.incurredOn, filter.from),
    lte(otherCosts.incurredOn, filter.to),
    eq(otherCosts.costType, "KOL_KOC"),
  ];
  if (filter.productIds?.length)
    conds.push(inArray(otherCosts.productId, filter.productIds));
  const [row] = await db
    .select({ s: sql`coalesce(sum(${otherCosts.amount}), 0)` })
    .from(otherCosts)
    .where(and(...conds));
  return n(row?.s);
}

// ---------------------------------------------------------------------------
//  BASE METRICS — BẢN GOM NHÓM (1 truy vấn / bảng nguồn thay vì N lần lặp)
//  Cùng ngữ nghĩa getBaseMetrics; có test đối chiếu ở metrics-breakdown.test.ts.
// ---------------------------------------------------------------------------

export type BreakdownDim = "product" | "campaign" | "assignee";

/**
 * Trả `Map<groupId, BaseMetrics>` — tương đương gọi `getBaseMetrics` cho từng
 * `productIds:[id]` / `campaignIds:[id]` / `assignedTo:[id]`, nhưng bằng 3–4 truy
 * vấn `GROUP BY` thay vì (số nhóm × 7) round-trip. Nhóm khóa null bị loại (giống
 * vòng lặp cũ luôn duyệt theo danh sách id có sẵn).
 *
 * Lưu ý theo chiều:
 *  - product : spend/leads quy theo `campaigns.product_id`; doanh thu theo
 *    `enrollments.product_id`; KOL theo `other_costs.product_id`.
 *  - campaign: spend/leads theo `campaign_daily_metrics.campaign_id`; doanh thu
 *    theo `leads.campaign_id`; KOL = 0 (không có chiều campaign). Áp cửa sổ quy
 *    kết 90 ngày cho mql/sql khi `filter.campaignAttribution`.
 *  - assignee: spend/leads = 0 (không quy được cho người); mql/sql/won theo
 *    `leads.assigned_to`; doanh thu theo `enrollments.credited_to`; KOL = 0.
 */
export async function getBaseMetricsGrouped(
  db: AnyDb,
  filter: MetricsFilter,
  dim: BreakdownDim,
): Promise<Map<string, BaseMetrics>> {
  const { from, to } = filter;
  const [startUtc, endUtc] = [vnDayBoundsUtc(from)[0], vnDayBoundsUtc(to)[1]];
  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();

  // ---- (1) funnel từ bản ghi lead: leadsRecorded / mql / sql / won ----
  const leadBase = [isNull(leads.deletedAt), isNull(leads.duplicateOf)];
  if (filter.campaignIds?.length)
    leadBase.push(inArray(leads.campaignId, filter.campaignIds));
  if (filter.productIds?.length)
    leadBase.push(inArray(leads.productId, filter.productIds));
  if (filter.sources?.length)
    leadBase.push(inArray(leads.source, filter.sources as any));
  if (filter.assignedTo?.length)
    leadBase.push(inArray(leads.assignedTo, filter.assignedTo));

  const attr = filter.campaignAttribution
    ? sql` and (${leads.mqlAt} is null or ${leads.mqlAt} - ${leads.receivedAt} <= interval '${sql.raw(
        String(ATTRIBUTION_WINDOW_DAYS),
      )} days')`
    : sql``;

  const leadG =
    dim === "product"
      ? leads.productId
      : dim === "campaign"
        ? leads.campaignId
        : leads.assignedTo;

  const funnelPromise = db
    .select({
      g: leadG,
      leadsRecorded: sql<number>`count(*) filter (where ${leads.receivedAt} >= ${startIso}::timestamptz and ${leads.receivedAt} < ${endIso}::timestamptz)`,
      mql: sql<number>`count(*) filter (where ${leads.maxStage} >= 'MQL' and ${leads.mqlAt} >= ${startIso}::timestamptz and ${leads.mqlAt} < ${endIso}::timestamptz${attr})`,
      sqlc: sql<number>`count(*) filter (where ${leads.maxStage} >= 'SQL' and ${leads.sqlAt} >= ${startIso}::timestamptz and ${leads.sqlAt} < ${endIso}::timestamptz${attr})`,
      won: sql<number>`count(*) filter (where ${leads.outcome} = 'WON' and ${leads.wonAt} >= ${startIso}::timestamptz and ${leads.wonAt} < ${endIso}::timestamptz)`,
    })
    .from(leads)
    .where(and(...leadBase, isNotNull(leadG)))
    .groupBy(leadG);

  // ---- (2) spend & leads (nhập tay) ----
  const slConds = [
    gte(campaignDailyMetrics.metricDate, from),
    lte(campaignDailyMetrics.metricDate, to),
  ];
  if (filter.campaignIds?.length)
    slConds.push(inArray(campaignDailyMetrics.campaignId, filter.campaignIds));
  const needJoin =
    dim === "product" || !!filter.productIds?.length || !!filter.channels?.length;
  if (filter.productIds?.length)
    slConds.push(inArray(campaigns.productId, filter.productIds));
  if (filter.channels?.length)
    slConds.push(inArray(campaigns.channel, filter.channels));

  const spendLeadsPromise:
    | Promise<{ g: string | null; spend: unknown; leads: unknown }[]>
    | null =
    dim === "assignee"
      ? null
      : needJoin
        ? db
            .select({
              g:
                dim === "product"
                  ? campaigns.productId
                  : campaignDailyMetrics.campaignId,
              spend: sql`coalesce(sum(${campaignDailyMetrics.spend}), 0)`,
              leads: sql`coalesce(sum(${campaignDailyMetrics.messages}), 0)`,
            })
            .from(campaignDailyMetrics)
            .innerJoin(
              campaigns,
              eq(campaigns.id, campaignDailyMetrics.campaignId),
            )
            .where(and(...slConds))
            .groupBy(
              dim === "product"
                ? campaigns.productId
                : campaignDailyMetrics.campaignId,
            )
        : db
            .select({
              g: campaignDailyMetrics.campaignId,
              spend: sql`coalesce(sum(${campaignDailyMetrics.spend}), 0)`,
              leads: sql`coalesce(sum(${campaignDailyMetrics.messages}), 0)`,
            })
            .from(campaignDailyMetrics)
            .where(and(...slConds))
            .groupBy(campaignDailyMetrics.campaignId);

  // ---- (3) doanh thu ----
  const enrConds = [
    gte(enrollments.contractDate, from),
    lte(enrollments.contractDate, to),
    isNull(leads.deletedAt),
    isNull(leads.duplicateOf),
  ];
  if (filter.campaignIds?.length)
    enrConds.push(inArray(leads.campaignId, filter.campaignIds));
  if (filter.productIds?.length)
    enrConds.push(inArray(enrollments.productId, filter.productIds));
  if (filter.sources?.length)
    enrConds.push(inArray(leads.source, filter.sources as any));
  if (filter.assignedTo?.length)
    enrConds.push(inArray(enrollments.creditedTo, filter.assignedTo));

  const enrG =
    dim === "product"
      ? enrollments.productId
      : dim === "campaign"
        ? leads.campaignId
        : enrollments.creditedTo;

  const revPromise = db
    .select({
      g: enrG,
      hvm: sql`coalesce(sum(${enrollments.studentCount}), 0)`,
      gross: sql`coalesce(sum(${enrollments.grossAmount}), 0)`,
      net: sql`coalesce(sum(${enrollments.netAmount}), 0)`,
      collected: sql`coalesce(sum(${enrollments.collectedAmount}), 0)`,
    })
    .from(enrollments)
    .innerJoin(leads, eq(leads.id, enrollments.leadId))
    .where(and(...enrConds, isNotNull(enrG)))
    .groupBy(enrG);

  // ---- (4) KOL cost — chỉ chiều product ----
  const kolConds = [
    gte(otherCosts.incurredOn, from),
    lte(otherCosts.incurredOn, to),
    eq(otherCosts.costType, "KOL_KOC"),
  ];
  if (filter.productIds?.length)
    kolConds.push(inArray(otherCosts.productId, filter.productIds));
  const kolPromise:
    | Promise<{ g: string | null; kol: unknown }[]>
    | null =
    dim === "product"
      ? db
          .select({
            g: otherCosts.productId,
            kol: sql`coalesce(sum(${otherCosts.amount}), 0)`,
          })
          .from(otherCosts)
          .where(and(...kolConds, isNotNull(otherCosts.productId)))
          .groupBy(otherCosts.productId)
      : null;

  const [funnelRows, slRows, revRows, kolRows] = await Promise.all([
    funnelPromise,
    spendLeadsPromise ?? Promise.resolve([]),
    revPromise,
    kolPromise ?? Promise.resolve([]),
  ]);

  const out = new Map<string, BaseMetrics>();
  const ensure = (k: string): BaseMetrics => {
    let m = out.get(k);
    if (!m) {
      m = {
        spend: 0,
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
      };
      out.set(k, m);
    }
    return m;
  };

  for (const r of funnelRows) {
    if (!r.g) continue;
    const m = ensure(r.g);
    m.leadsRecorded = n(r.leadsRecorded);
    m.mql = n(r.mql);
    m.sql = n(r.sqlc);
    m.won = n(r.won);
  }
  for (const r of slRows) {
    if (!r.g) continue;
    const m = ensure(r.g);
    m.spend = n(r.spend);
    m.leads = n(r.leads);
  }
  for (const r of revRows) {
    if (!r.g) continue;
    const m = ensure(r.g);
    m.hvm = n(r.hvm);
    m.revenueGross = n(r.gross);
    m.revenueNet = n(r.net);
    m.cashCollected = n(r.collected);
  }
  for (const r of kolRows) {
    if (!r.g) continue;
    ensure(r.g).kolCost = n(r.kol);
  }
  return out;
}

/**
 * Chuỗi theo tuần cho `weeklyTrend` — 3 truy vấn (spend theo metric_date, mql theo
 * mql_at, won theo won_at) rồi gom vào các tuần cho trước, thay vì gọi
 * `getBaseMetrics` 12 lần. Ngữ nghĩa khớp `getBaseMetrics` không cửa sổ quy kết.
 */
export async function getTrendSeries(
  db: AnyDb,
  weekStarts: string[],
  filter: Partial<MetricsFilter> = {},
): Promise<{ weekStart: string; spend: number; mql: number; won: number }[]> {
  if (weekStarts.length === 0) return [];
  const rangeFrom = weekStarts[0];
  const rangeTo = addDaysStr(weekStarts[weekStarts.length - 1], 6);
  const [startUtc, endUtc] = [
    vnDayBoundsUtc(rangeFrom)[0],
    vnDayBoundsUtc(rangeTo)[1],
  ];

  const needJoin = !!filter.productIds?.length || !!filter.channels?.length;
  const slConds = [
    gte(campaignDailyMetrics.metricDate, rangeFrom),
    lte(campaignDailyMetrics.metricDate, rangeTo),
  ];
  if (filter.campaignIds?.length)
    slConds.push(inArray(campaignDailyMetrics.campaignId, filter.campaignIds));
  if (filter.productIds?.length)
    slConds.push(inArray(campaigns.productId, filter.productIds));
  if (filter.channels?.length)
    slConds.push(inArray(campaigns.channel, filter.channels));

  const spendPromise = needJoin
    ? db
        .select({
          d: campaignDailyMetrics.metricDate,
          spend: sql<number>`coalesce(sum(${campaignDailyMetrics.spend}), 0)`,
        })
        .from(campaignDailyMetrics)
        .innerJoin(campaigns, eq(campaigns.id, campaignDailyMetrics.campaignId))
        .where(and(...slConds))
        .groupBy(campaignDailyMetrics.metricDate)
    : db
        .select({
          d: campaignDailyMetrics.metricDate,
          spend: sql<number>`coalesce(sum(${campaignDailyMetrics.spend}), 0)`,
        })
        .from(campaignDailyMetrics)
        .where(and(...slConds))
        .groupBy(campaignDailyMetrics.metricDate);

  const leadBase = [isNull(leads.deletedAt), isNull(leads.duplicateOf)];
  if (filter.campaignIds?.length)
    leadBase.push(inArray(leads.campaignId, filter.campaignIds));
  if (filter.productIds?.length)
    leadBase.push(inArray(leads.productId, filter.productIds));
  if (filter.sources?.length)
    leadBase.push(inArray(leads.source, filter.sources as any));
  if (filter.assignedTo?.length)
    leadBase.push(inArray(leads.assignedTo, filter.assignedTo));

  const dayExpr = (col: AnyColumn) =>
    sql<string>`(${col} at time zone 'Asia/Ho_Chi_Minh')::date`;

  const mqlPromise = db
    .select({ d: dayExpr(leads.mqlAt), c: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        ...leadBase,
        gte(leads.maxStage, "MQL"),
        gte(leads.mqlAt, startUtc),
        lt(leads.mqlAt, endUtc),
      ),
    )
    .groupBy(dayExpr(leads.mqlAt));

  const wonPromise = db
    .select({ d: dayExpr(leads.wonAt), c: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        ...leadBase,
        eq(leads.outcome, "WON"),
        gte(leads.wonAt, startUtc),
        lt(leads.wonAt, endUtc),
      ),
    )
    .groupBy(dayExpr(leads.wonAt));

  const [spendRows, mqlRows, wonRows] = await Promise.all([
    spendPromise,
    mqlPromise,
    wonPromise,
  ]);

  const bucketOf = (dayStr: string): number => {
    for (let i = weekStarts.length - 1; i >= 0; i--) {
      if (dayStr >= weekStarts[i]) return i;
    }
    return -1;
  };
  const series = weekStarts.map((weekStart) => ({
    weekStart,
    spend: 0,
    mql: 0,
    won: 0,
  }));
  const asDay = (v: unknown): string =>
    v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

  for (const r of spendRows) {
    const i = bucketOf(asDay(r.d));
    if (i >= 0) series[i].spend += n(r.spend);
  }
  for (const r of mqlRows) {
    const i = bucketOf(asDay(r.d));
    if (i >= 0) series[i].mql += n(r.c);
  }
  for (const r of wonRows) {
    const i = bucketOf(asDay(r.d));
    if (i >= 0) series[i].won += n(r.c);
  }
  return series;
}

/**
 * Kỷ luật vận hành theo NGƯỜI, gom nhóm — 2 truy vấn thay vì gọi `getOpsDiscipline`
 * cho từng người. Chỉ trả 3 chỉ số `breakdownByUser` dùng: `leadsAssigned` (lead
 * nhận trong kỳ), `overdueRate` (lead OPEN quá hẹn / lead OPEN — toàn thời gian,
 * khớp `getOpsDiscipline`), `firstResponseRate` (rời NEW trong 24h — theo kỳ nhận).
 */
export async function getOpsDisciplineGrouped(
  db: AnyDb,
  opts: { from: string; to: string; now?: Date },
): Promise<
  Map<
    string,
    {
      leadsAssigned: number;
      overdueRate: number | null;
      firstResponseRate: number | null;
    }
  >
> {
  const today = todayVnDayStr(opts.now);
  const [startUtc, endUtc] = [
    vnDayBoundsUtc(opts.from)[0],
    vnDayBoundsUtc(opts.to)[1],
  ];

  const openOverduePromise = db
    .select({
      g: leads.assignedTo,
      open: sql<number>`count(*) filter (where ${leads.outcome} = 'OPEN')`,
      overdue: sql<number>`count(*) filter (where ${leads.outcome} = 'OPEN' and ${leads.nextContactDate} < ${today}::date)`,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        isNotNull(leads.assignedTo),
      ),
    )
    .groupBy(leads.assignedTo);

  const receivedPromise = db
    .select({
      g: leads.assignedTo,
      total: sql<number>`count(*)`,
      ok: sql<number>`count(*) filter (where exists (
        select 1 from lead_stage_history h
        where h.lead_id = ${leads.id} and h.from_stage = 'NEW'
          and h.changed_at - ${leads.receivedAt} <= interval '24 hours'
      ))`,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        isNotNull(leads.assignedTo),
        gte(leads.receivedAt, startUtc),
        lt(leads.receivedAt, endUtc),
      ),
    )
    .groupBy(leads.assignedTo);

  const [openOverdue, received] = await Promise.all([
    openOverduePromise,
    receivedPromise,
  ]);

  const out = new Map<
    string,
    {
      leadsAssigned: number;
      overdueRate: number | null;
      firstResponseRate: number | null;
    }
  >();
  const ensure = (k: string) => {
    let m = out.get(k);
    if (!m) {
      m = { leadsAssigned: 0, overdueRate: null, firstResponseRate: null };
      out.set(k, m);
    }
    return m;
  };
  for (const r of openOverdue) {
    if (!r.g) continue;
    ensure(r.g).overdueRate = safeDiv(n(r.overdue), n(r.open));
  }
  for (const r of received) {
    if (!r.g) continue;
    const m = ensure(r.g);
    m.leadsAssigned = n(r.total);
    m.firstResponseRate = safeDiv(n(r.ok), n(r.total));
  }
  return out;
}

// ---------------------------------------------------------------------------
//  DERIVED METRICS
// ---------------------------------------------------------------------------

export function deriveMetrics(b: BaseMetrics): DerivedMetrics {
  return {
    cpl: safeDiv(b.spend, b.leads),
    cpmql: safeDiv(b.spend, b.mql),
    cpsql: safeDiv(b.spend, b.sql),
    cac: safeDiv(b.spend, b.won),
    crLeadMql: safeDiv(b.mql, b.leads),
    crMqlSql: safeDiv(b.sql, b.mql),
    crSqlWon: safeDiv(b.won, b.sql),
    crLeadWon: safeDiv(b.won, b.leads),
    roas: safeDiv(b.revenueGross, b.spend),
    aov: safeDiv(b.revenueGross, b.won),
    // SPEC Mục 9.2 — không phải phép chia nên trả số trực tiếp.
    revenueAfterMkt: b.revenueGross - b.spend - b.kolCost,
  };
}

/** Kỳ có kết thúc trong vòng 7 ngày gần đây => dữ liệu chưa chín (SPEC Mục 9.3). */
export function isDataImmature(to: string, now = new Date()): boolean {
  const today = todayVnDayStr(now);
  const diffDays =
    (Date.parse(`${today}T00:00:00${VN_TZ_OFFSET}`) -
      Date.parse(`${to}T00:00:00${VN_TZ_OFFSET}`)) /
    86_400_000;
  return diffDays >= 0 && diffDays < DATA_MATURITY_DAYS;
}

export async function getMetrics(
  db: AnyDb,
  filter: MetricsFilter,
): Promise<FullMetrics> {
  const base = await getBaseMetrics(db, filter);
  const derived = deriveMetrics(base);
  return {
    ...base,
    ...derived,
    filter,
    dataImmature: isDataImmature(filter.to),
  };
}

// ---------------------------------------------------------------------------
//  CHỈ SỐ KỶ LUẬT VẬN HÀNH — SPEC Mục 9.6
// ---------------------------------------------------------------------------

export interface OpsDisciplineMetrics {
  overdueLeads: number;
  openLeads: number;
  overdueRate: number | null;
  avgOverdueDays: number | null;
  noNextDateRate: number | null;
  firstResponseRate: number | null;
  dailyClearRate: number | null;
  dataEntryCompliance: number | null;
}

export async function getOpsDiscipline(
  db: AnyDb,
  opts: { assignedTo?: string[]; from?: string; to?: string; now?: Date } = {},
): Promise<OpsDisciplineMetrics> {
  const today = todayVnDayStr(opts.now);
  const assignCond = opts.assignedTo?.length
    ? [inArray(leads.assignedTo, opts.assignedTo)]
    : [];
  const openBase = [
    isNull(leads.deletedAt),
    isNull(leads.duplicateOf),
    eq(leads.outcome, "OPEN"),
    ...assignCond,
  ];

  const [openRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(and(...openBase));

  const [overdueRow] = await db
    .select({
      c: sql`count(*)`,
      avgDays: sql`avg(${today}::date - ${leads.nextContactDate})`,
    })
    .from(leads)
    .where(
      and(...openBase, sql`${leads.nextContactDate} < ${today}::date`),
    );

  // no_next_date_rate: OPEN + đã có >=1 interaction + thiếu next_contact_date
  const [withInteractionRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...openBase,
        sql`exists (select 1 from ${leadInteractions} li where li.lead_id = ${leads.id})`,
      ),
    );
  const [missingNextRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...openBase,
        isNull(leads.nextContactDate),
        sql`exists (select 1 from ${leadInteractions} li where li.lead_id = ${leads.id})`,
      ),
    );

  // daily_clear_rate: đến hẹn hôm nay đã được xử lý / tổng đến hẹn hôm nay
  const [dueTodayRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(and(...openBase, sql`${leads.nextContactDate} = ${today}::date`));
  const [clearedTodayRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        ...openBase,
        sql`${leads.nextContactDate} = ${today}::date`,
        sql`exists (
          select 1 from ${leadInteractions} li
          where li.lead_id = ${leads.id}
            and (li.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date
        )`,
      ),
    );

  const overdueLeads = n(overdueRow?.c);
  const openLeads = n(openRow?.c);
  const withInteraction = n(withInteractionRow?.c);
  const missingNext = n(missingNextRow?.c);
  const dueToday = n(dueTodayRow?.c);
  const clearedToday = n(clearedTodayRow?.c);

  return {
    overdueLeads,
    openLeads,
    overdueRate: safeDiv(overdueLeads, openLeads),
    avgOverdueDays: overdueRow?.avgDays == null ? null : n(overdueRow.avgDays),
    noNextDateRate: safeDiv(missingNext, withInteraction),
    firstResponseRate:
      opts.from && opts.to
        ? await getFirstResponseRate(db, opts.from, opts.to, opts.assignedTo)
        : null,
    dailyClearRate: safeDiv(clearedToday, dueToday),
    dataEntryCompliance:
      opts.from && opts.to
        ? await getDataEntryCompliance(db, opts.from, opts.to)
        : null,
  };
}

/** Tỷ lệ lead rời NEW trong vòng 24h — SPEC Mục 9.6. */
export async function getFirstResponseRate(
  db: AnyDb,
  from: string,
  to: string,
  assignedTo?: string[],
): Promise<number | null> {
  const [startUtc, endUtc] = [vnDayBoundsUtc(from)[0], vnDayBoundsUtc(to)[1]];
  const assignCond = assignedTo?.length
    ? [inArray(leads.assignedTo, assignedTo)]
    : [];
  const [totalRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        gte(leads.receivedAt, startUtc),
        lt(leads.receivedAt, endUtc),
        ...assignCond,
      ),
    );
  const [okRow] = await db
    .select({ c: sql`count(*)` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        gte(leads.receivedAt, startUtc),
        lt(leads.receivedAt, endUtc),
        ...assignCond,
        sql`exists (
          select 1 from lead_stage_history h
          where h.lead_id = ${leads.id} and h.from_stage = 'NEW'
            and h.changed_at - ${leads.receivedAt} <= interval '24 hours'
        )`,
      ),
    );
  return safeDiv(n(okRow?.c), n(totalRow?.c));
}

/** Số ngày Marketing nhập đủ số liệu / tổng số ngày trong kỳ — SPEC Mục 9.6. */
export async function getDataEntryCompliance(
  db: AnyDb,
  from: string,
  to: string,
): Promise<number | null> {
  const rows = await db.execute<{ compliant: number; total: number }>(sql`
    with days as (
      select generate_series(${from}::date, ${to}::date, interval '1 day')::date as d
    ),
    on_counts as (
      select d.d,
        (select count(*) from campaigns c
          where c.deleted_at is null
            and c.started_on <= d.d
            and (c.ended_on is null or c.ended_on >= d.d)
            and c.status = 'ON') as on_campaigns,
        (select count(distinct m.campaign_id) from campaign_daily_metrics m
          where m.metric_date = d.d) as entered
      from days d
    )
    select
      count(*) filter (where on_campaigns > 0 and entered >= on_campaigns) as compliant,
      count(*) filter (where on_campaigns > 0) as total
    from on_counts
  `);
  const r = normalizeExecRows<{ compliant: number; total: number }>(rows)[0];
  if (!r) return null;
  return safeDiv(n(r.compliant), n(r.total));
}

// ---------------------------------------------------------------------------
//  CẢNH BÁO CAMPAIGN — SPEC Mục 9.4 (R1..R5)
// ---------------------------------------------------------------------------

export type CampaignAlertRule = "R1" | "R2" | "R3" | "R4" | "R5";
export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface CampaignAlert {
  campaignId: string;
  internalCode: string;
  displayName: string;
  rule: CampaignAlertRule;
  severity: AlertSeverity;
  label: string;
  detail: string;
  cpmqlRolling: number | null;
  targetCpmql: number;
  spendLifetime: number;
  mqlLifetime: number;
}

export async function evaluateCampaignAlerts(
  db: AnyDb,
  now = new Date(),
): Promise<CampaignAlert[]> {
  const today = todayVnDayStr(now);
  const rollingFrom = localDayStr(
    new Date(Date.parse(`${today}T00:00:00${VN_TZ_OFFSET}`) -
      (ROLLING_WINDOW_DAYS - 1) * 86_400_000),
  );

  const activeCampaigns = await db
    .select({
      id: campaigns.id,
      internalCode: campaigns.internalCode,
      displayName: campaigns.displayName,
      startedOn: campaigns.startedOn,
      targetCpmql: products.targetCpmql,
      killThreshold: products.killThresholdNoMql,
    })
    .from(campaigns)
    .innerJoin(products, eq(products.id, campaigns.productId))
    .where(and(eq(campaigns.status, "ON"), isNull(campaigns.deletedAt)));

  const alerts: CampaignAlert[] = [];

  for (const c of activeCampaigns) {
    const target = n(c.targetCpmql) || 600000;
    const kill = n(c.killThreshold) || 900000;

    const [lifeRow] = await db
      .select({ spend: sql`coalesce(sum(${campaignDailyMetrics.spend}),0)` })
      .from(campaignDailyMetrics)
      .where(
        and(
          eq(campaignDailyMetrics.campaignId, c.id),
          gte(campaignDailyMetrics.metricDate, c.startedOn),
          lte(campaignDailyMetrics.metricDate, today),
        ),
      );
    const spendLifetime = n(lifeRow?.spend);

    const [mqlLifeRow] = await db
      .select({ c: sql`count(*)` })
      .from(leads)
      .where(
        and(
          eq(leads.campaignId, c.id),
          isNull(leads.deletedAt),
          isNull(leads.duplicateOf),
          gte(leads.maxStage, "MQL"),
          sql`${leads.mqlAt} is not null`,
          sql`${leads.mqlAt} - ${leads.receivedAt} <= interval '${sql.raw(
            String(ATTRIBUTION_WINDOW_DAYS),
          )} days'`,
        ),
      );
    const mqlLifetime = n(mqlLifeRow?.c);

    const rolling = await getBaseMetrics(db, {
      from: rollingFrom,
      to: today,
      campaignIds: [c.id],
      campaignAttribution: true,
    });
    const cpmqlRolling = safeDiv(rolling.spend, rolling.mql);

    // R4 — thiếu metric 3 ngày liên tiếp gần nhất
    const missing3 = await hasMissingMetricStreak(db, c.id, today, 3);

    const push = (
      rule: CampaignAlertRule,
      severity: AlertSeverity,
      label: string,
      detail: string,
    ) =>
      alerts.push({
        campaignId: c.id,
        internalCode: c.internalCode,
        displayName: c.displayName,
        rule,
        severity,
        label,
        detail,
        cpmqlRolling,
        targetCpmql: target,
        spendLifetime,
        mqlLifetime,
      });

    if (mqlLifetime === 0 && spendLifetime >= kill) {
      push(
        "R1",
        "CRITICAL",
        "Đề xuất KILL",
        `Chưa có MQL nào, spend tích lũy ${Math.round(spendLifetime).toLocaleString(
          "vi-VN",
        )}đ ≥ ngưỡng kill ${kill.toLocaleString("vi-VN")}đ.`,
      );
    } else if (rolling.mql >= 1 && cpmqlRolling !== null && cpmqlRolling > target * 1.5) {
      push(
        "R2",
        "CRITICAL",
        "Đề xuất KILL",
        `CPMQL 14 ngày ${Math.round(cpmqlRolling).toLocaleString("vi-VN")}đ > 1,5× target (${target.toLocaleString(
          "vi-VN",
        )}đ).`,
      );
    } else if (rolling.mql >= 1 && cpmqlRolling !== null && cpmqlRolling > target) {
      push(
        "R3",
        "WARNING",
        "Cần tối ưu",
        `CPMQL 14 ngày ${Math.round(cpmqlRolling).toLocaleString("vi-VN")}đ > target ${target.toLocaleString(
          "vi-VN",
        )}đ.`,
      );
    } else if (cpmqlRolling !== null && cpmqlRolling <= target * 0.7 && rolling.mql >= 1) {
      push(
        "R5",
        "INFO",
        "Đang tốt",
        `CPMQL 14 ngày ${Math.round(cpmqlRolling).toLocaleString("vi-VN")}đ ≤ 0,7× target — cân nhắc tăng ngân sách ngày.`,
      );
    }

    if (missing3) {
      push(
        "R4",
        "WARNING",
        "Thiếu dữ liệu",
        "Campaign đang ON nhưng 3 ngày gần nhất không có số liệu ads.",
      );
    }
  }

  const order: Record<AlertSeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
  };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

async function hasMissingMetricStreak(
  db: AnyDb,
  campaignId: string,
  today: string,
  days: number,
): Promise<boolean> {
  const fromDay = addDaysStr(today, -(days - 1));
  const rows = await db.execute<{ present: number }>(sql`
    with d as (
      select generate_series(${fromDay}::date, ${today}::date, interval '1 day')::date as day
    )
    select count(m.id)::int as present
    from d
    left join campaign_daily_metrics m
      on m.campaign_id = ${campaignId} and m.metric_date = d.day
  `);
  const r = normalizeExecRows<{ present: number }>(rows)[0];
  return n(r?.present) === 0;
}

/** postgres-js trả mảng, pglite trả {rows}. Chuẩn hóa về mảng. */
function normalizeExecRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && "rows" in res)
    return (res as { rows: T[] }).rows;
  return [];
}

// ---------------------------------------------------------------------------
//  FORMULA REGISTRY — kpi_definitions.formula_key trỏ vào đây (SPEC Mục 7.10)
// ---------------------------------------------------------------------------

export type FormulaKey =
  | "spend"
  | "leads"
  | "mql"
  | "sql"
  | "won"
  | "hvm"
  | "revenue_gross"
  | "revenue_net"
  | "cash_collected"
  | "cpl"
  | "cpmql"
  | "cpsql"
  | "cac"
  | "roas"
  | "aov"
  | "revenue_after_mkt"
  | "daily_clear_rate"
  | "data_entry_compliance"
  | "first_response_rate"
  | "overdue_rate"
  | "task_completion"; // TODO Phase 3: tính từ bảng tasks

/**
 * Trả về giá trị thực tế của một KPI cho một phạm vi. Dashboard & màn hình KPI
 * đều gọi hàm này — không tự tính lại.
 */
export async function computeKpiActual(
  db: AnyDb,
  formulaKey: FormulaKey,
  filter: MetricsFilter,
): Promise<number | null> {
  switch (formulaKey) {
    case "spend":
    case "leads":
    case "mql":
    case "sql":
    case "won":
    case "hvm":
    case "revenue_gross":
    case "revenue_net":
    case "cash_collected": {
      const b = await getBaseMetrics(db, filter);
      const map: Record<string, number> = {
        spend: b.spend,
        leads: b.leads,
        mql: b.mql,
        sql: b.sql,
        won: b.won,
        hvm: b.hvm,
        revenue_gross: b.revenueGross,
        revenue_net: b.revenueNet,
        cash_collected: b.cashCollected,
      };
      return map[formulaKey];
    }
    case "cpl":
    case "cpmql":
    case "cpsql":
    case "cac":
    case "roas":
    case "aov":
    case "revenue_after_mkt": {
      const b = await getBaseMetrics(db, filter);
      const d = deriveMetrics(b);
      const map: Record<string, number | null> = {
        cpl: d.cpl,
        cpmql: d.cpmql,
        cpsql: d.cpsql,
        cac: d.cac,
        roas: d.roas,
        aov: d.aov,
        revenue_after_mkt: d.revenueAfterMkt,
      };
      return map[formulaKey];
    }
    case "daily_clear_rate":
    case "data_entry_compliance":
    case "first_response_rate":
    case "overdue_rate": {
      const ops = await getOpsDiscipline(db, {
        assignedTo: filter.assignedTo,
        from: filter.from,
        to: filter.to,
      });
      const map: Record<string, number | null> = {
        daily_clear_rate: ops.dailyClearRate,
        data_entry_compliance: ops.dataEntryCompliance,
        first_response_rate: ops.firstResponseRate,
        overdue_rate: ops.overdueRate,
      };
      return map[formulaKey];
    }
    case "task_completion": {
      // Task DONE / tổng task (không tính đã xóa/hủy) — SPEC Mục 14.2.
      const conds = [
        sql`t.deleted_at is null`,
        sql`t.status <> 'CANCELLED'`,
        sql`t.due_date >= ${filter.from} and t.due_date <= ${filter.to}`,
      ];
      if (filter.assignedTo?.length)
        conds.push(
          sql`t.assignee_id in (${sql.join(
            filter.assignedTo.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      const [row] = await db.execute<{ done: number; total: number }>(sql`
        select count(*) filter (where t.status = 'DONE')::int as done,
               count(*)::int as total
        from tasks t
        where ${sql.join(conds, sql` and `)}
      `).then((r) => (Array.isArray(r) ? r : (r as { rows: { done: number; total: number }[] }).rows));
      return safeDiv(n(row?.done), n(row?.total));
    }
    default:
      return null;
  }
}

// re-export cho tiện dùng ở nơi khác
export type { AnyDb as MetricsDb };
