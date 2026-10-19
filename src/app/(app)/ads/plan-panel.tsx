"use client";

import { CalendarCheck, Coins, Copy, Gauge, Target, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { groupOfLine, PLAN_TARGET_COLUMN, type AdsLine, type FunnelDef, type FunnelField, type PlanTargetColumn } from "@/lib/ads-lines";
import {
  BUDGET_STATUS_LABEL,
  budgetProgress,
  monthElapsed,
  plannedUnitCost,
  targetProgress,
  type BudgetProgress,
  type BudgetStatus,
  type TargetStatus,
} from "@/lib/ads-plan";
import { todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { copyAdsPlansAction, upsertAdsPlanAction } from "./actions";
import { InlineNum } from "./ads-inline";
import { b2cSummary } from "./rollups";
import { aggregate, fmt, fmtMoney, fmtPct, monthLabel, num, prevMonth, type CampaignRow, type Line, type MetricRow, type PlanRow } from "./shared";
import { hasFunnelTargets, rowsOfUnit, unitKeyOf, type AdsUnit } from "./units";

export const STATUS_TONE: Record<BudgetStatus, string> = {
  no_plan: "bg-muted text-muted-foreground",
  no_actual: "bg-muted text-muted-foreground",
  on_track: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  fast: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  over: "bg-red-500/12 text-red-700 dark:text-red-400",
  slow: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
};
export const BAR_TONE: Record<BudgetStatus, string> = {
  no_plan: "bg-muted-foreground/30",
  no_actual: "bg-muted-foreground/30",
  on_track: "bg-emerald-500",
  fast: "bg-amber-500",
  over: "bg-red-500",
  slow: "bg-orange-500",
};
const TARGET_LABEL: Record<TargetStatus, string> = { no_target: "Chưa đặt mục tiêu", no_actual: "Chưa có số", achieved: "Đã đạt", on_pace: "Đúng nhịp", behind: "Chậm" };
const TARGET_TONE: Record<TargetStatus, string> = {
  no_target: "bg-muted text-muted-foreground",
  no_actual: "bg-muted text-muted-foreground",
  achieved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  on_pace: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  behind: "bg-red-500/12 text-red-700 dark:text-red-400",
};

export function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone)}>{children}</span>;
}

/** Thanh tiến độ: phần đã dùng + vạch "tháng đã trôi qua đến đây". */
export function UsageBar({ used, elapsed, tone }: { used: number | null; elapsed: number; tone: string }) {
  const pct = Math.min(1, Math.max(0, used ?? 0));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" title={`Đã dùng ${used != null ? Math.round(used * 100) : 0}% · tháng đã trôi ${Math.round(elapsed * 100)}%`}>
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct * 100}%` }} />
      {elapsed > 0 && elapsed < 1 && <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${elapsed * 100}%` }} />}
    </div>
  );
}

/** Lưu 1 ô kế hoạch (chỉ ghi đúng trường đó). */
function usePlanSaver() {
  const router = useRouter();
  return React.useCallback(
    async (key: { line: Line; period: string; sbuId: string | null }, field: "plannedBudget" | PlanTargetColumn, value: string | null) => {
      const res = await upsertAdsPlanAction({ ...key, [field]: value });
      if (res.ok) router.refresh();
      else toast.error(res.error);
      return res.ok;
    },
    [router],
  );
}

const ALL_LINES: AdsLine[] = ["b2c_system", "b2c_center", "ecom", "osir", "vmp"];

/** Dòng kế hoạch của 1 SBU trong 1 tháng. */
const planOfUnit = (plans: PlanRow[], u: AdsUnit, period: string) => plans.find((p) => p.line === u.line && p.period === period && (u.kind === "center" ? p.sbuId === u.sbuId : !p.sbuId));

