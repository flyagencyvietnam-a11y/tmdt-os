import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listHandoff } from "@/lib/services/ems-handoff";
import { HandoffTable } from "./handoff-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bàn giao học viên — VMG TMĐT OS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>;
}) {
  await requireRole("ADMIN", "MANAGER");
  const sp = await searchParams;
  const onlyPending = sp.pending !== "0";
  const rows = await listHandoff(db, { onlyPending });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bàn giao học viên → DotB EMS</h1>
        <p className="text-sm text-muted-foreground">
          Điểm bàn giao là thời điểm chốt học viên. Xuất CSV cho vận hành xếp lớp, nhập
          lại mã học viên EMS để đánh dấu đã bàn giao (SPEC Mục 2.3).
        </p>
      </div>
      <HandoffTable rows={rows} onlyPending={onlyPending} />
    </div>
  );
}
