import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { listAdsMonthly } from "@/lib/services/ads";
import { todayVnDayStr } from "@/lib/time";
import { AdsMonthlyView } from "./ads-view";

export const metadata = { title: "Ads hàng tháng theo SBU — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function AdsMonthlyPage() {
  const user = await requireUser();
  if (!canSee(user.role, "ads")) redirect("/khong-co-quyen");

  const [rows, allSbus] = await Promise.all([
    listAdsMonthly(db),
    db.select({ id: sbus.id, code: sbus.code }).from(sbus).where(eq(sbus.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ads hàng tháng theo SBU</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 9.4 — &quot;Ngân sách Trung tâm&quot; chỉ tính phần trung tâm tự order; phần HO hỗ trợ
          thêm luôn ghi vào &quot;Ngân sách Hệ thống (HO)&quot;. CPL tính tại chỗ = chi tiêu thực tế / lead thực tế.
        </p>
      </div>
      <AdsMonthlyView
        rows={rows.map((r) => ({
          id: r.id,
          period: r.period,
          sbuId: r.sbuId,
          product: r.product,
          channel: r.channel,
          objective: r.objective,
          centerBudget: r.centerBudget,
          hoBudget: r.hoBudget,
          actualSpend: r.actualSpend,
          actualLeads: r.actualLeads,
          cpl: r.cpl,
          misaOrderCode: r.misaOrderCode,
          status: r.status,
          reportUrl: r.reportUrl,
        }))}
        sbus={allSbus}
        currentPeriod={todayVnDayStr().slice(0, 7)}
      />
    </div>
  );
}
