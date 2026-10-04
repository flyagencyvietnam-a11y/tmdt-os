"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { computeAdsAlerts, type AdsAlert } from "./alerts";
import { DisbursementPanel } from "./disbursement-panel";
import { MonthlyView, MonthPicker } from "./monthly-view";
import { OverviewView } from "./overview-view";
import { RequestsView } from "./requests-view";
import { WeeklyView } from "./weekly-view";
import type { CampaignRow, DisbursementRow, MetricRow, SbuLite } from "./shared";

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
  disbursementPlan,
  canManage,
  currentMonth,
  weeks,
  rubric,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  disbursementPlan: DisbursementRow[];
  canManage: boolean;
  currentMonth: string;
  weeks: string[];
  rubric: EffectivenessRubric;
}) {
  const months = React.useMemo(() => [...new Set(metrics.filter((m) => m.periodType === "month").map((m) => m.period))].sort(), [metrics]);
  // Mặc định: tháng gần nhất CÓ dữ liệu (đầu tháng mới thường chưa có số).
  const [month, setMonth] = React.useState(() => months[months.length - 1] ?? currentMonth);
  const [tab, setTab] = React.useState<Tab>("overview");

  const alerts = React.useMemo(
    () => computeAdsAlerts({ metrics, sbus, plan: disbursementPlan, rubric, month, currentMonth }),
    [metrics, sbus, disbursementPlan, rubric, month, currentMonth],
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
        {tab === "overview" && (
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            Tháng
            <MonthPicker months={months} value={month} onChange={setMonth} />
          </div>
        )}
      </div>

      <TabsContent value="overview" className="pt-4">
        <OverviewView metrics={metrics} months={months} month={month} rubric={rubric} alerts={alerts} onOpenTab={(t: AdsAlert["tab"]) => setTab(t)} />
      </TabsContent>

      <TabsContent value="week" className="pt-4">
        <WeeklyView metrics={metrics} sbus={sbus} canManage={canManage} weeks={weeks} />
      </TabsContent>

      <TabsContent value="month" className="pt-4">
        <MonthlyView metrics={metrics} sbus={sbus} campaigns={campaigns} canManage={canManage} months={months} month={month} onMonthChange={setMonth} rubric={rubric} />
      </TabsContent>

      <TabsContent value="request" className="pt-4">
        <RequestsView campaigns={campaigns} sbus={sbus} canManage={canManage} />
      </TabsContent>

      <TabsContent value="disbursement" className="pt-4">
        <DisbursementPanel plan={disbursementPlan} metrics={metrics} canManage={canManage} currentMonth={currentMonth} />
      </TabsContent>
    </Tabs>
  );
}
