import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { products as productsTable } from "@/lib/db/schema";
import {
  breakdownByCampaign,
  breakdownByProduct,
  breakdownByUser,
  comparePeriod,
  getActionCounts,
  weeklyTrend,
} from "@/lib/services/dashboard";
import { evaluateCampaignAlerts, type MetricsFilter } from "@/lib/services/metrics";
import {
  fmtCompact,
  fmtInt,
  fmtPct,
  fmtRatioX,
  fmtVnd,
} from "@/lib/format";
import { getBaseMetrics } from "@/lib/services/metrics";
import { getKpiProgressForPeriod } from "@/lib/services/kpi";
import { quarterBounds, resolveRange, todayVnDayStr } from "@/lib/time";
import { DashboardFilters } from "./dashboard-filters";
import { TeamProgressTable } from "./team-progress-table";
import {
  getBreakdownsCached,
  getHealthBundleCached,
  getKpiFollowCached,
} from "./dashboard-cache";
import { RunJobsButton } from "./run-jobs-button";
import { TrendChart } from "./trend-chart";
import { ReportExport } from "./report-export";
import { ViewerDashboard } from "./viewer-dashboard";

async function loadViewerData() {
  const today = todayVnDayStr();
  const [qs, qe] = quarterBounds(today);
  const qLabel = `${qs.slice(0, 4)}-Q${
    Math.floor((Number(qs.slice(5, 7)) - 1) / 3) + 1
  }`;
  const qFilter = { from: qs, to: qe };
  try {
    const [b, bp, tr, kpis, bu] = await Promise.all([
      getBaseMetrics(db, qFilter),
      breakdownByProduct(db, qFilter),
      weeklyTrend(db, { weeks: 12, filter: qFilter }),
      getKpiProgressForPeriod(db, { periodStart: qs, periodEnd: qe }),
      breakdownByUser(db, qFilter),
    ]);
    return {
      quarterLabel: qLabel,
      from: qs,
      to: qe,
      revenueGross: b.revenueGross,
      hvm: b.hvm,
      roas: b.spend > 0 ? b.revenueGross / b.spend : null,
      revenueTarget: kpis.find((k) => k.code === "REVENUE_GROSS")?.target ?? null,
      hvmTarget: kpis.find((k) => k.code === "HVM")?.target ?? null,
      byProduct: bp.rows.map((r) => ({
        code: r.label.split(" — ")[0],
        roas: r.metrics.roas,
        revenue: r.metrics.revenueGross,
      })),
      trend: tr,
      teamProgress: bu,
    };
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

type Breakdowns = {
  byProduct: Awaited<ReturnType<typeof breakdownByProduct>>;
  byCampaign: Awaited<ReturnType<typeof breakdownByCampaign>>;
  byUser: Awaited<ReturnType<typeof breakdownByUser>>;
  trend: Awaited<ReturnType<typeof weeklyTrend>>;
};

/** Gộp từ tab "Báo cáo" cũ: dựng các sheet để xuất XLSX. */
function buildReportSheets(d: Breakdowns) {
  return [
    {
      name: "Theo sản phẩm",
      columns: [
        { header: "Sản phẩm", key: "sp" },
        { header: "Spend", key: "spend" },
        { header: "Lead", key: "leads" },
        { header: "MQL", key: "mql" },
        { header: "SQL", key: "sql" },
        { header: "HV", key: "won" },
        { header: "Doanh thu", key: "rev" },
        { header: "CPMQL", key: "cpmql" },
        { header: "CAC", key: "cac" },
        { header: "ROAS", key: "roas" },
        { header: "% NS thực tế", key: "actualPct" },
        { header: "% NS phân bổ", key: "planPct" },
      ],
      rows: d.byProduct.rows.map((r) => ({
        sp: r.label,
        spend: r.metrics.spend,
        leads: r.metrics.leads,
        mql: r.metrics.mql,
        sql: r.metrics.sql,
        won: r.metrics.won,
        rev: r.metrics.revenueGross,
        cpmql: r.metrics.cpmql ?? "",
        cac: r.metrics.cac ?? "",
        roas: r.metrics.roas ?? "",
        actualPct: r.budgetShareActualPct?.toFixed(1) ?? "",
        planPct: r.budgetSharePlanPct ?? "",
      })),
    },
    {
      name: "Theo campaign",
      columns: [
        { header: "Campaign", key: "c" },
        { header: "Spend", key: "spend" },
        { header: "MQL", key: "mql" },
        { header: "HV", key: "won" },
        { header: "CPMQL", key: "cpmql" },
        { header: "CAC", key: "cac" },
        { header: "ROAS", key: "roas" },
      ],
      rows: d.byCampaign.map((r) => ({
        c: r.label,
        spend: r.metrics.spend,
        mql: r.metrics.mql,
        won: r.metrics.won,
        cpmql: r.metrics.cpmql ?? "",
        cac: r.metrics.cac ?? "",
        roas: r.metrics.roas ?? "",
      })),
    },
    {
      name: "Tiến độ đội",
      columns: [
        { header: "Nhân sự", key: "u" },
        { header: "Lead giao", key: "assigned" },
        { header: "MQL", key: "mql" },
        { header: "HV", key: "won" },
        { header: "HVM", key: "hvm" },
        { header: "Doanh thu", key: "rev" },
        { header: "CR MQL→Chốt", key: "cr" },
        { header: "Phiên CS", key: "care" },
        { header: "Task xong", key: "tdone" },
        { header: "Task tổng", key: "ttotal" },
        { header: "% task", key: "tpct" },
        { header: "Task trễ", key: "tover" },
        { header: "Tỷ lệ trễ hẹn", key: "overdue" },
        { header: "Tốc độ phản hồi", key: "resp" },
      ],
      rows: d.byUser.map((r) => ({
        u: r.label,
        assigned: r.leadsAssigned,
        mql: r.metrics.mql,
        won: r.metrics.won,
        hvm: r.metrics.hvm,
        rev: r.metrics.revenueGross,
        cr: r.crMqlWon == null ? "" : (r.crMqlWon * 100).toFixed(1) + "%",
        care: r.careSessions,
        tdone: r.taskDone,
        ttotal: r.taskTotal,
        tpct:
          r.taskTotal > 0
            ? ((r.taskDone / r.taskTotal) * 100).toFixed(0) + "%"
            : "",
        tover: r.taskOverdue,
        overdue:
          r.overdueRate == null ? "" : (r.overdueRate * 100).toFixed(1) + "%",
        resp:
          r.firstResponseRate == null
            ? ""
            : (r.firstResponseRate * 100).toFixed(1) + "%",
      })),
    },
    {
      name: "Xu hướng tuần",
      columns: [
        { header: "Tuần bắt đầu", key: "w" },
        { header: "Spend", key: "spend" },
        { header: "MQL", key: "mql" },
        { header: "HV Chốt", key: "won" },
        { header: "CPMQL", key: "cpmql" },
      ],
      rows: d.trend.map((p) => ({
        w: p.weekStart,
        spend: p.spend,
        mql: p.mql,
        won: p.won,
        cpmql: p.cpmql ?? "",
      })),
    },
  ];
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const isViewer = user.role === "VIEWER";

  // VIEWER (BOD): màn hình rút gọn, không dữ liệu cá nhân — SPEC Mục 12.6.
  if (isViewer) {
    const viewerData = await loadViewerData();
    if (!viewerData)
      return (
        <p className="text-sm text-muted-foreground">
          Chưa lấy được dữ liệu. Kiểm tra kết nối cơ sở dữ liệu.
        </p>
      );
    return <ViewerDashboard {...viewerData} />;
  }

  const { from, to, label } = resolveRange(sp.range ?? "this_month");
  const cmpMode = (sp.cmp ?? "prev") as "prev" | "yoy" | "none";
  const productIds = (sp.products ?? "").split(",").filter(Boolean);
  const channels = (sp.channels ?? "").split(",").filter(Boolean) as MetricsFilter["channels"];

  const filter: MetricsFilter = {
    from,
    to,
    productIds: productIds.length ? productIds : undefined,
    channels: channels && channels.length ? channels : undefined,
  };

  const allProducts = await db
    .select({ id: productsTable.id, code: productsTable.code })
    .from(productsTable)
    .orderBy(asc(productsTable.sortOrder));

  const cmp = comparePeriod(from, to, cmpMode);
  // Khóa Suspense theo bộ lọc: đổi kỳ -> khối cũ hiện skeleton lại ngay, không "đứng hình".
  const bkey = `${from}|${to}|${cmpMode}|${productIds.join(",")}|${(channels ?? []).join(",")}`;
  const canExport = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {label}: {from} → {to}
            {cmp ? ` · so với ${cmp.from} → ${cmp.to}` : ""}
          </p>
        </div>
        {canExport && <RunJobsButton />}
      </div>

      <DashboardFilters
        products={allProducts}
        channels={["FB", "GOOGLE", "TIKTOK", "KHAC"]}
      />

      {/* Shell + bộ lọc hiển thị tức thì; các khối dưới chảy vào khi tính xong. */}
      <Suspense key={`h-${bkey}`} fallback={<SkeletonBlock label="Đang tính sức khỏe kỳ…" rows={2} />}>
        <ActionHealthSection filter={filter} cmpMode={cmpMode} />
      </Suspense>

      <Suspense key={`k-${bkey}`} fallback={<SkeletonBlock label="Đang tính tiến độ KPI…" rows={2} />}>
        <KpiFollowSection from={from} to={to} label={label} />
      </Suspense>

      <Suspense
        key={`b-${bkey}`}
        fallback={<SkeletonBlock label="Đang bóc tách theo sản phẩm / campaign / nhân sự…" rows={5} />}
      >
        <BreakdownsSection
          filter={filter}
          from={from}
          to={to}
          label={label}
          isViewer={isViewer}
          canExport={canExport}
        />
      </Suspense>
    </div>
  );
}

function SkeletonBlock({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="space-y-1.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
    </div>
  );
}

function DbError({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
      <p className="font-medium">Chưa lấy được dữ liệu.</p>
      <p className="text-xs text-muted-foreground">{msg}</p>
    </div>
  );
}

// ---------- TẦNG 1 + 2 — CẦN HÀNH ĐỘNG & SỨC KHỎE (stream riêng) ----------
async function ActionHealthSection({
  filter,
  cmpMode,
}: {
  filter: MetricsFilter;
  cmpMode: "prev" | "yoy" | "none";
}) {
  let health, actions, alerts;
  try {
    ({ health, actions, alerts } = await getHealthBundleCached(
      filter.from,
      filter.to,
      (filter.productIds ?? []).join(","),
      (filter.channels ?? []).join(","),
      cmpMode,
    ));
  } catch (e) {
    return <DbError msg={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <div className="space-y-5">
      <ActionTier alerts={alerts} counts={actions} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Sức khỏe</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Tile name="Spend" t={health.tiles.spend} fmt={fmtCompact} />
          <Tile name="Lead" t={health.tiles.leads} fmt={fmtInt} />
          <Tile name="MQL" t={health.tiles.mql} fmt={fmtInt} />
          <Tile name="SQL" t={health.tiles.sql} fmt={fmtInt} />
          <Tile name="HV Chốt" t={health.tiles.won} fmt={fmtInt} />
          <Tile name="Doanh thu" t={health.tiles.revenueGross} fmt={fmtCompact} />
          <Tile name="CPMQL" t={health.tiles.cpmql} fmt={fmtVnd} lowerBetter />
          <Tile name="CAC" t={health.tiles.cac} fmt={fmtVnd} lowerBetter />
          <Tile name="ROAS" t={health.tiles.roas} fmt={fmtRatioX} />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Funnel title="Phễu kỳ này" m={health.current} />
          {health.compare && <Funnel title="Phễu kỳ so sánh" m={health.compare} muted />}
        </div>
      </section>
    </div>
  );
}

// ---------- THEO KPI — chỉ tiêu + ngân sách của kỳ đang chọn (Gói J) ----------
async function KpiFollowSection({
  from,
  to,
  label,
}: {
  from: string;
  to: string;
  label: string;
}) {
  let kpis, budget;
  try {
    ({ kpis, budget } = await getKpiFollowCached(from, to));
  } catch (e) {
    return <DbError msg={e instanceof Error ? e.message : String(e)} />;
  }

  const hasKpi = kpis.length > 0;
  const hasBudget = budget.allocated != null;
  if (!hasKpi && !hasBudget) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Theo KPI</h2>
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Chưa có chỉ tiêu / ngân sách cho kỳ này. Giao ở{" "}
          <Link href="/kpi" className="text-brand hover:underline">
            trang KPI
          </Link>{" "}
          — chọn đúng <b>Tháng</b> hoặc <b>Quý</b> khớp kỳ đang xem ({label}).
        </p>
      </section>
    );
  }

  const pacePct = budget.timeProgressPct;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Theo KPI · {label}
      </h2>

      {hasBudget && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-5">
          <MiniStat label="Ngân sách giao" value={fmtVnd(budget.allocated)} />
          <MiniStat label="Đã giải ngân" value={fmtVnd(budget.spend)} />
          <MiniStat
            label="Còn lại"
            value={fmtVnd(budget.remaining)}
            tone={budget.remaining != null && budget.remaining < 0 ? "crit" : undefined}
          />
          <MiniStat
            label="% giải ngân"
            value={fmtPct(budget.disbursedPct)}
            tone={
              budget.disbursedPct != null && budget.disbursedPct > pacePct + 0.1
                ? "crit"
                : undefined
            }
          />
          <MiniStat label="Nhịp kỳ" value={fmtPct(pacePct)} />
        </div>
      )}

      {hasKpi && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Chỉ tiêu</th>
                <th className="px-3 py-2">Phạm vi</th>
                <th className="px-3 py-2 text-right">Mục tiêu</th>
                <th className="px-3 py-2 text-right">Thực tế</th>
                <th className="px-3 py-2 text-right">% hoàn thành</th>
                <th className="px-3 py-2 text-right">Trọng số</th>
                <th className="px-3 py-2">Nhịp</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.id} className="border-b">
                  <td className="px-3 py-1.5 font-medium">{k.code}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {k.userName ?? k.scopeType}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtInt(k.target)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {k.actual == null ? "–" : fmtInt(k.actual)}
                  </td>
                  <td
                    className={
                      "px-3 py-1.5 text-right tabular-nums " +
                      (k.completionPct == null
                        ? ""
                        : k.completionPct >= 1
                          ? "text-ok font-medium"
                          : k.atRisk
                            ? "text-crit font-medium"
                            : "")
                    }
                  >
                    {fmtPct(k.completionPct)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {k.weightPct}%
                  </td>
                  <td className="px-3 py-1.5">
                    {k.atRisk ? (
                      <Badge variant="outline" className="text-crit">
                        trễ nhịp
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {fmtPct(k.timeProgressPct)} kỳ
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "crit";
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={
          "text-sm font-semibold tabular-nums " + (tone === "crit" ? "text-crit" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

// ---------- TẦNG 3 — BÓC TÁCH (stream riêng — phần nặng nhất) ----------
async function BreakdownsSection({
  filter,
  from,
  to,
  label,
  isViewer,
  canExport,
}: {
  filter: MetricsFilter;
  from: string;
  to: string;
  label: string;
  isViewer: boolean;
  canExport: boolean;
}) {
  let byProduct, byCampaign, byUser, trend;
  try {
    ({ byProduct, byCampaign, byUser, trend } = await getBreakdownsCached(
      from,
      to,
      (filter.productIds ?? []).join(","),
      (filter.channels ?? []).join(","),
      !isViewer,
    ));
  } catch (e) {
    return <DbError msg={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Bóc tách · {label} ({from} → {to})
        </h2>
        {canExport && (
          <ReportExport
            filename={`bao-cao-${from}_${to}`}
            sheets={buildReportSheets({ byProduct, byCampaign, byUser, trend })}
          />
        )}
      </div>

      <ProductTable data={byProduct} />

      {!isViewer && byUser.length > 0 && <TeamProgressTable rows={byUser} />}

      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-semibold">
          Xu hướng 12 tuần — Spend / MQL / HV Chốt / CPMQL
        </h3>
        <TrendChart data={trend} />
      </div>

      <CampaignTable rows={byCampaign} />
    </section>
  );
}

// ------------------------------------------------------------------ Tầng 1

function ActionTier({
  alerts,
  counts,
}: {
  alerts: Awaited<ReturnType<typeof evaluateCampaignAlerts>>;
  counts: Awaited<ReturnType<typeof getActionCounts>>;
}) {
  const kill = alerts.filter((a) => a.rule === "R1" || a.rule === "R2");
  const warn = alerts.filter((a) => a.rule === "R3" || a.rule === "R4");
  const cards: { title: string; body: string; href: string; tone: "crit" | "warn" }[] =
    [];
  if (kill.length)
    cards.push({
      title: `${kill.length} campaign đề xuất KILL`,
      body: kill
        .slice(0, 3)
        .map((a) => `${a.displayName} (${a.rule})`)
        .join(" · "),
      href: "/campaign",
      tone: "crit",
    });
  if (counts.overdueLeads > 0)
    cards.push({
      title: `${counts.overdueLeads} lead quá hạn chăm sóc`,
      body: "Sắp xếp lead trễ lâu nhất lên đầu, xử lý ngay.",
      href: "/cong-viec",
      tone: "crit",
    });
  if (counts.newLeadsStale > 0)
    cards.push({
      title: `${counts.newLeadsStale} lead mới chưa xử lý quá 24h`,
      body: "Vi phạm cam kết phản hồi trong 15 phút (V12).",
      href: "/lead",
      tone: "warn",
    });
  if (counts.leadsMissingNextDate > 0)
    cards.push({
      title: `${counts.leadsMissingNextDate} lead thiếu Ngày LH lại`,
      body: "Lead đang theo, đã có tương tác nhưng chưa đặt lịch (V01).",
      href: "/lead",
      tone: "warn",
    });
  if (warn.length)
    cards.push({
      title: `${warn.length} campaign cần tối ưu / thiếu dữ liệu`,
      body: warn
        .slice(0, 3)
        .map((a) => `${a.displayName} (${a.rule})`)
        .join(" · "),
      href: "/campaign",
      tone: "warn",
    });

  if (cards.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        Cần hành động
      </h2>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <Link
            key={i}
            href={c.href}
            className={
              c.tone === "crit"
                ? "rounded-lg border border-crit/40 bg-crit/5 p-3 hover:bg-crit/10"
                : "rounded-lg border border-warn/40 bg-warn/5 p-3 hover:bg-warn/10"
            }
          >
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle
                className={c.tone === "crit" ? "h-4 w-4 text-crit" : "h-4 w-4 text-warn"}
              />
              {c.title}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{c.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Tầng 2

function Tile({
  name,
  t,
  fmt,
  lowerBetter,
}: {
  name: string;
  t: { value: number; deltaPct: number | null };
  fmt: (v: number | null) => string;
  lowerBetter?: boolean;
}) {
  const d = t.deltaPct;
  const up = d != null && d > 0;
  const good = d == null ? null : lowerBetter ? !up : up;
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{name}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{fmt(t.value)}</div>
      {d != null && (
        <div
          className={
            good == null
              ? "flex items-center gap-0.5 text-xs text-muted-foreground"
              : good
                ? "flex items-center gap-0.5 text-xs text-ok"
                : "flex items-center gap-0.5 text-xs text-crit"
          }
        >
          {up ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {Math.abs(d) > 5 ? ">500%" : fmtPct(Math.abs(d))}
        </div>
      )}
    </div>
  );
}

function Funnel({
  title,
  m,
  muted,
}: {
  title: string;
  m: { leads: number; mql: number; sql: number; won: number };
  muted?: boolean;
}) {
  const steps = [
    { k: "Lead", v: m.leads },
    { k: "MQL", v: m.mql, of: m.leads },
    { k: "SQL", v: m.sql, of: m.mql },
    { k: "HV Chốt", v: m.won, of: m.sql },
  ];
  return (
    <div className={`rounded-lg border p-3 ${muted ? "opacity-70" : ""}`}>
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1">
        {steps.map((s) => {
          const cr = s.of ? (s.of > 0 ? s.v / s.of : null) : null;
          const w = m.leads > 0 ? Math.max(4, (s.v / m.leads) * 100) : 4;
          return (
            <div key={s.k} className="flex items-center gap-2 text-sm">
              <div className="w-16 shrink-0 text-muted-foreground">{s.k}</div>
              <div
                className="h-5 rounded bg-brand/70"
                style={{ width: `${w}%` }}
              />
              <div className="tabular-nums">{fmtInt(s.v)}</div>
              {cr != null && (
                <div className="text-xs text-muted-foreground">({fmtPct(cr)})</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tầng 3

function ProductTable({
  data,
}: {
  data: Awaited<ReturnType<typeof breakdownByProduct>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="px-3 py-2 text-left text-sm font-semibold">
          Theo sản phẩm
        </caption>
        <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">SP</th>
            <th className="px-3 py-2 text-right">Spend</th>
            <th className="px-3 py-2 text-right">Lead</th>
            <th className="px-3 py-2 text-right">MQL</th>
            <th className="px-3 py-2 text-right">HV</th>
            <th className="px-3 py-2 text-right">Doanh thu</th>
            <th className="px-3 py-2 text-right">CPMQL</th>
            <th className="px-3 py-2 text-right">ROAS</th>
            <th className="px-3 py-2 text-right">% NS thực tế / phân bổ</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const variance =
              r.budgetShareActualPct != null && r.budgetSharePlanPct != null
                ? r.budgetShareActualPct - r.budgetSharePlanPct
                : null;
            return (
              <tr key={r.key} className="border-b">
                <td className="px-3 py-1.5 font-medium">{r.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtVnd(r.metrics.spend)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.metrics.leads)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.metrics.mql)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.metrics.won)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtVnd(r.metrics.revenueGross)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtVnd(r.metrics.cpmql)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtRatioX(r.metrics.roas)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.budgetShareActualPct == null
                    ? "–"
                    : `${r.budgetShareActualPct.toFixed(0)}%`}
                  {r.budgetSharePlanPct != null && (
                    <span className="text-muted-foreground">
                      {" "}
                      / {r.budgetSharePlanPct.toFixed(0)}%
                    </span>
                  )}
                  {variance != null && Math.abs(variance) > 10 && (
                    <Badge variant="outline" className="ml-1 text-crit">
                      lệch {variance > 0 ? "+" : ""}
                      {variance.toFixed(0)} điểm
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
          {data.rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                Không có dữ liệu trong kỳ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CampaignTable({
  rows,
}: {
  rows: Awaited<ReturnType<typeof breakdownByCampaign>>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="px-3 py-2 text-left text-sm font-semibold">
          Theo campaign (top 20 theo spend)
        </caption>
        <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Campaign</th>
            <th className="px-3 py-2 text-right">Spend</th>
            <th className="px-3 py-2 text-right">MQL</th>
            <th className="px-3 py-2 text-right">HV</th>
            <th className="px-3 py-2 text-right">CPMQL</th>
            <th className="px-3 py-2 text-right">CAC</th>
            <th className="px-3 py-2 text-right">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b">
              <td className="px-3 py-1.5">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtVnd(r.metrics.spend)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtInt(r.metrics.mql)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtInt(r.metrics.won)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtVnd(r.metrics.cpmql)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtVnd(r.metrics.cac)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {fmtRatioX(r.metrics.roas)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Không có campaign nào có dữ liệu trong kỳ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