/**
 * KẾ HOẠCH & TIẾN ĐỘ của MỌI SBU trong 1 tháng — điểm đầu của luồng Kế hoạch → Request → Báo cáo (SPEC Phụ lục D mục 26: Hệ thống, trung tâm,
 * Ecom, VMP, VMT chung một danh sách). Lập ngân sách + mục tiêu đầu tháng, so ngay với thực tế (suy ra từ báo cáo tháng).
 * Sửa trực tiếp trên ô (kiểu Excel); mọi thay đổi ghi nhật ký.
 */
export function PlanPanel({
  month,
  months,
  currentMonth,
  metrics,
  plans,
  campaigns,
  units,
  canManage,
  onMonthChange,
  onOpenRequests,
}: {
  month: string;
  months: string[];
  currentMonth: string;
  metrics: MetricRow[];
  plans: PlanRow[];
  campaigns: CampaignRow[];
  units: AdsUnit[];
  canManage: boolean;
  onMonthChange: (m: string) => void;
  onOpenRequests: () => void;
}) {
  const router = useRouter();
  const savePlan = usePlanSaver();
  const [copying, startCopy] = React.useTransition();
  const today = todayVnDayStr();

  const monthRows = React.useMemo(() => metrics.filter((m) => m.periodType === "month" && m.period === month), [metrics, month]);

  const rowsView = units.map((u) => {
    const plan = planOfUnit(plans, u, month);
    const actual = aggregate(rowsOfUnit(monthRows, u)).spend;
    const planned = num(plan?.plannedBudget);
    const prog = budgetProgress(planned, actual, month, today);
    // Request thuộc SBU (Hệ thống không có request riêng).
    const allocated = u.kind === "ho" ? null : campaigns.filter((c) => c.period === month && unitKeyOf(c.line as AdsLine, c.sbuId) === u.key).reduce((s, c) => s + (num(c.plannedBudget) ?? 0), 0);
    return { u, plan, actual, planned, prog, allocated };
  });

  const totalPlanned = rowsView.some((r) => r.planned != null) ? rowsView.reduce((s, r) => s + (r.planned ?? 0), 0) : null;
  // Tiến độ tổng chỉ so các SBU ĐÃ lập kế hoạch (SBU chưa lập không tính vào thực tế, kẻo vượt giả); chi toàn phòng ghi riêng.
  const plannedRows = rowsView.filter((r) => r.planned != null);
  const totalActual = plannedRows.some((r) => r.actual != null) ? plannedRows.reduce((s, r) => s + (r.actual ?? 0), 0) : null;
  const allActual = aggregate(monthRows).spend;
  const total: BudgetProgress = budgetProgress(totalPlanned, totalActual, month, today);
  const totalAllocated = rowsView.some((r) => r.allocated != null) ? rowsView.reduce((s, r) => s + (r.allocated ?? 0), 0) : null;
  const elapsed = monthElapsed(month, today);

  const hasPlanValue = (p: PlanRow) => p.plannedBudget != null || Object.values(PLAN_TARGET_COLUMN).some((c) => p[c as keyof PlanRow] != null);
  const hasAnyPlan = plans.some((p) => p.period === month && hasPlanValue(p));
  const prev = prevMonth(month);
  const prevHasPlan = plans.some((p) => p.period === prev);

  // ---- Lịch sử các tháng (kế hoạch ↔ thực tế, cả phòng) ----
  const historyMonths = [...new Set([...months, ...plans.map((p) => p.period), month])].sort().reverse().slice(0, 8);
  // Mỗi tháng chỉ so các SBU đã có ngân sách kế hoạch tháng đó (cả hai vế cùng tập SBU).
  const history = historyMonths.map((p) => {
    const rowsP = metrics.filter((m) => m.periodType === "month" && m.period === p);
    const planned = units.reduce<number | null>((s, u) => {
      const v = num(planOfUnit(plans, u, p)?.plannedBudget);
      return v == null ? s : (s ?? 0) + v;
    }, null);
    const actualRows = units.filter((u) => num(planOfUnit(plans, u, p)?.plannedBudget) != null).flatMap((u) => rowsOfUnit(rowsP, u));
    const actual = actualRows.length ? aggregate(actualRows).spend : null;
    return { p, planned, actual, prog: budgetProgress(planned, actual, p, today) };
  });

  const money = (v: number | null) => fmtMoney(v);
  const planCell = (r: (typeof rowsView)[number]) =>
    canManage ? (
      <InlineNum
        value={r.plan?.plannedBudget}
        display={r.planned != null ? money(r.planned) : <span className="text-muted-foreground/50">＋ lập KH</span>}
        title={`Ngân sách kế hoạch — ${r.u.code}, ${monthLabel(month)}`}
        onSave={(v) => savePlan({ line: r.u.line, period: month, sbuId: r.u.sbuId }, "plannedBudget", v)}
      />
    ) : r.planned != null ? (
      money(r.planned)
    ) : (
      <span className="text-muted-foreground/50">—</span>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold">Kế hoạch mọi SBU — {monthLabel(month)}</h3>
          <p className="text-xs text-muted-foreground">
            Lập ngân sách và mục tiêu đầu tháng, theo dõi thực tế so với kế hoạch ngay bên dưới. {canManage ? "Bấm vào ô để nhập/sửa (Enter xuống dòng, Tab sang phải)." : ""}
          </p>
        </div>
        {canManage && !hasAnyPlan && prevHasPlan && (
          <Button
            size="sm"
            variant="outline"
            disabled={copying}
            onClick={() =>
              startCopy(async () => {
                const res = await copyAdsPlansAction({ lines: ALL_LINES, from: prev, to: month });
                if (res.ok) {
                  toast.success(res.data.copied ? `Đã sao chép ${res.data.copied} dòng kế hoạch từ ${monthLabel(prev)} — điều chỉnh lại cho phù hợp.` : "Không có gì để sao chép.");
                  router.refresh();
                } else toast.error(res.error);
              })
            }
          >
            <Copy className="mr-1 h-4 w-4" /> Sao chép từ {monthLabel(prev)}
          </Button>
        )}
      </div>

      {!hasAnyPlan && (
        <div className="rounded-xl border border-dashed border-amber-400/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <b>Chưa lập kế hoạch cho {monthLabel(month)}.</b> {canManage ? "Nhập ngân sách ở bảng dưới" : "Nhờ người phụ trách nhập ngân sách"}
          {prevHasPlan && canManage ? ` hoặc bấm “Sao chép từ ${monthLabel(prev)}”` : ""}; sau đó đặt mục tiêu theo phễu.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Ngân sách kế hoạch" value={money(totalPlanned)} icon={Coins} tone="brand" hint={totalPlanned == null ? "Chưa lập" : undefined} />
        <StatCard
          label="Đã dùng (SBU có kế hoạch)"
          value={money(totalActual)}
          icon={Gauge}
          tone={total.status === "over" ? "crit" : total.status === "fast" ? "warn" : "default"}
          hint={
            <div className="space-y-1">
              <UsageBar used={total.used} elapsed={elapsed} tone={BAR_TONE[total.status]} />
              <span>
                {total.used != null ? `${Math.round(total.used * 100)}% KH` : "—"} · tháng đã trôi {Math.round(elapsed * 100)}%
              </span>
            </div>
          }
        />
        <StatCard
          label="Dự báo cuối tháng"
          value={money(total.forecast)}
          icon={TrendingUp}
          hint={total.forecast != null && totalPlanned ? `${total.forecast >= totalPlanned ? "Vượt" : "Thấp hơn"} KH ${fmtPct(Math.abs(total.forecast / totalPlanned - 1), 0)}` : "Theo tốc độ chi hiện tại"}
        />
        <StatCard label="Tình trạng" value={<StatusPill tone={STATUS_TONE[total.status]}>{BUDGET_STATUS_LABEL[total.status]}</StatusPill>} icon={CalendarCheck} hint={totalAllocated != null && totalPlanned ? `Request đã phân bổ ${money(totalAllocated)} / ${money(totalPlanned)}` : undefined} />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Ngân sách — kế hoạch so với thực tế</h3>
          <p className="text-xs text-muted-foreground">Thực tế lấy từ số liệu tháng ({monthLabel(month)}). “Đã phân bổ” = tổng ngân sách kế hoạch của các request đã tạo cho SBU đó (Hệ thống không có request riêng).</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">SBU</th>
                <th className="px-3 py-2 text-right font-medium">Kế hoạch</th>
                <th className="px-3 py-2 text-right font-medium">Thực tế</th>
                <th className="w-40 px-3 py-2 text-left font-medium">% đã dùng</th>
                <th className="px-3 py-2 text-right font-medium">Dự báo cuối tháng</th>
                <th className="px-3 py-2 text-right font-medium">Đã phân bổ (request)</th>
                <th className="px-3 py-2 text-left font-medium">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rowsView.map((r) => (
                <tr key={r.u.key} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium" title={r.u.label}>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: r.u.color }} />
                      {r.u.kind === "ho" ? "Hệ thống (HO)" : r.u.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{planCell(r)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.actual != null ? money(r.actual) : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <UsageBar used={r.prog.used} elapsed={elapsed} tone={BAR_TONE[r.prog.status]} />
                      </div>
                      <span className="w-10 text-xs tabular-nums text-muted-foreground">{r.prog.used != null ? `${Math.round(r.prog.used * 100)}%` : "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(r.prog.forecast)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.allocated == null ? (
                      <span className="text-muted-foreground/50">—</span>
                    ) : (
                      <button type="button" className="hover:underline" onClick={onOpenRequests} title="Mở danh sách request">
                        {r.allocated ? money(r.allocated) : <span className="text-muted-foreground/50">0</span>}
                        {r.planned ? <span className="text-xs text-muted-foreground"> ({Math.round((r.allocated / r.planned) * 100)}%)</span> : null}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={STATUS_TONE[r.prog.status]}>{BUDGET_STATUS_LABEL[r.prog.status]}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/40 font-semibold">
              <tr>
                <td className="px-3 py-2">Tổng — SBU đã lập kế hoạch</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalPlanned)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalActual)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{total.used != null ? `${Math.round(total.used * 100)}%` : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(total.forecast)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalAllocated)}</td>
                <td className="px-3 py-2">
                  <StatusPill tone={STATUS_TONE[total.status]}>{BUDGET_STATUS_LABEL[total.status]}</StatusPill>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Dòng tổng, % đã dùng và dự báo chỉ so các SBU ĐÃ lập kế hoạch. Tổng chi toàn phòng {monthLabel(month)} (gồm cả SBU chưa lập kế hoạch): <b className="text-foreground">{money(allActual)}</b>.
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Target className="h-4 w-4 text-muted-foreground" />
          <div className="mr-auto">
            <h3 className="text-sm font-semibold">Mục tiêu theo phễu — kế hoạch so với thực tế</h3>
            <p className="text-xs text-muted-foreground">
              Mục tiêu Lead/HVM của B2C là số TỔNG (Hệ thống + Trung tâm), lập ở dòng Hệ thống — cùng quy ước với số thực tế; từng trung tâm chỉ lập ngân sách. Thực tế lấy từ số liệu tháng; “đúng nhịp” = % đạt không thấp hơn phần tháng đã trôi qua.
            </p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Chỉ số</th>
                <th className="px-3 py-2 text-right font-medium">Mục tiêu</th>
                <th className="px-3 py-2 text-right font-medium">Thực tế</th>
                <th className="w-44 px-3 py-2 text-left font-medium">% đạt</th>
                <th className="px-3 py-2 text-left font-medium">Tình trạng</th>
              </tr>
            </thead>
            {units.filter(hasFunnelTargets).map((u) => (
              <FunnelBlock key={u.key} unit={u} month={month} metrics={metrics} monthRows={monthRows} plans={plans} elapsed={elapsed} totalPlanned={num(planOfUnit(plans, u, month)?.plannedBudget)} canManage={canManage} savePlan={savePlan} />
            ))}
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Các tháng gần đây — kế hoạch ngân sách so với thực tế</h3>
          <p className="text-xs text-muted-foreground">Mỗi tháng chỉ so các SBU đã lập kế hoạch tháng đó. Bấm 1 dòng để xem kế hoạch của tháng đó.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tháng</th>
                <th className="px-3 py-2 text-right font-medium">Kế hoạch</th>
                <th className="px-3 py-2 text-right font-medium">Thực tế</th>
                <th className="px-3 py-2 text-right font-medium">% đã dùng</th>
                <th className="px-3 py-2 text-left font-medium">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h) => (
                <tr key={h.p} onClick={() => onMonthChange(h.p)} className={cn("cursor-pointer hover:bg-muted/30", h.p === month && "bg-brand/[0.05]")}>
                  <td className={cn("px-3 py-2 font-medium", h.p === month && "text-brand")}>
                    {monthLabel(h.p)}
                    {h.p === currentMonth && <span className="ml-1.5 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">hiện tại</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.planned != null ? money(h.planned) : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.actual != null ? money(h.actual) : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.prog.used != null ? `${Math.round(h.prog.used * 100)}%` : "—"}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={STATUS_TONE[h.prog.status]}>{BUDGET_STATUS_LABEL[h.prog.status]}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Mục tiêu phễu của 1 SBU "chủ" (Hệ thống = tổng B2C; Ecom/VMP/VMT). Phễu lấy theo cấu hình line (lib/ads-lines.ts). */
function FunnelBlock({
  unit,
  month,
  metrics,
  monthRows,
  plans,
  elapsed,
  totalPlanned,
  canManage,
  savePlan,
}: {
  unit: AdsUnit;
  month: string;
  metrics: MetricRow[];
  monthRows: MetricRow[];
  plans: PlanRow[];
  elapsed: number;
  totalPlanned: number | null;
  canManage: boolean;
  savePlan: ReturnType<typeof usePlanSaver>;
}) {
  const group = groupOfLine(unit.line);
  const isHo = unit.kind === "ho";
  const plan = planOfUnit(plans, unit, month);
  // Hệ thống: số thực tế cả B2C (Hệ thống + mọi trung tâm); các SBU khác: dòng của chính SBU.
  const rows = isHo ? monthRows.filter((m) => m.line === "b2c_system" || m.line === "b2c_center") : rowsOfUnit(monthRows, unit);
  const b2c = isHo ? b2cSummary(metrics, [month]) : null;
  const agg = aggregate(rows);
  const actualOf = (f: FunnelField): number | null => {
    if (b2c && f === "leads") return b2c.leads;
    if (b2c && f === "newStudents") return b2c.newStudents;
    return agg[f];
  };
  const targetOf = (f: FunnelField): number | null => num(plan?.[PLAN_TARGET_COLUMN[f] as keyof PlanRow] as string | null | undefined);
  const leadTarget = targetOf(group.leadField);
  const convTarget = targetOf("newStudents");
  const spendBase = b2c ? b2c.totalSpend : agg.spend;
  const leadActual = actualOf(group.leadField);
  const convActual = actualOf("newStudents");
  const actualLeadCost = spendBase != null && leadActual ? Math.round(spendBase / leadActual) : null;
  const actualCac = spendBase != null && convActual ? Math.round(spendBase / convActual) : null;
  // CPL/CAC kế hoạch: NS KH ÷ mục tiêu. Hệ thống: mục tiêu là tổng B2C nên chia tổng NS KH của B2C (Hệ thống + trung tâm).
  const b2cPlanned = isHo
    ? plans.filter((p) => (p.line === "b2c_system" || p.line === "b2c_center") && p.period === month && p.plannedBudget != null).reduce((s, p) => s + (num(p.plannedBudget) ?? 0), 0) || null
    : totalPlanned;
  const plannedLeadCost = plannedUnitCost(b2cPlanned, leadTarget);
  const plannedCac = plannedUnitCost(b2cPlanned, convTarget);
  const leadCostName = group.leadField === "mql" ? "CP/MQL" : "CPL";

  return (
    <tbody className="divide-y border-t-2">
      <tr className="bg-muted/40">
        <th colSpan={5} className="px-3 py-1.5 text-left text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: unit.color }} />
            {isHo ? "B2C Offline — mục tiêu tổng (Hệ thống + Trung tâm)" : unit.label}
          </span>
        </th>
      </tr>
      {group.funnel.map((f) => (
        <FunnelRow
          key={f.field}
          def={f}
          target={targetOf(f.field)}
          actual={actualOf(f.field)}
          elapsed={elapsed}
          plan={plan}
          canManage={canManage}
          onSave={(v) => savePlan({ line: unit.line, period: month, sbuId: unit.sbuId }, PLAN_TARGET_COLUMN[f.field], v)}
        />
      ))}
      <tr>
        <td colSpan={5} className="bg-muted/20 px-3 py-2">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <UnitCost label={`${leadCostName} kế hoạch → thực tế`} planned={plannedLeadCost} actual={actualLeadCost} hint={leadTarget ? `= NS KH ÷ mục tiêu ${group.funnel.find((f) => f.field === group.leadField)?.label}` : "Cần NS kế hoạch và mục tiêu đầu phễu"} />
            <UnitCost label="CAC kế hoạch → thực tế" planned={plannedCac} actual={actualCac} hint={convTarget ? `= NS KH ÷ mục tiêu ${group.conversionLabel}` : `Cần NS kế hoạch và mục tiêu ${group.conversionLabel}`} />
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function FunnelRow({
  def,
  target,
  actual,
  elapsed,
  plan,
  canManage,
  onSave,
}: {
  def: FunnelDef;
  target: number | null;
  actual: number | null;
  elapsed: number;
  plan: PlanRow | undefined;
  canManage: boolean;
  onSave: (v: string | null) => Promise<unknown>;
}) {
  const prog = targetProgress(def.field, target, actual, elapsed);
  const showVal = (v: number | null) => (v == null ? "—" : def.kind === "money" ? fmtMoney(v) : fmt(v));
  const raw = plan?.[PLAN_TARGET_COLUMN[def.field] as keyof PlanRow] as string | null | undefined;
  const tone = prog.status === "achieved" ? "bg-emerald-500" : prog.status === "behind" ? "bg-red-500" : "bg-sky-500";
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2 font-medium">{def.label}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {canManage ? (
          <InlineNum value={raw} display={target != null ? showVal(target) : <span className="text-muted-foreground/50">＋ đặt mục tiêu</span>} title={`Mục tiêu ${def.label}`} onSave={onSave} />
        ) : target != null ? (
          showVal(target)
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{actual != null ? showVal(actual) : <span className="text-muted-foreground/50">—</span>}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-24">
            <UsageBar used={prog.pct} elapsed={elapsed} tone={tone} />
          </div>
          <span className="w-10 text-xs tabular-nums text-muted-foreground">{prog.pct != null ? `${Math.round(prog.pct * 100)}%` : "—"}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusPill tone={TARGET_TONE[prog.status]}>{TARGET_LABEL[prog.status]}</StatusPill>
      </td>
    </tr>
  );
}

function UnitCost({ label, planned, actual, hint }: { label: string; planned: number | null; actual: number | null; hint: string }) {
  const diff = planned && actual != null ? actual / planned - 1 : null;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2 font-semibold tabular-nums">
        <span>{fmtMoney(planned)}</span>
        <span className="text-muted-foreground">→</span>
        <span>{fmtMoney(actual)}</span>
        {diff != null && <span className={cn("text-xs font-medium", diff > 0.1 ? "text-red-600" : diff < -0.1 ? "text-emerald-600" : "text-muted-foreground")}>{diff > 0 ? "+" : ""}{Math.round(diff * 100)}%</span>}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
