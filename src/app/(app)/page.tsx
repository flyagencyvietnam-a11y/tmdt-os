import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import * as React from "react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { taskCollaborators, taskWatchers, tasks } from "@/lib/db/schema";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import { AlertTriangle, ArrowRight, Ban, CalendarCheck, CalendarClock, CalendarDays, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { calendarToken } from "@/lib/services/ics";
import { listTasksScoped } from "@/lib/services/task-lists";
import { MyTasksTabs } from "./my-tasks-tabs";
import { QuickAddTask } from "./task/quick-add-task";
import { TaskRow } from "./task/task-row";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["todo", "in_progress", "in_review", "blocked"] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayVnDayStr();
  const tomorrow = addDaysStr(today, 1);
  const weekEnd = addDaysStr(today, 7);

  const mine = await db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), eq(tasks.assigneeId, user.id), inArray(tasks.status, [...OPEN_STATUSES])))
    .orderBy(asc(tasks.dueDate), asc(tasks.priority));

  const overdue = mine.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = mine.filter((t) => t.dueDate === today);
  const dueTomorrow = mine.filter((t) => t.dueDate === tomorrow);
  const thisWeek = mine.filter((t) => t.dueDate && t.dueDate > tomorrow && t.dueDate <= weekEnd);
  const noDueDate = mine.filter((t) => !t.dueDate);
  const blocked = mine.filter((t) => t.status === "blocked");

  // Cho Kanban/Lịch: việc của tôi đang mở + vừa xong (để cột "Xong" có dữ liệu).
  const { rows: boardRows } = await listTasksScoped(db, { userId: user.id, sbuId: null, today }, { view: "mine", limit: 1000 });

  const collabRows = await db
    .select({ task: tasks })
    .from(taskCollaborators)
    .innerJoin(tasks, eq(tasks.id, taskCollaborators.taskId))
    .where(and(eq(taskCollaborators.userId, user.id), isNull(tasks.deletedAt), inArray(tasks.status, [...OPEN_STATUSES])));

  const watchRows = await db
    .select({ task: tasks })
    .from(taskWatchers)
    .innerJoin(tasks, eq(tasks.id, taskWatchers.taskId))
    .where(and(eq(taskWatchers.userId, user.id), isNull(tasks.deletedAt)));

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  const greeting = hour < 11 ? "Chào buổi sáng" : hour < 14 ? "Chào buổi trưa" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const todayList = [...overdue, ...dueToday];
  const upcoming = [...dueTomorrow, ...thisWeek];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${user.fullName.replace(/\s*\(.*?\)\s*/g, "")}`}
        description={`Hôm nay ${fmtDate(today)} · bạn có ${mine.length} việc đang mở${overdue.length ? `, trong đó ${overdue.length} việc đã trễ hạn` : ""}.`}
        actions={
          <Link href="/task" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Toàn bộ task <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        }
      />

      <QuickAddTask currentUserId={user.id} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Trễ hạn" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? "crit" : "muted"} hint={overdue.length ? "Cần xử lý ngay" : "Không có"} />
        <StatCard label="Hôm nay" value={dueToday.length} icon={CalendarCheck} tone={dueToday.length ? "brand" : "muted"} />
        <StatCard label="Ngày mai" value={dueTomorrow.length} icon={CalendarClock} tone="info" />
        <StatCard label="7 ngày tới" value={thisWeek.length} icon={CalendarDays} tone="info" />
        <StatCard label="Chưa có hạn" value={noDueDate.length} icon={CircleDashed} tone={noDueDate.length ? "warn" : "muted"} hint={noDueDate.length ? "Nên đặt hạn" : undefined} />
        <StatCard label="Đang bị chặn" value={blocked.length} icon={Ban} tone={blocked.length ? "warn" : "muted"} />
      </div>

      <MyTasksTabs
        today={today}
        userName={user.fullName}
        icsUrl={`/api/export/ics?user=${user.id}&token=${calendarToken(user.id)}`}
        tasks={boardRows.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          type: t.type,
          status: t.status,
          priority: t.priority,
          assigneeId: t.assigneeId,
          dueDate: t.dueDate,
          campaignId: t.campaignId,
          blockedReason: t.blockedReason,
          sourceType: t.sourceType,
          channel: t.channel,
        }))}
        list={
          <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-6">
              <Section
                title="Cần làm hôm nay"
                count={todayList.length}
                tone={overdue.length ? "crit" : undefined}
                empty="Tuyệt — không có việc nào trễ hạn hoặc đến hạn hôm nay."
              >
                {todayList.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} />
                ))}
              </Section>

              <Section title="Sắp tới (7 ngày)" count={upcoming.length} empty="Không có việc nào trong 7 ngày tới.">
                {upcoming.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} />
                ))}
              </Section>

              {noDueDate.length > 0 && (
                <Section title="Chưa có hạn" count={noDueDate.length} empty="">
                  {noDueDate.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} />
                  ))}
                </Section>
              )}
            </div>

            <div className="space-y-6">
              <Section title="Tôi đang phối hợp" count={collabRows.length} empty="Chưa phối hợp task nào.">
                {collabRows.map((r) => (
                  <TaskRow key={r.task.id} task={r.task} today={today} compact />
                ))}
              </Section>
              <Section title="Tôi đang theo dõi" count={watchRows.length} empty="Chưa theo dõi task nào.">
                {watchRows.map((r) => (
                  <TaskRow key={r.task.id} task={r.task} today={today} compact />
                ))}
              </Section>
            </div>
          </div>
          </>
        }
      />
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  empty,
  children,
}: {
  title: string;
  count?: number;
  tone?: "crit";
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              tone === "crit" && count > 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        )}
      </header>
      <div className="divide-y">
        {hasChildren ? children : <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>}
      </div>
    </section>
  );
}
