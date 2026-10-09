import { and, isNull, or, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { campaigns, taskDependencies, tasks, users } from "@/lib/db/schema";
import { GanttChart } from "./gantt-chart";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CLOSED_VISIBLE_DAYS } from "@/lib/task-view";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Gantt — VMG MKT OS" };
export const dynamic = "force-dynamic";

/** SPEC Mục 8.3 — Gantt: thanh theo start_date-due_date, nhóm theo campaign, mũi tên phụ thuộc, mốc, đường "hôm nay". */
export default async function GanttPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: scopeParam } = await searchParams;
  const showAll = scopeParam === "all";
  const user = await requireUser();
  if (user.role === "center_contributor" || user.role === "viewer") redirect("/khong-co-quyen");

  // Mặc định ẩn việc đã xong/huỷ quá CLOSED_VISIBLE_DAYS ngày — Gantt chỉ cần thấy kế hoạch đang chạy.
  const closedCut = addDaysStr(todayVnDayStr(), -CLOSED_VISIBLE_DAYS);
  const visible = showAll
    ? undefined
    : or(sql`${tasks.status} not in ('done','cancelled')`, sql`coalesce(${tasks.completedAt}, ${tasks.updatedAt}) >= ${closedCut}`);
  const where = and(isNull(tasks.deletedAt), or(isNotNull(tasks.dueDate), isNotNull(tasks.startDate)));
  const [rows, [{ hidden }], depRows] = await Promise.all([
    db.select().from(tasks).where(and(where, visible)),
    showAll
      ? Promise.resolve([{ hidden: 0 }])
      : db.select({ hidden: sql<number>`count(*)::int` }).from(tasks).where(and(where, sql`not (${visible})`)),
    db.select().from(taskDependencies),
  ]);
  const shown = new Set(rows.map((r) => r.id));
  const deps = depRows.filter((d) => shown.has(d.predecessorId) && shown.has(d.successorId));
  const allCampaigns = await db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns).where(isNull(campaigns.deletedAt));
  const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gantt"
        description="Tiến độ theo campaign: thanh = thời gian thực hiện, ◆ = mốc, mũi tên = phụ thuộc, vạch đỏ = hôm nay."
        actions={
          showAll ? (
            <Link href="/gantt" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Ẩn việc đã xong cũ
            </Link>
          ) : Number(hidden) > 0 ? (
            <Link href="/gantt?scope=all" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Hiện cả {Number(hidden)} việc đã xong quá {CLOSED_VISIBLE_DAYS} ngày
            </Link>
          ) : undefined
        }
      />
      <GanttChart
        tasks={rows.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          status: t.status,
          priority: t.priority,
          startDate: t.startDate,
          dueDate: t.dueDate,
          isMilestone: t.isMilestone,
          campaignId: t.campaignId,
          assigneeId: t.assigneeId,
        }))}
        dependencies={deps.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))}
        campaigns={allCampaigns}
        users={allUsers}
      />
    </div>
  );
}
