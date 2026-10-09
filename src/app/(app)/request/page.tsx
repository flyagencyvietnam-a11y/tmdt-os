import { and, desc, eq, gte, isNull, notInArray, or, sql } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requests, sbus, tasks, users } from "@/lib/db/schema";
import { RequestBoard } from "./request-board";
import { CheckCircle2, Inbox, Loader, TimerOff } from "lucide-react";
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
  // Request là sổ ghi nhận của nhân sự Marketing (không còn kênh gửi từ trung tâm).
  if (!isStaff(user.role)) redirect("/");
  const scope = sp.scope === "all" ? "all" : "active";
  const limit = clampLimit(sp.limit);
  const base = isNull(requests.deletedAt);
  const today = todayVnDayStr();
  // Mặc định: request chưa đóng + request vừa đóng (xong/từ chối) trong 30 ngày gần nhất.
  const since = addDaysStr(today, -RECENT_DAYS);
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
        inProgress: sql<number>`(count(*) filter (where ${requests.status} = 'in_progress'))::int`,
        overdue: sql<number>`(count(*) filter (where ${requests.status} in ('in_progress','postponed') and ${requests.committedDate} < ${today}))::int`,
        done: sql<number>`(count(*) filter (where ${requests.status} = 'done'))::int`,
      })
      .from(requests)
      .where(base),
  ]);

  const [allSbus, allUsers] = await Promise.all([
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  const stats = { total: Number(agg.total), inProgress: Number(agg.inProgress), overdue: Number(agg.overdue), done: Number(agg.done) };
  const total = Number(n);

  return (
    <div className="space-y-4">
      <PageHeader title="Request" description="Sổ ghi nhận các việc được order cho phòng Marketing. Tự thêm và tự cập nhật — mỗi request tạo sẵn một task cho người thực hiện." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng request" value={stats.total} icon={Inbox} />
        <StatCard label="Đang làm" value={stats.inProgress} icon={Loader} tone="info" />
        <StatCard label="Quá hạn" value={stats.overdue} icon={TimerOff} tone={stats.overdue ? "crit" : "ok"} />
        <StatCard label="Đã xong" value={stats.done} icon={CheckCircle2} tone="ok" hint={stats.total ? `${Math.round((stats.done / stats.total) * 100)}% tổng số` : undefined} />
      </div>
      <ScopeChips
        param="scope"
        value={scope}
        defaultValue="active"
        options={[
          { value: "active", label: "Đang làm & vừa đóng", count: scope === "active" ? total : undefined },
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
        }))}
        sbus={allSbus}
        users={allUsers}
        currentUserId={user.id}
        canManage
      />
      <LoadMore shown={rows.length} total={total} step={PAGE_SIZE} />
    </div>
  );
}

