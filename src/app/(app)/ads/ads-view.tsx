"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DisbursementPanel } from "./disbursement-panel";
import { MonthlyView } from "./monthly-view";
import { RequestsView } from "./requests-view";
import { WeeklyView } from "./weekly-view";
import type { CampaignRow, DisbursementRow, MetricRow, SbuLite } from "./shared";

/**
 * 3 chu kỳ report thật của phòng Marketing (SPEC Mục 9.4 / CLAUDE.md "Ads
 * redesign"), mỗi chu kỳ 1 tab riêng để không gộp lẫn:
 * - Theo tuần: Thứ 7 → hết Thứ 6, chỉ Mục 1 (B2C Hệ thống) + Mục 2 (B2C
 *   Trung tâm), chỉ ngân sách + Mess (đúng phạm vi sheet "Tracking Tuần").
 * - Theo tháng: đủ 6 mảng, đủ CPL/CAC/CVR/điểm hiệu quả.
 * - Theo request: từng chiến dịch Facebook riêng theo trung tâm, không gộp kỳ.
 */
export function AdsView({
  metrics,
  sbus,
  campaigns,
  disbursementPlan,
  canManage,
  currentMonth,
  weeks,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  disbursementPlan: DisbursementRow[];
  canManage: boolean;
  currentMonth: string;
  weeks: string[];
}) {
  return (
    <Tabs defaultValue="week">
      <TabsList>
        <TabsTrigger value="week">Theo tuần</TabsTrigger>
        <TabsTrigger value="month">Theo tháng</TabsTrigger>
        <TabsTrigger value="request">Theo request</TabsTrigger>
        <TabsTrigger value="disbursement">Giải ngân (KH vs TT)</TabsTrigger>
      </TabsList>

      <TabsContent value="week" className="pt-3">
        <WeeklyView metrics={metrics} sbus={sbus} canManage={canManage} weeks={weeks} />
      </TabsContent>

      <TabsContent value="month" className="pt-3">
        <MonthlyView metrics={metrics} sbus={sbus} campaigns={campaigns} canManage={canManage} currentMonth={currentMonth} />
      </TabsContent>

      <TabsContent value="request" className="pt-3">
        <RequestsView campaigns={campaigns} sbus={sbus} canManage={canManage} />
      </TabsContent>

      <TabsContent value="disbursement" className="pt-3">
        <DisbursementPanel plan={disbursementPlan} metrics={metrics} canManage={canManage} currentMonth={currentMonth} />
      </TabsContent>
    </Tabs>
  );
}
