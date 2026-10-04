import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { computeWorkloadMatrix, loadOverloadThresholds } from "@/lib/services/workload";
import { todayVnDayStr } from "@/lib/time";
import { WorkloadTable } from "./workload-table";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Workload — VMG MKT OS" };
export const dynamic = "force-dynamic";

/** SPEC Mục 8.3/12.2/12.3 — ma trận người x tuần, tô màu quá tải. */
export default async function WorkloadPage() {
  await requireRole("admin", "manager");
  const [{ weeks, rows }, thresholds] = await Promise.all([computeWorkloadMatrix(db), loadOverloadThresholds(db)]);

  return (
    <div className="space-y-4">
      <PageHeader title="Workload" description="Khối lượng việc chưa xong của từng người theo tuần (giờ ước tính, hoặc số task nếu chưa ước tính). Màu cho biết mức tải so với ngưỡng." />
      <WorkloadTable weeks={weeks} rows={rows} thresholds={thresholds} today={todayVnDayStr()} />
    </div>
  );
}
