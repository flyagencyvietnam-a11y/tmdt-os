import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { computeAlert, listMonitoringItems, nextDueDate } from "@/lib/services/monitoring";
import { MonitoringView } from "./monitoring-view";

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
      <div>
        <h1 className="text-xl font-semibold">Giám sát hạng mục thay mới định kỳ</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 9.5 — POSM, bảng hiệu, OOH, Google Maps, quầy tư vấn VMP, phòng thi. Cảnh báo suy ra
          từ ngày cập nhật gần nhất + chu kỳ, quá hạn/sắp đến hạn tự sinh task cho HO phụ trách SBU.
        </p>
      </div>
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
