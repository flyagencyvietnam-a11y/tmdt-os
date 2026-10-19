"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportMenu } from "@/components/report/export-menu";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { todayVnDayStr } from "@/lib/time";
import { useSessionState } from "@/lib/use-session-state";
import { computeAdsAlerts, type AdsAlert } from "./alerts";
import { MonthPicker, QuarterPicker, Segmented } from "./ads-ui";
import { AdsImportButton } from "./import-dialog";
import { MonthlyView } from "./monthly-view";
import { OverviewView, type OverviewRange } from "./overview-view";
import { PlanPanel } from "./plan-panel";
import { QuarterlyView } from "./quarterly-view";
import { RequestsView } from "./requests-view";
import { prevQuarter, quarterKey, quarterLabel, quarterMonths, type EcomProductRow } from "./rollups";
import { monthLabel, nextMonth, nextWeek, prevMonth, type CampaignRow, type MetricRow, type PlanRow, type SbuLite } from "./shared";
import { buildAdsUnits } from "./units";
import { WeeklyView } from "./weekly-view";

type Tab = "overview" | "plan" | "request" | "week" | "month" | "quarter";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Tổng quan" },
  { value: "plan", label: "Kế hoạch & tiến độ" },
  { value: "request", label: "Request" },
  { value: "week", label: "Báo cáo tuần" },
  { value: "month", label: "Báo cáo tháng" },
  { value: "quarter", label: "Báo cáo quý" },
];

/**
 * Container Growth Performance (SPEC Phụ lục D mục 26): KHÔNG còn tab theo mảng — Hệ thống, trung tâm, Ecom, VMP, VMT là SBU ngang hàng
 * trong cùng một danh sách. Tab: Tổng quan · Kế hoạch & tiến độ · Request · Báo cáo tuần · Báo cáo tháng · Báo cáo quý. Tháng đang xem dùng chung
 * giữa Tổng quan và Kế hoạch; ba báo cáo có bộ chọn KHOẢNG kỳ riêng ngay trong view.
 */
