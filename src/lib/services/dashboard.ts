/**
 * dashboard.ts — TỔNG HỢP cho Dashboard (SPEC Mục 12).
 *
 * QUAN TRỌNG: file này KHÔNG định nghĩa công thức mới. Nó chỉ gọi lại
 * getBaseMetrics / deriveMetrics / getOpsDiscipline / evaluateCampaignAlerts
 * trong metrics.ts (nguồn công thức duy nhất) rồi gom nhóm / so sánh / xếp chuỗi.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import {
  appSettings,
  campaigns,
  leadInteractions,
  leads,
  products,
  tasks,
  users,
} from "@/lib/db/schema";
import {
  addDaysStr,
  monthBounds,
  quarterBounds,
  todayVnDayStr,
  vnDayBoundsUtc,
} from "@/lib/time";
import {
  deriveMetrics,
  getBaseMetrics,
  getBaseMetricsGrouped,
  getOpsDisciplineGrouped,
  getTrendSeries,
  safeDiv,
  type AnyDb,
  type BaseMetrics,
  type DerivedMetrics,
  type MetricsFilter,
} from "./metrics";

const ZERO_BASE: BaseMetrics = {
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
  const cmp = comparePeriod(filter.from, filter.to, compareMode);
  const [cur, cmpBase] = await Promise.all([
    getBaseMetrics(db, filter),
    cmp
      ? getBaseMetrics(db, { ...filter, from: cmp.from, to: cmp.to })
      : Promise.resolve(null),
  ]);
  const curAll = { ...cur, ...deriveMetrics(cur) };
  const cmpAll: (BaseMetrics & DerivedMetrics) | null = cmpBase
    ? { ...cmpBase, ...deriveMetrics(cmpBase) }
    : null;

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

  // 1 truy vấn GROUP BY / bảng nguồn thay vì N lần gọi getBaseMetrics.
  const grouped = await getBaseMetricsGrouped(db, filter, "product");
  const rows: BreakdownRow[] = list.map((p) => {
    const b = grouped.get(p.id) ?? ZERO_BASE;
    return {
      key: p.id,
      label: `${p.code} — ${p.name}`,
      metrics: { ...b, ...deriveMetrics(b) },
    };
  });
  const totalSpend = rows.reduce((s, r) => s + r.metrics.spend, 0);

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
  // 1 lượt GROUP BY (áp cửa sổ quy kết 90 ngày cho mql/sql) — keys = campaign có
  // dữ liệu trong kỳ. Không còn fan-out getBaseMetrics theo từng campaign.
  const grouped = await getBaseMetricsGrouped(
    db,
    { ...filter, campaignAttribution: true },
    "campaign",
  );
  if (grouped.size === 0) return [];

  const list = await db
    .select({ id: campaigns.id, displayName: campaigns.displayName })
    .from(campaigns)
    .where(
      and(isNull(campaigns.deletedAt), inArray(campaigns.id, [...grouped.keys()])),
    );

  const rows: BreakdownRow[] = list
    .map((c) => {
      const b = grouped.get(c.id) ?? ZERO_BASE;
      return {
        key: c.id,
        label: c.displayName,
        metrics: { ...b, ...deriveMetrics(b) },
      };
    })
    .filter((r) => !(r.metrics.spend === 0 && r.metrics.mql === 0));
  rows.sort((a, b) => b.metrics.spend - a.metrics.spend);
  return rows.slice(0, limit);
}

/**
 * Grouped: phiên chăm sóc (lead_interactions trong kỳ) + tiến độ task (due_date
 * trong kỳ) theo người. Cho bảng "Tiến độ đội" (Gói M).
 */
async function getTeamAux(
  db: AnyDb,
  opts: { from: string; to: string },
): Promise<
  Map<
    string,
    { careSessions: number; taskDone: number; taskTotal: number; taskOverdue: number }
  >
