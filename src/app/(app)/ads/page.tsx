import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { adsCampaigns, sbus } from "@/lib/db/schema";
import { listAdsMetrics, listDisbursementPlan } from "@/lib/services/ads";
import { todayVnDayStr } from "@/lib/time";
import { AdsView } from "./ads-view";

export const metadata = { title: "Ads — VMG MKT OS" };
export const dynamic = "force-dynamic";

/**
 * SPEC Mục 9.4 (mở rộng theo dữ liệu thật — xem CLAUDE.md "Ads redesign"):
 * 6 mảng digital ads thật (B2C Hệ thống/B2C Trung tâm/Ecom/B2B/OSIR/VMP),
 * grain tuần + tháng, chiến dịch Facebook chi tiết, kế hoạch giải ngân.
 */
export default async function AdsPage() {
  const user = await requireUser();
  if (!canSee(user.role, "ads")) redirect("/khong-co-quyen");

  const [metrics, allSbus, campaigns, disbursementPlan] = await Promise.all([
    listAdsMetrics(db),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")),
    db.select().from(adsCampaigns),
    listDisbursementPlan(db),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ads — Digital Marketing</h1>
        <p className="text-sm text-muted-foreground">
          6 mảng thật: B2C Hệ thống · B2C Trung tâm · Ecom · B2B · OSIR · VMP. CPL/CAC/CVR/ROAS/điểm hiệu quả
          tính tại chỗ. Chu kỳ tuần = Thứ 7 tuần trước → hết Thứ 6 tuần này (báo cáo tuần/tháng tự sinh task
          cho Khiết/Đạt — xem Cài đặt ▸ Tác vụ định kỳ, mã ADS-01/ADS-02).
        </p>
      </div>
      <AdsView
        metrics={metrics.map((m) => ({
          ...m,
          budget: m.budget,
          centerOrderBudget: m.centerOrderBudget,
          hoTopupBudget: m.hoTopupBudget,
          leads: m.leads,
          newStudents: m.newStudents,
          messages: m.messages,
          impressions: m.impressions,
          revenue: m.revenue,
          actualRevenue: m.actualRevenue,
          mql: m.mql,
          deals: m.deals,
        }))}
        sbus={allSbus}
        campaigns={campaigns}
        disbursementPlan={disbursementPlan}
        canManage={user.role === "admin" || user.role === "manager"}
        currentMonth={todayVnDayStr().slice(0, 7)}
        weeks={[...new Set(metrics.filter((m) => m.periodType === "week").map((m) => m.period))].sort().reverse()}
      />
    </div>
  );
}
