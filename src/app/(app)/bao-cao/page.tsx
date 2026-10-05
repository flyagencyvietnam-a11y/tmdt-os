import { requireRole } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { computeManagementMetrics, listReportExports } from "@/lib/services/reports";
import { todayVnDayStr } from "@/lib/time";
import { PageHeader } from "@/components/shell/page-header";
import { ExportMenu } from "@/components/report/export-menu";
import { DashboardView } from "./dashboard-view";

export const metadata = { title: "Báo cáo — VMG MKT OS" };
export const dynamic = "force-dynamic";

/** SPEC Mục 12.2 — Dashboard quản lý (admin/manager/viewer). */
export default async function DashboardPage() {
  const user = await requireRole("admin", "manager", "member", "viewer");
  const period = todayVnDayStr().slice(0, 7);
  const [metrics, exports] = await Promise.all([computeManagementMetrics(db, period), listReportExports(db)]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard quản lý"
        description={`Sức khoẻ vận hành của phòng trong tháng ${period.slice(5)}/${period.slice(0, 4)}: việc trễ hạn, tiến độ campaign, mức hoàn thành theo SBU.`}
        actions={<ExportMenu kind="management" period={period} />}
      />
      <DashboardView
        metrics={metrics}
        exports={exports.map((e) => ({ id: e.id, kind: e.kind, period: e.period, fileName: e.fileName, createdAt: e.createdAt.toISOString() }))}
        canManage={isStaff(user.role)}
        currentPeriod={period}
      />
    </div>
  );
}
