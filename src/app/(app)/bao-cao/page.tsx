import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { products as productsTable } from "@/lib/db/schema";
import {
  breakdownByCampaign,
  breakdownByProduct,
  breakdownByUser,
  cohortByReceiptMonth,
  weeklyTrend,
} from "@/lib/services/dashboard";
import type { MetricsFilter } from "@/lib/services/metrics";
import { fmtInt, fmtPct, fmtRatioX, fmtVnd } from "@/lib/format";
import {
  addDaysStr,
  monthBounds,
  quarterBounds,
  todayVnDayStr,
} from "@/lib/time";
import { ReportExport } from "./report-export";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo — VMG TMĐT OS" };

function resolvePeriod(p: string): { from: string; to: string; label: string } {
  const today = todayVnDayStr();
  if (p === "last_month") {
    const [s] = monthBounds(today);
    const [fs, fe] = monthBounds(addDaysStr(s, -1));
    return { from: fs, to: fe, label: "Tháng trước" };
  }
  if (p === "this_quarter") {
    const [s, e] = quarterBounds(today);
    return { from: s, to: e, label: "Quý này" };
  }
  if (p === "last_quarter") {
    const [s] = quarterBounds(today);
    const [ls, le] = quarterBounds(addDaysStr(s, -1));
    return { from: ls, to: le, label: "Quý trước" };
  }
  const [s, e] = monthBounds(today);
  return { from: s, to: e, label: "Tháng này" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireRole("ADMIN", "MANAGER");
  const sp = await searchParams;
  const { from, to, label } = resolvePeriod(sp.p ?? "this_month");
  const filter: MetricsFilter = { from, to };

  const [byProduct, byCampaign, byUser, trend, cohort] = await Promise.all([
    breakdownByProduct(db, filter),
    breakdownByCampaign(db, filter, 50),
    breakdownByUser(db, filter),
    weeklyTrend(db, { weeks: 12, filter }),
    cohortByReceiptMonth(db, { months: 6 }),
  ]);

  await db
    .select({ code: productsTable.code })
    .from(productsTable)
    .orderBy(asc(productsTable.sortOrder));

  const periods = [
    { v: "this_month", l: "Tháng này" },
    { v: "last_month", l: "Tháng trước" },
    { v: "this_quarter", l: "Quý này" },
    { v: "last_quarter", l: "Quý trước" },
  ];

  // Chuẩn bị sheet cho export
  const sheets = [
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
      rows: byProduct.rows.map((r) => ({
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
      rows: byCampaign.map((r) => ({
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
      name: "Theo nhân sự",
      columns: [
        { header: "Nhân sự", key: "u" },
        { header: "Lead giao", key: "assigned" },
        { header: "MQL", key: "mql" },
        { header: "SQL", key: "sql" },
        { header: "HV", key: "won" },
        { header: "HVM", key: "hvm" },
        { header: "Doanh thu", key: "rev" },
        { header: "CR MQL→Chốt", key: "cr" },
        { header: "Tỷ lệ trễ hẹn", key: "overdue" },
        { header: "Tốc độ phản hồi", key: "resp" },
      ],
      rows: byUser.map((r) => ({
        u: r.label,
        assigned: r.leadsAssigned,
        mql: r.metrics.mql,
        sql: r.metrics.sql,
        won: r.metrics.won,
        hvm: r.metrics.hvm,
        rev: r.metrics.revenueGross,
        cr: r.crMqlWon == null ? "" : (r.crMqlWon * 100).toFixed(1) + "%",
        overdue: r.overdueRate == null ? "" : (r.overdueRate * 100).toFixed(1) + "%",
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
      rows: trend.map((p) => ({
        w: p.weekStart,
        spend: p.spend,
        mql: p.mql,
        won: p.won,
        cpmql: p.cpmql ?? "",
      })),
    },
    {
      name: "Cohort",
      columns: [
        { header: "Tháng tiếp nhận", key: "m" },
        { header: "Tổng lead", key: "total" },
        { header: "0-7 ngày", key: "b0" },
        { header: "8-30 ngày", key: "b1" },
        { header: "31-60 ngày", key: "b2" },
        { header: "61-90 ngày", key: "b3" },
        { header: ">90 ngày", key: "b4" },
      ],
      rows: cohort.map((r) => ({
        m: r.month,
        total: r.totalLeads,
        b0: r.buckets[0],
        b1: r.buckets[1],
        b2: r.buckets[2],
        b3: r.buckets[3],
        b4: r.buckets[4],
      })),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Báo cáo — {label}</h1>
          <p className="text-sm text-muted-foreground">
            {from} → {to}. SPEC Mục 12.5 / 16.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border text-sm">
            {periods.map((p) => (
              <a
                key={p.v}
                href={`/bao-cao?p=${p.v}`}
                className={
                  (sp.p ?? "this_month") === p.v
                    ? "bg-brand/10 px-2.5 py-1 font-medium text-brand"
                    : "px-2.5 py-1"
                }
              >
                {p.l}
              </a>
            ))}
          </div>
          <ReportExport
            filename={`bao-cao-${from}_${to}`}
            sheets={sheets}
          />
        </div>
      </div>

      <ReportTable
        title="Theo sản phẩm"
        head={["SP", "Spend", "Lead", "MQL", "HV", "Doanh thu", "CPMQL", "ROAS", "% NS thực tế / phân bổ"]}
        rows={byProduct.rows.map((r) => {
          const variance =
            r.budgetShareActualPct != null && r.budgetSharePlanPct != null
              ? r.budgetShareActualPct - r.budgetSharePlanPct
              : null;
          return [
            r.label,
            fmtVnd(r.metrics.spend),
            fmtInt(r.metrics.leads),
            fmtInt(r.metrics.mql),
            fmtInt(r.metrics.won),
            fmtVnd(r.metrics.revenueGross),
            fmtVnd(r.metrics.cpmql),
            fmtRatioX(r.metrics.roas),
            `${r.budgetShareActualPct?.toFixed(0) ?? "–"}% / ${r.budgetSharePlanPct?.toFixed(0) ?? "–"}%${
              variance != null && Math.abs(variance) > 10
                ? `  (lệch ${variance > 0 ? "+" : ""}${variance.toFixed(0)} điểm)`
                : ""
            }`,
          ];
        })}
      />

      <ReportTable
        title="Theo nhân sự"
        head={["Nhân sự", "Lead giao", "MQL", "SQL", "HV", "HVM", "Doanh thu", "CR MQL→Chốt", "Trễ hẹn", "Phản hồi"]}
        rows={byUser.map((r) => [
          r.label,
          fmtInt(r.leadsAssigned),
          fmtInt(r.metrics.mql),
          fmtInt(r.metrics.sql),
          fmtInt(r.metrics.won),
          fmtInt(r.metrics.hvm),
          fmtVnd(r.metrics.revenueGross),
          fmtPct(r.crMqlWon),
          fmtPct(r.overdueRate),
          fmtPct(r.firstResponseRate),
        ])}
      />

      <ReportTable
        title="Theo campaign (top 50 theo spend)"
        head={["Campaign", "Spend", "MQL", "HV", "CPMQL", "CAC", "ROAS"]}
        rows={byCampaign.map((r) => [
          r.label,
          fmtVnd(r.metrics.spend),
          fmtInt(r.metrics.mql),
          fmtInt(r.metrics.won),
          fmtVnd(r.metrics.cpmql),
          fmtVnd(r.metrics.cac),
          fmtRatioX(r.metrics.roas),
        ])}
      />

      <ReportTable
        title="Cohort — số lead chốt sau bao lâu kể từ khi tiếp nhận"
        head={["Tháng tiếp nhận", "Tổng lead", "0–7", "8–30", "31–60", "61–90", ">90"]}
        rows={cohort.map((r) => [
          r.month,
          fmtInt(r.totalLeads),
          ...r.buckets.map((b) => (b ? String(b) : "–")),
        ])}
      />
    </div>
  );
}

function ReportTable({
  title,
  head,
  rows,
}: {
  title: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="px-3 py-2 text-left text-sm font-semibold">{title}</caption>
        <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i === 0 ? "px-3 py-2" : "px-3 py-2 text-right"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={
                    ci === 0
                      ? "px-3 py-1.5 font-medium"
                      : "px-3 py-1.5 text-right tabular-nums"
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">
                Không có dữ liệu trong kỳ.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
