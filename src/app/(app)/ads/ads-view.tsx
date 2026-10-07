"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportMenu } from "@/components/report/export-menu";
import { ADS_GROUPS, type AdsGroupKey } from "@/lib/ads-lines";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { useSessionState } from "@/lib/use-session-state";
import { computeAdsAlerts, type AdsAlert } from "./alerts";
import { MonthPicker, QuarterPicker } from "./ads-ui";
import { LineView, type LineSub } from "./line-view";
import { OverviewView, type OverviewRange } from "./overview-view";
import { prevQuarter, quarterKey, quarterLabel, quarterMonths, type EcomProductRow } from "./rollups";
import { monthLabel, nextMonth, prevMonth, type CampaignRow, type MetricRow, type PlanRow, type SbuLite } from "./shared";
import { Segmented } from "./weekly-view";

type Tab = "overview" | AdsGroupKey;

/**
 * Container Growth Performance (SPEC Phụ lục D mục 21): tab lớn = Tổng quan + từng MẢNG (B2C, Ecom, B2B, VMP, VMT).
 * Trong mỗi mảng cùng 1 luồng: Kế hoạch & tiến độ → Request → Báo cáo tuần → Báo cáo tháng.
 * Tháng đang xem dùng chung giữa Tổng quan và mọi mảng.
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
  weeks: string[];
  rubric: EffectivenessRubric;
}) {
  // Tháng có số liệu HOẶC có kế hoạch (để chọn được tháng đã lập kế hoạch mà chưa có số).
  // Danh sách tháng chọn được: tháng có số liệu/kế hoạch + tháng hiện tại + tháng sau (để lập kế hoạch trước khi tháng bắt đầu).
  const months = React.useMemo(
    () => [...new Set([...metrics.filter((m) => m.periodType === "month").map((m) => m.period), ...plans.map((p) => p.period), currentMonth, nextMonth(currentMonth)])].sort(),
    [metrics, plans, currentMonth],
  );
  const metricMonths = React.useMemo(() => [...new Set(metrics.filter((m) => m.periodType === "month").map((m) => m.period))].sort(), [metrics]);
  // Mặc định: tháng hiện tại (nơi lập kế hoạch), nếu chưa có gì thì tháng gần nhất có dữ liệu.
  const [month, setMonth] = useSessionState<string>("ads:month", currentMonth);
  const [tab, setTab] = useSessionState<Tab>("ads:tab:v2", "overview");
  const [subs, setSubs] = useSessionState<Partial<Record<AdsGroupKey, LineSub>>>("ads:subs", {});
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
  const alertsOf = (g: AdsGroupKey) => alerts.filter((a) => (a.group ?? "b2c") === g && a.level !== "info").length;

  const openAlert = (a: AdsAlert) => {
    const g = a.group ?? "b2c";
    setSubs((p) => ({ ...p, [g]: a.tab }));
    setTab(g);
  };

  // Từ Tổng quan mở kế hoạch của 1 mảng; ở chế độ quý thì nhảy tới tháng mới nhất của quý.
  const openGroupPlan = (g: AdsGroupKey) => {
    if (mode === "quarter") setMonth(range.months[range.months.length - 1]);
    setSubs((p) => ({ ...p, [g]: "plan" }));
    setTab(g);
  };

  const showMonth = tab !== "overview" || mode === "month";

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            Tổng quan
            {critCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{critCount}</span>}
          </TabsTrigger>
          {ADS_GROUPS.map((g) => {
            const n = alertsOf(g.key);
            return (
              <TabsTrigger key={g.key} value={g.key}>
                <span className="mr-1.5 h-2.5 w-2.5 rounded-[3px]" style={{ background: g.color }} />
                {g.label}
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
          {showMonth ? <MonthPicker months={months} value={month} onChange={setMonth} /> : <QuarterPicker quarters={quarters} value={quarter} onChange={setQuarter} />}
          <ExportMenu kind="growth" period={tab === "overview" && mode === "quarter" ? undefined : month} />
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
        <OverviewView metrics={metrics} months={metricMonths} range={range} alerts={alerts} alertsMonthLabel={monthLabel(alertMonth)} onOpenTab={openAlert} plans={plans} onOpenGroup={openGroupPlan} />
      </TabsContent>

      {ADS_GROUPS.map((g) => (
        <TabsContent key={g.key} value={g.key} className="pt-4">
          <LineView
            group={g}
            sub={subs[g.key] ?? "plan"}
            onSubChange={(s) => setSubs((p) => ({ ...p, [g.key]: s }))}
            metrics={metrics}
            plans={plans}
            campaigns={campaigns}
            sbus={sbus}
            users={users}
            ecomProducts={ecomProducts}
            weeks={weeks}
            canManage={canManage}
            month={month}
            months={months}
            currentMonth={currentMonth}
            onMonthChange={setMonth}
            rubric={rubric}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
