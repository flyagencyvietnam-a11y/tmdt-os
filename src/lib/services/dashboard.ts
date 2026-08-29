/**
 * dashboard.ts — TỔNG HỢP cho Dashboard (SPEC Mục 12).
 *
 * QUAN TRỌNG: file này KHÔNG định nghĩa công thức mới. Nó chỉ gọi lại
 * getBaseMetrics / deriveMetrics / getOpsDiscipline / evaluateCampaignAlerts
 * trong metrics.ts (nguồn công thức duy nhất) rồi gom nhóm / so sánh / xếp chuỗi.
 */
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  appSettings,
  campaigns,
  leads,
  products,
  users,
} from "@/lib/db/schema";
import {
  addDaysStr,
  monthBounds,
  quarterBounds,
  vnDayBoundsUtc,
} from "@/lib/time";
import {
  deriveMetrics,
  getBaseMetrics,
  getOpsDiscipline,
  safeDiv,
  type AnyDb,
  type BaseMetrics,
  type DerivedMetrics,
  type MetricsFilter,
} from "./metrics";

// ---------------------------------------------------------------------------
//  Kỳ so sánh (SPEC Mục 12.2)
// ---------------------------------------------------------------------------

export type CompareMode = "prev" | "yoy" | "none";

export function comparePeriod(
  from: string,
  to: string,
  mode: CompareMode,
): { from: string; to: string } | null {
  if (mode === "none") return null;
  if (mode === "yoy") {
    return { from: shiftYear(from, -1), to: shiftYear(to, -1) };
  }
  // prev: kỳ liền trước cùng độ dài
  const [s] = vnDayBoundsUtc(from);
  const [e] = vnDayBoundsUtc(to);
  const lenDays = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return { from: addDaysStr(from, -lenDays), to: addDaysStr(to, -lenDays) };
}

