import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import * as React from "react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { taskCollaborators, taskWatchers, tasks } from "@/lib/db/schema";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Việc của tôi</h1>
        <p className="text-sm text-muted-foreground">Xin chào {user.fullName} — đây là mọi việc bạn đang phụ trách.</p>
      </div>

      <QuickAddTask currentUserId={user.id} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        <Kpi label="Trễ hạn" value={overdue.length} tone="crit" />
        <Kpi label="Hôm nay" value={dueToday.length} />
        <Kpi label="Ngày mai" value={dueTomorrow.length} />
        <Kpi label="Tuần này" value={thisWeek.length} />
        <Kpi label="Chưa có hạn" value={noDueDate.length} />
        <Kpi label="Đang bị chặn" value={blocked.length} tone={blocked.length ? "warn" : undefined} />
      </div>

      <Section title="Cần làm hôm nay" empty="Không có việc nào trễ hạn hoặc đến hạn hôm nay.">
        {[...overdue, ...dueToday].map((t) => (
          <TaskRow key={t.id} task={t} today={today} />
        ))}
      </Section>

      <Section title="Việc sắp tới (7 ngày)" empty="Không có việc nào trong 7 ngày tới.">
        {[...dueTomorrow, ...thisWeek].map((t) => (
          <TaskRow key={t.id} task={t} today={today} />
        ))}
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Tôi đang phối hợp" empty="Chưa phối hợp task nào.">
          {collabRows.map((r) => (
            <TaskRow key={r.task.id} task={r.task} today={today} compact />
          ))}
        </Section>
        <Section title="Tôi đang theo dõi" empty="Chưa theo dõi task nào.">
          {watchRows.map((r) => (
            <TaskRow key={r.task.id} task={r.task} today={today} compact />
          ))}
        </Section>
      </div>

      <div className="text-sm">
        <Link href="/task" className="text-brand hover:underline">
          Xem toàn bộ task (List / Kanban / Lịch) →
        </Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "crit" | "warn" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "text-2xl font-semibold tabular-nums " +
          (tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="divide-y rounded-lg border">
        {hasChildren ? children : <p className="px-3 py-4 text-sm text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}
