import { eq } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { adsCampaigns, sbus, users } from "@/lib/db/schema";
import { listAdsMetrics, listDisbursementPlan, listEcomProducts, loadEffectivenessRubric } from "@/lib/services/ads";
import { PageHeader } from "@/components/shell/page-header";
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

  const [metrics, allSbus, campaigns, ecomProducts, disbursementPlan, rubric, allUsers] = await Promise.all([
    listAdsMetrics(db),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")),
    db.select().from(adsCampaigns),
    listEcomProducts(db),
    listDisbursementPlan(db),
    loadEffectivenessRubric(db),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ads — Digital Marketing"
        description="Chi tiêu và hiệu quả quảng cáo của 5 mảng: B2C Offline (Hệ thống + Trung tâm) · Ecom · B2B · OSIR · VMP. Tuần tính từ Thứ 7 đến hết Thứ 6; số tháng/quý nhập riêng, không cộng từ các tuần."
      />
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
        users={allUsers}
        ecomProducts={ecomProducts}
        disbursementPlan={disbursementPlan}
        canManage={isStaff(user.role)}
        currentMonth={todayVnDayStr().slice(0, 7)}
        rubric={rubric}
        weeks={[...new Set(metrics.filter((m) => m.periodType === "week").map((m) => m.period))].sort().reverse()}
      />
    </div>
  );
}
