"use client";

import * as React from "react";
import type { AdsGroupConfig } from "@/lib/ads-lines";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { AdsImportButton } from "./import-dialog";
import { LineWeeklyView } from "./line-weekly";
import { MonthlyView } from "./monthly-view";
import { PlanPanel } from "./plan-panel";
import { RequestsView } from "./requests-view";
import type { EcomProductRow } from "./rollups";
import { nextWeek, type CampaignRow, type MetricRow, type PlanRow, type SbuLite } from "./shared";
import { Segmented, WeeklyView } from "./weekly-view";
import { todayVnDayStr } from "@/lib/time";

export type LineSub = "plan" | "request" | "week" | "month";

const SUB_LABEL: Record<LineSub, string> = { plan: "Kế hoạch & tiến độ", request: "Request", week: "Báo cáo tuần", month: "Báo cáo tháng" };
const SUB_ORDER: LineSub[] = ["plan", "request", "week", "month"];

/**
 * Một MẢNG của Growth Performance. Mọi mảng có CÙNG cấu trúc (SPEC Phụ lục D mục 21):
 * Kế hoạch & tiến độ → Request → Báo cáo tuần → Báo cáo tháng. Khác biệt giữa các mảng chỉ nằm ở cấu hình (lib/ads-lines.ts)
 * và vài phần riêng (B2C: chi tiết trung tâm; Ecom: theo sản phẩm).
 */
export function LineView({
  group,
  sub,
  onSubChange,
  metrics,
  plans,
  campaigns,
  sbus,
  users,
  ecomProducts,
  weeks,
  canManage,
  month,
  months,
  currentMonth,
  onMonthChange,
  rubric,
}: {
  group: AdsGroupConfig;
  sub: LineSub;
  onSubChange: (s: LineSub) => void;
  metrics: MetricRow[];
  plans: PlanRow[];
  campaigns: CampaignRow[];
  sbus: SbuLite[];
  users: { id: string; fullName: string }[];
  ecomProducts: EcomProductRow[];
  /** Mọi tuần đã có số liệu (mọi mảng), mới nhất trước. */
  weeks: string[];
  canManage: boolean;
  month: string;
  months: string[];
  currentMonth: string;
  onMonthChange: (m: string) => void;
  rubric: EffectivenessRubric;
}) {
  const isB2c = group.key === "b2c";
  const groupCampaigns = React.useMemo(() => campaigns.filter((c) => group.lines.includes(c.line)), [campaigns, group]);
  const groupWeeks = React.useMemo(() => [...new Set(metrics.filter((m) => m.periodType === "week" && group.lines.includes(m.line)).map((m) => m.period))].sort().reverse(), [metrics, group]);
  const suggestedWeek = React.useMemo(() => {
    const latest = groupWeeks[0] ?? weeks[0];
    if (!latest) return undefined;
    const next = nextWeek(latest);
    return next <= todayVnDayStr() ? next : latest;
  }, [groupWeeks, weeks]);

  // Import Excel: mỗi mục con có template riêng, điền sẵn khung theo mảng đang xem (?group=).
  const importKind = sub;
  const q = new URLSearchParams({ group: group.key });
  if (sub === "week" && suggestedWeek) q.set("week", suggestedWeek);
  if (sub === "month" || sub === "plan") q.set("month", month);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={sub} onChange={onSubChange} options={SUB_ORDER.map((k) => ({ value: k, label: SUB_LABEL[k] }))} />
        {canManage && (
          <div className="ml-auto">
            <AdsImportButton key={`${group.key}-${importKind}`} kind={importKind} templateQuery={q.toString()} />
          </div>
        )}
      </div>

      {sub === "plan" && (
        <PlanPanel
          group={group}
          month={month}
          months={months}
          currentMonth={currentMonth}
          metrics={metrics}
          plans={plans}
          campaigns={campaigns}
          sbus={sbus}
          canManage={canManage}
          onMonthChange={onMonthChange}
          onOpenSub={(s) => onSubChange(s)}
        />
      )}
      {sub === "request" && <RequestsView group={group} campaigns={groupCampaigns} sbus={sbus} users={users} canManage={canManage} />}
      {sub === "week" && (isB2c ? <WeeklyView metrics={metrics} sbus={sbus} canManage={canManage} weeks={groupWeeks} /> : <LineWeeklyView group={group} metrics={metrics} canManage={canManage} />)}
      {sub === "month" && (
        <MonthlyView group={group} metrics={metrics} sbus={sbus} campaigns={campaigns} ecomProducts={ecomProducts} canManage={canManage} month={month} onMonthChange={onMonthChange} rubric={rubric} />
      )}
    </div>
  );
}
