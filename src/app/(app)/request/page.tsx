import { and, desc, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requests, sbus } from "@/lib/db/schema";
import { RequestBoard } from "./request-board";
import { CheckCircle2, Inbox, Loader, Sparkles } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/shell/page-header";

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
      <PageHeader title="Request" description="Yêu cầu gửi tới phòng Marketing từ phòng ban và trung tâm." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng request" value={stats.total} icon={Inbox} />
        <StatCard label="Mới — chờ tiếp nhận" value={stats.new} icon={Sparkles} tone={stats.new ? "warn" : "muted"} />
        <StatCard label="Đang xử lý" value={stats.inProgress} icon={Loader} tone="info" />
        <StatCard label="Đã xong" value={stats.done} icon={CheckCircle2} tone="ok" hint={stats.total ? `${Math.round((stats.done / stats.total) * 100)}% tổng số` : undefined} />
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