> {
  const today = todayVnDayStr();
  const [startUtc, endUtc] = [
    vnDayBoundsUtc(opts.from)[0],
    vnDayBoundsUtc(opts.to)[1],
  ];
  const [careRows, taskRows] = await Promise.all([
    db
      .select({ g: leads.assignedTo, c: sql<number>`count(*)` })
      .from(leadInteractions)
      .innerJoin(leads, eq(leads.id, leadInteractions.leadId))
      .where(
        and(
          isNull(leads.deletedAt),
          isNull(leads.duplicateOf),
          isNotNull(leads.assignedTo),
          gte(leadInteractions.occurredAt, startUtc),
          lt(leadInteractions.occurredAt, endUtc),
        ),
      )
      .groupBy(leads.assignedTo),
    db
      .select({
        g: tasks.assigneeId,
        done: sql<number>`count(*) filter (where ${tasks.status} = 'DONE')`,
        total: sql<number>`count(*)`,
        overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today}::date and ${tasks.status} <> 'DONE')`,
      })
      .from(tasks)
      .where(
        and(
          isNull(tasks.deletedAt),
          sql`${tasks.status} <> 'CANCELLED'`,
          gte(tasks.dueDate, opts.from),
          lte(tasks.dueDate, opts.to),
        ),
      )
      .groupBy(tasks.assigneeId),
  ]);

  const m = new Map<
    string,
    { careSessions: number; taskDone: number; taskTotal: number; taskOverdue: number }
  >();
  const ensure = (k: string) => {
    let v = m.get(k);
    if (!v) {
      v = { careSessions: 0, taskDone: 0, taskTotal: 0, taskOverdue: 0 };
      m.set(k, v);
    }
    return v;
  };
  for (const r of careRows) if (r.g) ensure(r.g).careSessions = Number(r.c);
  for (const r of taskRows) {
    if (!r.g) continue;
    const v = ensure(r.g);
    v.taskDone = Number(r.done);
    v.taskTotal = Number(r.total);
    v.taskOverdue = Number(r.overdue);
  }
  return m;
}

/** Theo nhân sự — phễu + kỷ luật + tiến độ công việc (SPEC 12.5, "Tiến độ đội"). */
export async function breakdownByUser(
  db: AnyDb,
  filter: MetricsFilter,
): Promise<
  (BreakdownRow & {
    leadsAssigned: number;
    crMqlWon: number | null;
    overdueRate: number | null;
    firstResponseRate: number | null;
    careSessions: number;
    taskDone: number;
    taskTotal: number;
    taskOverdue: number;
  })[]
> {
  const [ecs, funnel, ops, aux] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          sql`${users.role} in ('EC','MANAGER','ADMIN','MARKETING')`,
        ),
      ),
    getBaseMetricsGrouped(db, filter, "assignee"),
    getOpsDisciplineGrouped(db, { from: filter.from, to: filter.to }),
    getTeamAux(db, { from: filter.from, to: filter.to }),
  ]);

  const out = ecs
    .map((u) => {
      const b = funnel.get(u.id) ?? ZERO_BASE;
      const o = ops.get(u.id) ?? {
        leadsAssigned: 0,
        overdueRate: null,
        firstResponseRate: null,
      };
      const a = aux.get(u.id) ?? {
        careSessions: 0,
        taskDone: 0,
        taskTotal: 0,
        taskOverdue: 0,
      };
      if (
        o.leadsAssigned === 0 &&
        b.mql === 0 &&
        b.won === 0 &&
        a.taskTotal === 0 &&
        a.careSessions === 0
      )
        return null;
      return {
        key: u.id,
        label: u.fullName,
        metrics: { ...b, ...deriveMetrics(b) },
        leadsAssigned: o.leadsAssigned,
        crMqlWon: safeDiv(b.won, b.mql),
        overdueRate: o.overdueRate,
        firstResponseRate: o.firstResponseRate,
        ...a,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
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
  // Tuần báo cáo VMG: bắt đầu Thứ 7 (T7 tuần trước → T6 tuần này).
  const endDow = new Date(`${end}T00:00:00Z`).getUTCDay(); // 0=CN … 6=T7
  const satOffset = (endDow + 1) % 7; // T7->0, CN->1, … T6->6
  const weekStart = addDaysStr(end, -satOffset);

  const starts: string[] = [];
  for (let i = 0; i < weeks; i++) {
    starts.unshift(addDaysStr(weekStart, -7 * i));
  }

  // 3 truy vấn cho cả 12 tuần thay vì 12 × getBaseMetrics.
  const series = await getTrendSeries(db, starts, opts.filter ?? {});
  return series.map((p) => ({
    weekStart: p.weekStart,
    spend: p.spend,
    mql: p.mql,
    won: p.won,
    cpmql: safeDiv(p.spend, p.mql),
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