export function AdsView({
  metrics,
  sbus,
  campaigns,
  users,
  ecomProducts,
  plans,
  canManage,
  currentMonth,
  weeks,
  rubric,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  users: { id: string; fullName: string }[];
  ecomProducts: EcomProductRow[];
  plans: PlanRow[];
  canManage: boolean;
  currentMonth: string;
  /** Mọi tuần đã có số liệu, mới nhất trước. */
  weeks: string[];
  rubric: EffectivenessRubric;
}) {
  const units = React.useMemo(() => buildAdsUnits(sbus), [sbus]);

  // Danh sách tháng chọn được: tháng có số liệu/kế hoạch + tháng hiện tại + tháng sau (để lập kế hoạch trước khi tháng bắt đầu).
  const months = React.useMemo(
    () => [...new Set([...metrics.filter((m) => m.periodType === "month").map((m) => m.period), ...plans.map((p) => p.period), currentMonth, nextMonth(currentMonth)])].sort(),
    [metrics, plans, currentMonth],
  );
  const metricMonths = React.useMemo(() => [...new Set(metrics.filter((m) => m.periodType === "month").map((m) => m.period))].sort(), [metrics]);
  const [month, setMonth] = useSessionState<string>("ads:month", currentMonth);
  const [tab, setTab] = useSessionState<Tab>("ads:tab:v3", "overview");
  const [mode, setMode] = useSessionState<"month" | "quarter">("ads:mode", "month");
  const quarters = React.useMemo(() => [...new Set(months.map(quarterKey))].sort(), [months]);
  const [quarter, setQuarter] = useSessionState<string>("ads:quarter", quarterKey(currentMonth));

  // Tổng quan: 1 tháng hoặc 1 quý (cộng 3 dòng tháng — không bao giờ cộng từ dữ liệu tuần).
  const range: OverviewRange = React.useMemo(() => {
    if (mode === "month") {
      const prev = prevMonth(month);
      return { kind: "month", key: month, label: monthLabel(month), months: [month], prevLabel: monthLabel(prev, true), prevMonths: [prev], filledMonths: 1 };
    }
    const qm = quarterMonths(quarter);
    const pq = prevQuarter(quarter);
    return { kind: "quarter", key: quarter, label: quarterLabel(quarter), months: qm, prevLabel: quarterLabel(pq), prevMonths: quarterMonths(pq), filledMonths: qm.filter((m) => metricMonths.includes(m)).length };
  }, [mode, month, quarter, metricMonths]);

  // Cảnh báo luôn rà theo 1 THÁNG: ở chế độ quý lấy tháng mới nhất của quý có số liệu.
  const alertMonth = mode === "month" ? month : ([...range.months].reverse().find((m) => metricMonths.includes(m)) ?? range.months[0]);
  const alerts = React.useMemo(() => computeAdsAlerts({ metrics, sbus, plan: plans, rubric, month: alertMonth, currentMonth }), [metrics, sbus, plans, rubric, alertMonth, currentMonth]);
  const critCount = alerts.filter((a) => a.level !== "info").length;
  const badgeOf = (t: Tab) => (t === "overview" ? critCount : alerts.filter((a) => a.tab === t && a.level !== "info").length);

  const openAlert = (a: AdsAlert) => setTab(a.tab);

  // Từ Tổng quan mở kế hoạch; ở chế độ quý thì nhảy tới tháng mới nhất của quý.
  const openPlan = () => {
    if (mode === "quarter") setMonth(range.months[range.months.length - 1]);
    setTab("plan");
  };

  // Template import điền sẵn khung theo kỳ đang xem.
  const suggestedWeek = React.useMemo(() => {
    const latest = weeks[0];
    if (!latest) return undefined;
    const next = nextWeek(latest);
    return next <= todayVnDayStr() ? next : latest;
  }, [weeks]);
  const importQuery = new URLSearchParams();
  if (tab === "week" && suggestedWeek) importQuery.set("week", suggestedWeek);
  if (tab === "month" || tab === "plan") importQuery.set("month", month);
  const importKind = tab === "plan" || tab === "request" || tab === "week" || tab === "month" ? tab : null;

  const showMonthPicker = tab === "plan" || (tab === "overview" && mode === "month");
  const showExport = tab === "overview" || tab === "plan";

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {TABS.map((t) => {
            const n = badgeOf(t.value);
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {n > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{n}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {tab === "overview" && (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "month", label: "Theo tháng" },
                { value: "quarter", label: "Theo quý" },
              ]}
            />
          )}
          {showMonthPicker && <MonthPicker months={months} value={month} onChange={setMonth} />}
          {tab === "overview" && mode === "quarter" && <QuarterPicker quarters={quarters} value={quarter} onChange={setQuarter} />}
          {showExport && <ExportMenu kind="growth" period={tab === "overview" && mode === "quarter" ? quarter : month} />}
          {canManage && importKind && <AdsImportButton key={importKind} kind={importKind} templateQuery={importQuery.toString()} />}
        </div>
      </div>

      <TabsContent value="overview" className="pt-4">
        {mode === "month" && !metricMonths.includes(month) && metricMonths.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-2.5 text-sm text-muted-foreground">
            Chưa có số liệu thực tế của {monthLabel(month)}.
            <button type="button" className="font-medium text-brand hover:underline" onClick={() => setMonth(metricMonths[metricMonths.length - 1])}>
              Xem {monthLabel(metricMonths[metricMonths.length - 1])} (tháng gần nhất có số) →
            </button>
          </div>
        )}
        <OverviewView metrics={metrics} units={units} months={metricMonths} range={range} alerts={alerts} alertsMonthLabel={monthLabel(alertMonth)} onOpenAlert={openAlert} plans={plans} onOpenPlan={openPlan} />
      </TabsContent>

      <TabsContent value="plan" className="pt-4">
        <PlanPanel
          month={month}
          months={months}
          currentMonth={currentMonth}
          metrics={metrics}
          plans={plans}
          campaigns={campaigns}
          units={units}
          canManage={canManage}
          onMonthChange={setMonth}
          onOpenRequests={() => setTab("request")}
        />
      </TabsContent>

      <TabsContent value="request" className="pt-4">
        <RequestsView campaigns={campaigns} units={units} users={users} canManage={canManage} />
      </TabsContent>

      <TabsContent value="week" className="pt-4">
        <WeeklyView metrics={metrics} units={units} canManage={canManage} weeks={weeks} />
      </TabsContent>

      <TabsContent value="month" className="pt-4">
        <MonthlyView metrics={metrics} units={units} centers={sbus} ecomProducts={ecomProducts} canManage={canManage} currentMonth={currentMonth} months={metricMonths} rubric={rubric} />
      </TabsContent>

      <TabsContent value="quarter" className="pt-4">
        <QuarterlyView metrics={metrics} units={units} canManage={canManage} currentMonth={currentMonth} months={metricMonths} />
      </TabsContent>
    </Tabs>
  );
}
