import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requests, sbus } from "@/lib/db/schema";
import { RequestBoard } from "./request-board";

export const metadata = { title: "Request — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function RequestPage() {
  const user = await requireUser();

  const rows =
    user.role === "center_contributor" && user.sbuId
      ? await db.select().from(requests).where(and(isNull(requests.deletedAt), eq(requests.requesterSbuId, user.sbuId))).orderBy(desc(requests.receivedDate))
      : await db.select().from(requests).where(isNull(requests.deletedAt)).orderBy(desc(requests.receivedDate));

  const allSbus = await db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus);

  const stats = {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    inProgress: rows.filter((r) => r.status === "accepted" || r.status === "in_progress" || r.status === "in_review").length,
    done: rows.filter((r) => r.status === "done").length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Request</h1>
        <p className="text-sm text-muted-foreground">Yêu cầu từ phòng ban, trung tâm (SPEC Mục 9.8).</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Tổng" value={stats.total} />
        <Kpi label="Mới" value={stats.new} />
        <Kpi label="Đang xử lý" value={stats.inProgress} />
        <Kpi label="Đã xong" value={stats.done} />
      </div>
      <RequestBoard
        requests={rows.map((r) => ({
          id: r.id,
          code: r.code,
          receivedDate: r.receivedDate,
          requesterName: r.requesterName,
          requesterSbuId: r.requesterSbuId,
          requestType: r.requestType,
          description: r.description,
          status: r.status,
          committedDate: r.committedDate,
          desiredDate: r.desiredDate,
        }))}
        sbus={allSbus}
        canManage={user.role === "admin" || user.role === "manager"}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
