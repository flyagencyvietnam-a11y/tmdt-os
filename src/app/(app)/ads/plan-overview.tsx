"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";
import { groupOfLine, PLAN_TARGET_COLUMN } from "@/lib/ads-lines";
import { BUDGET_STATUS_LABEL, budgetProgressAt, rangeElapsed, targetProgress, type BudgetProgress } from "@/lib/ads-plan";
import { todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { BAR_TONE, StatusPill, STATUS_TONE, UsageBar } from "./plan-panel";
import { b2cSummary } from "./rollups";
import type { OverviewRange } from "./overview-view";
import { aggregate, fmt, fmtMoney, num, type MetricRow, type PlanRow } from "./shared";
import { hasFunnelTargets, rowsOfUnit, type AdsUnit } from "./units";

interface UnitPlanRow {
  unit: AdsUnit;
  /** Các tháng của khoảng đang xem mà SBU đã có kế hoạch (ngân sách hoặc mục tiêu). */
  planMonths: string[];
  planned: number | null;
  actual: number | null;
  prog: BudgetProgress;
  leadTarget: number | null;
  leadActual: number | null;
  convTarget: number | null;
  convActual: number | null;
}

const planOfUnitRows = (plans: PlanRow[], u: AdsUnit) => plans.filter((p) => p.line === u.line && (u.kind === "center" ? p.sbuId === u.sbuId : !p.sbuId));

/** Kế hoạch ↔ thực tế của MỌI SBU trong khoảng đang xem (1 tháng hoặc 1 quý). Chỉ so trên các tháng ĐÃ có kế hoạch. */
export function computePlanRows(units: AdsUnit[], metrics: MetricRow[], plans: PlanRow[], range: Pick<OverviewRange, "months">, today: string): UnitPlanRow[] {
  return units.map((unit) => {
    const gp = planOfUnitRows(plans, unit).filter((p) => range.months.includes(p.period));
    const hasPlan = (m: string) => gp.some((p) => p.period === m && (p.plannedBudget != null || Object.values(PLAN_TARGET_COLUMN).some((c) => p[c] != null)));
    const planMonths = range.months.filter(hasPlan);
    const planned = gp.some((p) => p.plannedBudget != null) ? gp.reduce((s, p) => s + (num(p.plannedBudget) ?? 0), 0) : null;
    const rows = rowsOfUnit(
      metrics.filter((m) => m.periodType === "month" && planMonths.includes(m.period)),
      unit,
    );
    const actual = rows.length ? aggregate(rows).spend : null;
    const prog = budgetProgressAt(planned, actual, rangeElapsed(planMonths, today));

    // Mục tiêu phễu chỉ có ở SBU "chủ" (Hệ thống = tổng B2C; không có ở từng trung tâm).
    const group = groupOfLine(unit.line);
    const owner = hasFunnelTargets(unit);
    const sumTarget = (col: (typeof PLAN_TARGET_COLUMN)[keyof typeof PLAN_TARGET_COLUMN]) => (owner && gp.some((p) => p[col] != null) ? gp.reduce((s, p) => s + (num(p[col]) ?? 0), 0) : null);
    const b2c = unit.kind === "ho" ? b2cSummary(metrics, planMonths) : null;
    const agg = aggregate(rows);
    return {
      unit,
      planMonths,
      planned,
      actual,
      prog,
      leadTarget: sumTarget(PLAN_TARGET_COLUMN[group.leadField]),
      leadActual: !owner ? null : b2c ? b2c.leads : agg[group.leadField],
      convTarget: sumTarget(PLAN_TARGET_COLUMN.newStudents),
      convActual: !owner ? null : b2c ? b2c.newStudents : agg.newStudents,
    };
  });
}

function Funnel({ target, actual, elapsed }: { target: number | null; actual: number | null; elapsed: number }) {
  if (target == null) return <span className="text-muted-foreground/50">—</span>;
  const t = targetProgress("leads", target, actual, elapsed);
  return (
    <span className="tabular-nums">
      <span className={cn("font-medium", t.status === "behind" && "text-red-600", t.status === "achieved" && "text-emerald-600")}>{actual != null ? fmt(actual) : "—"}</span>
      <span className="text-muted-foreground"> / {fmt(target)}</span>
      {t.pct != null && <span className="ml-1 text-xs text-muted-foreground">({Math.round(t.pct * 100)}%)</span>}
    </span>
  );
}

export function PlanOverview({ units, metrics, plans, range, onOpenPlan }: { units: AdsUnit[]; metrics: MetricRow[]; plans: PlanRow[]; range: OverviewRange; onOpenPlan: () => void }) {
  const today = todayVnDayStr();
  const rows = React.useMemo(() => computePlanRows(units, metrics, plans, range, today), [units, metrics, plans, range, today]);
  const planned = rows.filter((r) => r.planned != null);
  const totalPlanned = planned.length ? planned.reduce((s, r) => s + (r.planned ?? 0), 0) : null;
  const totalActual = planned.length ? planned.reduce((s, r) => s + (r.actual ?? 0), 0) : null;
  const allMonths = [...new Set(planned.flatMap((r) => r.planMonths))];
  const total = budgetProgressAt(totalPlanned, totalActual, rangeElapsed(allMonths, today));
  const elapsedOf = (r: UnitPlanRow) => rangeElapsed(r.planMonths, today);
  const partial = range.kind === "quarter" && planned.some((r) => r.planMonths.length < range.months.length);
  // Chỉ liệt kê SBU đã lập kế hoạch (còn lại gom vào 1 dòng ghi chú) để bảng không dài với 14 SBU.
  const shown = rows.filter((r) => r.planned != null || r.leadTarget != null || r.convTarget != null);
  const missing = rows.filter((r) => !shown.includes(r)).map((r) => (r.unit.kind === "ho" ? "Hệ thống" : r.unit.code));

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Kế hoạch so với thực tế — {range.label}</h3>
        <p className="text-xs text-muted-foreground">
          Ngân sách đã dùng so với kế hoạch và so với phần thời gian đã trôi; Lead/HVM thực tế so với mục tiêu (B2C: số tổng ở dòng Hệ thống). Bấm một dòng để mở kế hoạch chi tiết.
          {partial ? " Chỉ so trên các tháng SBU đó ĐÃ lập kế hoạch (tháng chưa lập không tính vào cả hai vế)." : ""}
        </p>
      </header>
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Chưa SBU nào lập kế hoạch cho {range.label}. Mở tab “Kế hoạch & tiến độ” để lập.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">SBU</th>
                <th className="px-3 py-2 text-right font-medium">NS kế hoạch</th>
                <th className="px-3 py-2 text-right font-medium">Thực tế</th>
                <th className="w-36 px-3 py-2 text-left font-medium">% đã dùng</th>
                <th className="px-3 py-2 text-right font-medium">Dự báo</th>
                <th className="px-3 py-2 text-right font-medium">Lead (thực / mục tiêu)</th>
                <th className="px-3 py-2 text-right font-medium">HVM (thực / mục tiêu)</th>
                <th className="px-3 py-2 text-left font-medium">Tình trạng</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((r) => (
                <tr key={r.unit.key} className="cursor-pointer hover:bg-muted/30" onClick={onOpenPlan}>
                  <td className="px-3 py-2 font-medium" title={r.unit.label}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: r.unit.color }} />
                      {r.unit.kind === "ho" ? "Hệ thống (HO)" : r.unit.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.planned != null ? fmtMoney(r.planned) : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.actual != null ? fmtMoney(r.actual) : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <UsageBar used={r.prog.used} elapsed={elapsedOf(r)} tone={BAR_TONE[r.prog.status]} />
                      </div>
                      <span className="w-9 text-xs tabular-nums text-muted-foreground">{r.prog.used != null ? `${Math.round(r.prog.used * 100)}%` : "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(r.prog.forecast)}</td>
                  <td className="px-3 py-2 text-right">
                    <Funnel target={r.leadTarget} actual={r.leadActual} elapsed={elapsedOf(r)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Funnel target={r.convTarget} actual={r.convActual} elapsed={elapsedOf(r)} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={STATUS_TONE[r.prog.status]}>{BUDGET_STATUS_LABEL[r.prog.status]}</StatusPill>
                  </td>
                  <td className="px-1 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/40 font-semibold">
              <tr>
                <td className="px-3 py-2">Tổng các SBU đã lập kế hoạch</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalPlanned)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalActual)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{total.used != null ? `${Math.round(total.used * 100)}%` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.forecast)}</td>
                <td colSpan={2} />
                <td className="px-3 py-2">
                  <StatusPill tone={STATUS_TONE[total.status]}>{BUDGET_STATUS_LABEL[total.status]}</StatusPill>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {shown.length > 0 && missing.length > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Chưa lập kế hoạch: {missing.join(", ")}.</p>}
    </section>
  );
}
