"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportMenu } from "@/components/report/export-menu";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { todayVnDayStr } from "@/lib/time";
import { useSessionState } from "@/lib/use-session-state";
import { computeAdsAlerts, type AdsAlert } from "./alerts";
import { DisbursementPanel } from "./disbursement-panel";
import { MonthPicker, QuarterPicker } from "./ads-ui";
import { AdsImportButton } from "./import-dialog";
import { MonthlyView } from "./monthly-view";
import { OverviewView, type OverviewRange } from "./overview-view";
import { RequestsView } from "./requests-view";
import { prevQuarter, quarterKey, quarterLabel, quarterMonths, type EcomProductRow } from "./rollups";
import { monthLabel, nextWeek, prevMonth, type CampaignRow, type DisbursementRow, type MetricRow, type SbuLite } from "./shared";
import { Segmented, WeeklyView } from "./weekly-view";

type Tab = "overview" | "week" | "month" | "request" | "disbursement";

/**
 * Container mỏng: Tổng quan (mới) + 3 chu kỳ report thật của phòng Marketing
 * (xem CLAUDE.md "Ads redesign") + Giải ngân:
 * - Theo tuần: Thứ 7 → hết Thứ 6, chỉ Mục 1 + Mục 2, chỉ ngân sách + Mess.
 * - Theo tháng: đủ 6 mảng, đủ CPL/CAC/CVR/điểm hiệu quả.
 * - Theo request: từng chiến dịch Facebook riêng theo trung tâm, không gộp kỳ.
 * Tháng đang xem dùng chung giữa Tổng quan và Theo tháng.
 */
export function AdsView({
  metrics,
  sbus,
  campaigns,
  users,
  ecomProducts,
  disbursementPlan,
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
  disbursementPlan: DisbursementRow[];
  canManage: boolean;
  currentMonth: string;
  weeks: string[];
  rubric: EffectivenessRubric;
}) {
  const months = React.useMemo(() => [...new Set(metrics.filter((m) => m.periodType === "month").map((m) => m.period))].sort(), [metrics]);
  // Mặc định: tháng gần nhất CÓ dữ liệu (đầu tháng mới thường chưa có số).
  // Tab / tháng / quý đang xem được nhớ theo tab trình duyệt (Back quay về đúng chỗ).
  const [month, setMonth] = useSessionState<string>("ads:month", months[months.length - 1] ?? currentMonth);
  const [tab, setTab] = useSessionState<Tab>("ads:tab", "overview");
  const [mode, setMode] = useSessionState<"month" | "quarter">("ads:mode", "month");
  const quarters = React.useMemo(() => [...new Set(months.map(quarterKey))].sort(), [months]);
  const [quarter, setQuarter] = useSessionState<string>("ads:quarter", quarterKey(months[months.length - 1] ?? currentMonth));

  // Tổng quan: 1 tháng hoặc 1 quý (cộng 3 dòng tháng — không bao giờ cộng từ dữ liệu tuần).
  const range: OverviewRange = React.useMemo(() => {
    if (mode === "month") {
      const prev = prevMonth(month);
      return { kind: "month", key: month, label: monthLabel(month), months: [month], prevLabel: monthLabel(prev, true), prevMonths: [prev], filledMonths: 1 };
    }
    const qm = quarterMonths(quarter);
    const pq = prevQuarter(quarter);
    return { kind: "quarter", key: quarter, label: quarterLabel(quarter), months: qm, prevLabel: quarterLabel(pq), prevMonths: quarterMonths(pq), filledMonths: qm.filter((m) => months.includes(m)).length };
  }, [mode, month, quarter, months]);

  // Cảnh báo luôn rà theo 1 THÁNG: ở chế độ quý lấy tháng mới nhất của quý có số liệu.
  const alertMonth = mode === "month" ? month : ([...range.months].reverse().find((m) => months.includes(m)) ?? range.months[0]);
  // Tuần điền sẵn trong template: tuần kế tiếp sau tuần mới nhất đã có số (không vượt quá hôm nay), nếu chưa có thì để template tự chọn tuần hiện tại.
  const suggestedWeek = React.useMemo(() => {
    const latest = weeks[0];
    if (!latest) return undefined;
    const next = nextWeek(latest);
    return next <= todayVnDayStr() ? next : latest;
  }, [weeks]);
  const alerts = React.useMemo(
    () => computeAdsAlerts({ metrics, sbus, plan: disbursementPlan, rubric, month: alertMonth, currentMonth }),
    [metrics, sbus, disbursementPlan, rubric, alertMonth, currentMonth],
  );
  const critCount = alerts.filter((a) => a.level !== "info").length;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            Tổng quan
            {critCount > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">{critCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="week">Theo tuần</TabsTrigger>
          <TabsTrigger value="month">Theo tháng</TabsTrigger>
          <TabsTrigger value="request">Theo request</TabsTrigger>
          <TabsTrigger value="disbursement">Giải ngân</TabsTrigger>
        </TabsList>
        <div className={canManage && (tab === "week" || tab === "month" || tab === "request") ? "" : "ml-auto"}>
          <ExportMenu kind="growth" period={tab === "overview" && mode === "quarter" ? undefined : month} />
        </div>
        {canManage && (tab === "week" || tab === "month" || tab === "request") && (
          <div className="ml-auto">
            <AdsImportButton
              kind={tab}
              templateQuery={tab === "week" ? (suggestedWeek ? `week=${suggestedWeek}` : undefined) : tab === "month" ? `month=${month}` : undefined}
            />
          </div>
        )}
        {tab === "overview" && (
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "month", label: "Theo tháng" },
                { value: "quarter", label: "Theo quý" },
              ]}
            />
            {mode === "month" ? <MonthPicker months={months} value={month} onChange={setMonth} /> : <QuarterPicker quarters={quarters} value={quarter} onChange={setQuarter} />}
          </div>
        )}
      </div>

      <TabsContent value="overview" className="pt-4">
        <OverviewView metrics={metrics} months={months} range={range} alerts={alerts} alertsMonthLabel={monthLabel(alertMonth)} onOpenTab={(t: AdsAlert["tab"]) => setTab(t)} />
      </TabsContent>

      <TabsContent value="week" className="pt-4">
        <WeeklyView metrics={metrics} sbus={sbus} canManage={canManage} weeks={weeks} />
      </TabsContent>

      <TabsContent value="month" className="pt-4">
        <MonthlyView metrics={metrics} sbus={sbus} campaigns={campaigns} ecomProducts={ecomProducts} canManage={canManage} months={months} month={month} onMonthChange={setMonth} rubric={rubric} />
      </TabsContent>

      <TabsContent value="request" className="pt-4">
        <RequestsView campaigns={campaigns} sbus={sbus} users={users} canManage={canManage} />
      </TabsContent>

      <TabsContent value="disbursement" className="pt-4">
        <DisbursementPanel plan={disbursementPlan} metrics={metrics} canManage={canManage} currentMonth={currentMonth} />
      </TabsContent>
    </Tabs>
  );
}
