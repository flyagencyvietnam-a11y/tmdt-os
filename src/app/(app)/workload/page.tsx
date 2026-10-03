import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { computeWorkloadMatrix } from "@/lib/services/workload";
import { WorkloadTable } from "./workload-table";

export const metadata = { title: "Workload — VMG MKT OS" };
export const dynamic = "force-dynamic";

/** SPEC Mục 8.3/12.2/12.3 — ma trận người x tuần, tô màu quá tải. */
export default async function WorkloadPage() {
  await requireRole("admin", "manager");
  const { weeks, rows } = await computeWorkloadMatrix(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Workload</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 12.3 — mỗi ô là tổng <code>estimate_hours</code> của task chưa xong có hạn trong tuần đó;
          nếu task không có ước tính giờ thì đếm số task. Đỏ = vượt ngưỡng cấu hình (Cài đặt).
        </p>
      </div>
      <WorkloadTable weeks={weeks} rows={rows} />
    </div>
  );
}
