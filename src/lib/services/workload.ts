import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { appSettings, tasks, users } from "@/lib/db/schema";
import { addDaysStr, todayVnDayStr } from "@/lib/time";

/** SPEC Mục 12.3 — tải = tổng estimate_hours của task chưa done trong tuần; không có ước tính thì đếm số task. */
export interface WorkloadCell {
  value: number;
  unit: "hours" | "tasks";
  overloaded: boolean;
}
export interface WorkloadWeek {
  from: string;
  to: string;
  label: string;
}
export interface WorkloadRow {
  userId: string;
  fullName: string;
  cells: WorkloadCell[];
}

function mondayOf(dayStr: string): string {
  const wd = new Date(`${dayStr}T00:00:00Z`).getUTCDay(); // 0=CN..6=T7
  const backToMon = wd === 0 ? 6 : wd - 1;
  return addDaysStr(dayStr, -backToMon);
}

export async function loadOverloadThresholds(db: DB): Promise<{ hours: number; tasks: number }> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "workload_overload_threshold"));
  const v = row?.value as { hours?: number; tasks?: number } | undefined;
  return { hours: v?.hours ?? 40, tasks: v?.tasks ?? 8 };
}

/** SPEC Mục 8.3/12.2 — ma trận người x tuần, `weeksCount` tuần kể từ tuần hiện tại. */
export async function computeWorkloadMatrix(
  db: DB,
  weeksCount = 6,
  now = new Date(),
): Promise<{ weeks: WorkloadWeek[]; rows: WorkloadRow[] }> {
  const today = todayVnDayStr(now);
  const thisMonday = mondayOf(today);
  const weeks: WorkloadWeek[] = Array.from({ length: weeksCount }, (_, i) => {
    const from = addDaysStr(thisMonday, i * 7);
    const to = addDaysStr(from, 6);
    return { from, to, label: `${from.slice(8, 10)}/${from.slice(5, 7)}` };
  });

  const activeUsers = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.active, true), inArray(users.role, ["admin", "manager", "member"])));

  const horizonEnd = weeks[weeks.length - 1]?.to ?? today;
  const openTasks = await db
    .select({ assigneeId: tasks.assigneeId, dueDate: tasks.dueDate, estimateHours: tasks.estimateHours })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), inArray(tasks.status, ["todo", "in_progress", "in_review", "blocked"])));

  const { hours: hoursThreshold, tasks: tasksThreshold } = await loadOverloadThresholds(db);

  const rows: WorkloadRow[] = activeUsers.map((u) => {
    const cells: WorkloadCell[] = weeks.map((w) => {
      const mine = openTasks.filter(
        (t) => t.assigneeId === u.id && t.dueDate && t.dueDate >= w.from && t.dueDate <= w.to && t.dueDate <= horizonEnd,
      );
      const withHours = mine.filter((t) => t.estimateHours != null);
      if (withHours.length > 0) {
        const sum = withHours.reduce((s, t) => s + Number(t.estimateHours), 0);
        return { value: sum, unit: "hours", overloaded: sum > hoursThreshold };
      }
      return { value: mine.length, unit: "tasks", overloaded: mine.length > tasksThreshold };
    });
    return { userId: u.id, fullName: u.fullName, cells };
  });

  return { weeks, rows };
}
