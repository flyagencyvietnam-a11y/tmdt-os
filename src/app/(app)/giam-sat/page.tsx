import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { computeAlert, listMonitoringItems, nextDueDate } from "@/lib/services/monitoring";
import { MonitoringView } from "./monitoring-view";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Giám sát hạng mục — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const user = await requireUser();
  if (!canSee(user.role, "monitoring")) redirect("/khong-co-quyen");

  const [items, allSbus] = await Promise.all([
    listMonitoringItems(db),
    db.select({ id: sbus.id, code: sbus.code }).from(sbus).where(eq(sbus.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Giám sát thay mới định kỳ" description="POSM, bảng hiệu, OOH, Google Maps, quầy tư vấn, phòng thi — cảnh báo khi quá hạn/sắp đến hạn và tự giao việc." />
      <MonitoringView
        items={items.map((i) => ({
          id: i.id,
          sbuId: i.sbuId,
          kind: i.kind,
          title: i.title,
          currentStateNote: i.currentStateNote,
          lastUpdatedDate: i.lastUpdatedDate,
          cycleMonths: i.cycleMonths,
          photoUrl: i.photoUrl,
          alert: computeAlert(i),
          nextDue: nextDueDate(i),
        }))}
        sbus={allSbus}
        canManage={user.role === "admin" || user.role === "manager"}
      />
    </div>
  );
}
