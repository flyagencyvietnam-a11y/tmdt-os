import { eq } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { adsCampaigns, sbus, users } from "@/lib/db/schema";
import { listAdsMetrics, listAdsPlans, listEcomProducts, loadEffectivenessRubric } from "@/lib/services/ads";
import { PageHeader } from "@/components/shell/page-header";
import { todayVnDayStr } from "@/lib/time";
import { AdsView } from "./ads-view";

export const metadata = { title: "Growth Performance — VMG MKT OS" };
export const dynamic = "force-dynamic";

/**
 * SPEC Mục 9.4 + Phụ lục D mục 21: tab theo MẢNG (B2C/Ecom/B2B/VMP/VMT), mỗi mảng cùng luồng
 * Kế hoạch tháng → Request → Báo cáo tuần → Báo cáo tháng.
 */
export default async function AdsPage() {
  const user = await requireUser();
  if (!canSee(user.role, "ads")) redirect("/khong-co-quyen");

  const [metrics, allSbus, campaigns, ecomProducts, plans, rubric, allUsers] = await Promise.all([
    listAdsMetrics(db),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")),
    db.select().from(adsCampaigns),
    listEcomProducts(db),
    listAdsPlans(db),
    loadEffectivenessRubric(db),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Growth Performance"
        description="Kế hoạch và hiệu quả tăng trưởng (quảng cáo/Ads) theo từng mảng: B2C · Ecom · B2B · VMP · VMT (khảo thí). Mỗi mảng đi cùng một luồng: lập kế hoạch tháng → request → báo cáo tuần → báo cáo tháng, và so thực tế với kế hoạch. Tuần tính từ Thứ 7 đến hết Thứ 6; số tháng/quý nhập riêng, không cộng từ các tuần."
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
        plans={plans}
        canManage={isStaff(user.role)}
        currentMonth={todayVnDayStr().slice(0, 7)}
        rubric={rubric}
        weeks={[...new Set(metrics.filter((m) => m.periodType === "week").map((m) => m.period))].sort().reverse()}
      />
    </div>
  );
}
