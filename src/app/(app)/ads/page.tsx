import { eq } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sbus, users } from "@/lib/db/schema";
import { listAdsCampaigns, listAdsMetrics, listAdsPlans, loadEffectivenessRubric } from "@/lib/services/ads";
import { PageHeader } from "@/components/shell/page-header";
import { todayVnDayStr } from "@/lib/time";
import { AdsView } from "./ads-view";

export const metadata = { title: "Growth Performance — VMG MKT OS" };
export const dynamic = "force-dynamic";

/**
 * SPEC Mục 9.4 + Phụ lục D mục 26: mọi SBU (Hệ thống, trung tâm, Ecom, VMP, VMT) chung một danh sách; tab
 * Tổng quan · Kế hoạch & tiến độ · Request · Báo cáo tuần · Báo cáo tháng · Báo cáo quý.
 */
export default async function AdsPage() {
  const user = await requireUser();
  if (!canSee(user.role, "ads")) redirect("/khong-co-quyen");

  const [metrics, allSbus, campaigns, plans, rubric, allUsers] = await Promise.all([
    listAdsMetrics(db),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name, region: sbus.region }).from(sbus).where(eq(sbus.kind, "center")),
    listAdsCampaigns(db),
    listAdsPlans(db),
    loadEffectivenessRubric(db),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Growth Performance"
        description="Kế hoạch và hiệu quả tăng trưởng (quảng cáo/Ads) của mọi SBU trong cùng một danh sách: Hệ thống, các trung tâm, Ecom, VMP, VMT. Luồng: lập kế hoạch tháng → request → báo cáo tuần / tháng / quý (chọn khoảng kỳ bất kỳ), và so thực tế với kế hoạch. Tuần tính từ Thứ 2 đến hết Chủ nhật; mỗi tuần tính nguyên vẹn vào tháng chiếm nhiều ngày nhất của tuần; số tháng chính thức nhập riêng, ô còn trống tự cộng từ các tuần (hiển thị nghiêng); quý = cộng 3 tháng."
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
        plans={plans}
        canManage={isStaff(user.role)}
        currentMonth={todayVnDayStr().slice(0, 7)}
        rubric={rubric}
        weeks={[...new Set(metrics.filter((m) => m.periodType === "week").map((m) => m.period))].sort().reverse()}
      />
    </div>
  );
}
