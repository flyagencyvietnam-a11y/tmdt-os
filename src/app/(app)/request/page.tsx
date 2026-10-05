import { and, desc, eq, gte, isNull, notInArray, or, sql } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requests, sbus, tasks, users } from "@/lib/db/schema";
import { RequestBoard } from "./request-board";
import { CheckCircle2, Inbox, Loader, Sparkles } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { LoadMore, ScopeChips } from "@/components/scope-chips";
import { clampLimit, PAGE_SIZE, RECENT_DAYS } from "@/lib/services/task-lists";
import { addDaysStr, todayVnDayStr } from "@/lib/time";

export const metadata = { title: "Request — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function RequestPage({ searchParams }: { searchParams: Promise<{ scope?: string; limit?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const scope = sp.scope === "all" ? "all" : "active";
  const limit = clampLimit(sp.limit);
  const mine = user.role === "center_contributor" && user.sbuId ? eq(requests.requesterSbuId, user.sbuId) : undefined;
  const base = and(isNull(requests.deletedAt), mine);
  // Mặc định: request chưa đóng + request vừa đóng (xong/từ chối) trong 30 ngày gần nhất.
  const since = addDaysStr(todayVnDayStr(), -RECENT_DAYS);
  const scoped = scope === "all" ? base : and(base, or(notInArray(requests.status, ["done", "rejected"]), gte(sql`coalesce(${requests.completedDate}, ${requests.updatedAt}::date)`, since)));

  const [rows, [{ n }], [agg]] = await Promise.all([
    db
      .select({ r: requests, executorId: tasks.assigneeId })
      .from(requests)
      .leftJoin(tasks, eq(tasks.id, requests.taskId))
      .where(scoped)
      .orderBy(sql`${requests.committedDate} asc nulls last`, desc(requests.receivedDate))
      .limit(limit),
    db.select({ n: sql<number>`count(*)::int` }).from(requests).where(scoped),
    // Thẻ thống kê tính trên TOÀN BỘ request (không phụ thuộc phạm vi đang xem).
    db
      .select({
        total: sql<number>`count(*)::int`,
        new: sql<number>`(count(*) filter (where ${requests.status} = 'new'))::int`,
        inProgress: sql<number>`(count(*) filter (where ${requests.status} in ('accepted','in_progress','in_review')))::int`,
        done: sql<number>`(count(*) filter (where ${requests.status} = 'done'))::int`,
      })
      .from(requests)
      .where(base),
  ]);

  const [allSbus, allUsers] = await Promise.all([
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  const stats = { total: Number(agg.total), new: Number(agg.new), inProgress: Number(agg.inProgress), done: Number(agg.done) };
  const total = Number(n);

  return (
    <div className="space-y-4">
      <PageHeader title="Request" description="Yêu cầu gửi tới phòng Marketing từ phòng ban và trung tâm." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng request" value={stats.total} icon={Inbox} />
        <StatCard label="Mới — chờ tiếp nhận" value={stats.new} icon={Sparkles} tone={stats.new ? "warn" : "muted"} />
        <StatCard label="Đang xử lý" value={stats.inProgress} icon={Loader} tone="info" />
        <StatCard label="Đã xong" value={stats.done} icon={CheckCircle2} tone="ok" hint={stats.total ? `${Math.round((stats.done / stats.total) * 100)}% tổng số` : undefined} />
      </div>
      <ScopeChips
        param="scope"
        value={scope}
        defaultValue="active"
        options={[
          { value: "active", label: "Đang xử lý & vừa đóng", count: scope === "active" ? total : undefined },
          { value: "all", label: "Tất cả", count: stats.total },
        ]}
      />
      <RequestBoard
        requests={rows.map(({ r, executorId }) => ({
          id: r.id,
          executorId: executorId ?? r.acceptedById,
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
        users={allUsers}
        canManage={isStaff(user.role)}
      />
      <LoadMore shown={rows.length} total={total} step={PAGE_SIZE} />
    </div>
  );
}