function shiftYear(dayStr: string, delta: number): string {
  const [y, m, d] = dayStr.split("-").map(Number);
  return `${y + delta}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface MetricWithDelta {
  value: number;
  prev: number | null;
  deltaPct: number | null; // (value - prev) / prev
}

function withDelta(value: number, prev: number | null): MetricWithDelta {
  return {
    value,
    prev,
    deltaPct: prev == null || prev === 0 ? null : (value - prev) / prev,
  };
}

// ---------------------------------------------------------------------------
//  Tầng 2 — Sức khỏe (SPEC Mục 12.4)
// ---------------------------------------------------------------------------

export interface HealthMetrics {
  current: BaseMetrics & DerivedMetrics;
  compare: (BaseMetrics & DerivedMetrics) | null;
  tiles: Record<string, MetricWithDelta>;
}

export async function getHealth(
  db: AnyDb,
  filter: MetricsFilter,
  compareMode: CompareMode,
): Promise<HealthMetrics> {
  const cur = await getBaseMetrics(db, filter);
  const curAll = { ...cur, ...deriveMetrics(cur) };

  const cmp = comparePeriod(filter.from, filter.to, compareMode);
  let cmpAll: (BaseMetrics & DerivedMetrics) | null = null;
  if (cmp) {
    const c = await getBaseMetrics(db, { ...filter, from: cmp.from, to: cmp.to });
    cmpAll = { ...c, ...deriveMetrics(c) };
  }

  const t = (k: keyof (BaseMetrics & DerivedMetrics)) =>
    withDelta(Number(curAll[k] ?? 0), cmpAll ? Number(cmpAll[k] ?? 0) : null);

  return {
    current: curAll,
    compare: cmpAll,
    tiles: {
      spend: t("spend"),
      leads: t("leads"),
      mql: t("mql"),
      sql: t("sql"),
      won: t("won"),
      revenueGross: t("revenueGross"),
      cpmql: t("cpmql"),
      cac: t("cac"),
      roas: t("roas"),
    },
  };
}

// ---------------------------------------------------------------------------
//  Tầng 3 — Bóc tách (SPEC Mục 12.5)
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  key: string;
  label: string;
  metrics: BaseMetrics & DerivedMetrics;
}

/** Theo sản phẩm + đối chiếu % ngân sách thực tế vs phân bổ đã duyệt. */
export async function breakdownByProduct(
  db: AnyDb,
  filter: MetricsFilter,
): Promise<{
  rows: (BreakdownRow & { budgetSharePlanPct: number | null; budgetShareActualPct: number | null })[];
  totalSpend: number;
}> {
  const list = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      budgetSharePct: products.budgetSharePct,
    })
    .from(products)
    .orderBy(products.sortOrder);

  const planRow = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "budget_share_plan"));
  const plan = (planRow[0]?.value ?? {}) as Record<string, number>;

  const rows: BreakdownRow[] = [];
  let totalSpend = 0;
  for (const p of list) {
    const b = await getBaseMetrics(db, { ...filter, productIds: [p.id] });
    totalSpend += b.spend;
    rows.push({
      key: p.id,
      label: `${p.code} — ${p.name}`,
      metrics: { ...b, ...deriveMetrics(b) },
    });
  }

  const enriched = rows.map((r) => {
    const p = list.find((x) => x.id === r.key)!;
    const planPct =
      plan[p.code] ?? (p.budgetSharePct ? Number(p.budgetSharePct) : null);
    const actualPct =
      totalSpend > 0 ? (r.metrics.spend / totalSpend) * 100 : null;
    return {
      ...r,
      budgetSharePlanPct: planPct,
      budgetShareActualPct: actualPct,
    };
  });

  return { rows: enriched.filter((r) => r.metrics.spend > 0 || r.metrics.leadsRecorded > 0), totalSpend };
}

/** Theo campaign — top N theo spend (SPEC 12.5). */
export async function breakdownByCampaign(
  db: AnyDb,
  filter: MetricsFilter,
  limit = 20,
): Promise<BreakdownRow[]> {
  const list = await db
    .select({
      id: campaigns.id,
      internalCode: campaigns.internalCode,
      displayName: campaigns.displayName,
    })
    .from(campaigns)
    .where(isNull(campaigns.deletedAt));

  const rows: BreakdownRow[] = [];
  for (const c of list) {
    const b = await getBaseMetrics(db, {
      ...filter,
      campaignIds: [c.id],
      campaignAttribution: true,
    });
    if (b.spend === 0 && b.mql === 0) continue;
    rows.push({
      key: c.id,
      label: c.displayName,
      metrics: { ...b, ...deriveMetrics(b) },
    });
  }
  rows.sort((a, b) => b.metrics.spend - a.metrics.spend);
  return rows.slice(0, limit);
}

/** Theo nhân sự (E-Commerce Executive) — SPEC 12.5. */
export async function breakdownByUser(
  db: AnyDb,
  filter: MetricsFilter,
): Promise<
  (BreakdownRow & {
    leadsAssigned: number;
    crMqlWon: number | null;
    overdueRate: number | null;
    firstResponseRate: number | null;
  })[]
> {
  const ecs = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.isActive, true), sql`${users.role} in ('EC','MANAGER','ADMIN')`));

  const [startUtc, endUtc] = [
    vnDayBoundsUtc(filter.from)[0],
    vnDayBoundsUtc(filter.to)[1],
  ];

  const out = [];
  for (const u of ecs) {
    const b = await getBaseMetrics(db, { ...filter, assignedTo: [u.id] });
    if (
      b.mql === 0 &&
      b.won === 0 &&
      b.revenueGross === 0
    ) {
      // vẫn có thể có lead được giao — kiểm tra trước khi bỏ
    }
    const [assignedRow] = await db
      .select({ c: sql<number>`count(*)` })
      .from(leads)
      .where(
        and(
          eq(leads.assignedTo, u.id),
          isNull(leads.deletedAt),
          isNull(leads.duplicateOf),
          gte(leads.receivedAt, startUtc),
          lt(leads.receivedAt, endUtc),
        ),
      );
    const leadsAssigned = Number(assignedRow?.c ?? 0);
    if (
      leadsAssigned === 0 &&
      b.mql === 0 &&
      b.won === 0
    )
      continue;

    const ops = await getOpsDiscipline(db, {
      assignedTo: [u.id],
      from: filter.from,
      to: filter.to,
    });

    out.push({
      key: u.id,
      label: u.fullName,
      metrics: { ...b, ...deriveMetrics(b) },
      leadsAssigned,
      crMqlWon: safeDiv(b.won, b.mql),
      overdueRate: ops.overdueRate,
      firstResponseRate: ops.firstResponseRate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Xu hướng theo tuần (SPEC 12.5) + Cohort (SPEC 12.5)
// ---------------------------------------------------------------------------

export interface WeekPoint {
  weekStart: string;
  spend: number;
  mql: number;
  won: number;
  cpmql: number | null;
}

export async function weeklyTrend(
  db: AnyDb,
  opts: { weeks?: number; end?: string; filter?: Partial<MetricsFilter> } = {},
): Promise<WeekPoint[]> {
  const weeks = opts.weeks ?? 12;
  const end = opts.end ?? new Date().toISOString().slice(0, 10);
  // tuần bắt đầu Thứ Hai
  const endDow = new Date(`${end}T00:00:00Z`).getUTCDay(); // 0=CN
  const mondayOffset = endDow === 0 ? 6 : endDow - 1;
  let weekStart = addDaysStr(end, -mondayOffset);

  const starts: string[] = [];
  for (let i = 0; i < weeks; i++) {
    starts.unshift(addDaysStr(weekStart, -7 * i));
  }
  weekStart = starts[0];

  const points: WeekPoint[] = [];
  for (const ws of starts) {
    const we = addDaysStr(ws, 6);
    const b = await getBaseMetrics(db, {
      ...(opts.filter as MetricsFilter),
      from: ws,
      to: we,
    });
    points.push({
      weekStart: ws,
      spend: b.spend,
      mql: b.mql,
      won: b.won,
      cpmql: safeDiv(b.spend, b.mql),
    });
  }
  return points;
}

export interface CohortRow {
  month: string; // YYYY-MM
  totalLeads: number;
  buckets: number[]; // [0-7, 8-30, 31-60, 61-90, >90] số lead chốt trong khoảng
}

/**
 * Cohort theo tháng tiếp nhận: bao lâu sau khi vào phễu thì khách chốt.
 * SPEC Mục 12.5 — "thông tin phòng chưa từng có".
 */
export async function cohortByReceiptMonth(
  db: AnyDb,
  opts: { months?: number; end?: string } = {},
): Promise<CohortRow[]> {
  const months = opts.months ?? 6;
  const end = opts.end ?? new Date().toISOString().slice(0, 10);
  type Raw = {
    month: string;
    total: number;
    b0: number;
    b1: number;
    b2: number;
    b3: number;
    b4: number;
  };
  const rows = await db.execute<Raw>(sql`
    with base as (
      select
        to_char((received_at at time zone 'Asia/Ho_Chi_Minh'), 'YYYY-MM') as month,
        case when won_at is not null
          then floor(extract(epoch from (won_at - received_at)) / 86400)
          else null end as days_to_won
      from leads
      where deleted_at is null and duplicate_of is null
        and received_at >= (date_trunc('month', ${end}::date) - (${months - 1} || ' months')::interval)
    )
    select month,
      count(*)::int as total,
      count(*) filter (where days_to_won between 0 and 7)::int as b0,
      count(*) filter (where days_to_won between 8 and 30)::int as b1,
      count(*) filter (where days_to_won between 31 and 60)::int as b2,
      count(*) filter (where days_to_won between 61 and 90)::int as b3,
      count(*) filter (where days_to_won > 90)::int as b4
    from base
    group by month
    order by month
  `);
  const arr: Raw[] = Array.isArray(rows)
    ? (rows as Raw[])
    : (((rows as { rows: Raw[] }).rows ?? []) as Raw[]);
  return arr.map((r) => ({
    month: r.month,
    totalLeads: Number(r.total),
    buckets: [r.b0, r.b1, r.b2, r.b3, r.b4].map(Number),
  }));
}

// ---------------------------------------------------------------------------
//  Tầng 1 — Cần hành động (SPEC Mục 12.3): các đếm số nhanh cho thẻ
// ---------------------------------------------------------------------------

export async function getActionCounts(
  db: AnyDb,
  now = new Date(),
): Promise<{
  overdueLeads: number;
  newLeadsStale: number; // stage NEW > 24h (V12)
  leadsMissingNextDate: number; // OPEN + có interaction + thiếu next_contact_date (V01)
}> {
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - 24 * 3600_000);

  const [a] = await db
    .select({ c: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        eq(leads.outcome, "OPEN"),
        lt(leads.nextContactDate, today),
      ),
    );
  const [b] = await db
    .select({ c: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        eq(leads.stage, "NEW"),
        lt(leads.receivedAt, cutoff),
      ),
    );
  const [c] = await db
    .select({ c: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        eq(leads.outcome, "OPEN"),
        isNull(leads.nextContactDate),
        sql`exists (select 1 from lead_interactions li where li.lead_id = ${leads.id})`,
      ),
    );

  return {
    overdueLeads: Number(a?.c ?? 0),
    newLeadsStale: Number(b?.c ?? 0),
    leadsMissingNextDate: Number(c?.c ?? 0),
  };
}

export { monthBounds, quarterBounds };
