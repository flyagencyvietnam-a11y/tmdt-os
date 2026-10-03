import { and, asc, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { campaigns, taskSbus, tasks, users } from "@/lib/db/schema";
import { calendarToken } from "@/lib/services/ics";
import { TaskBoard } from "./task-board";

export const metadata = { title: "Tất cả task — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function TaskListPage() {
  const user = await requireUser();
  if (!canSee(user.role, "task")) redirect("/khong-co-quyen");

  let rows: (typeof tasks.$inferSelect)[];
  if (user.role === "center_contributor") {
    if (!user.sbuId) {
      rows = [];
    } else {
      const scoped = await db
        .select({ task: tasks })
        .from(taskSbus)
        .innerJoin(tasks, eq(tasks.id, taskSbus.taskId))
        .where(and(eq(taskSbus.sbuId, user.sbuId), isNull(tasks.deletedAt)));
      rows = scoped.map((r) => r.task);
    }
  } else {
    rows = await db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(asc(tasks.dueDate), asc(tasks.priority));
  }

  const [allUsers, allCampaigns] = await Promise.all([
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tất cả task</h1>
        <p className="text-sm text-muted-foreground">
          List, Kanban &amp; Lịch dùng chung bộ lọc (SPEC Mục 8.3). Gantt/Workload để Phase 2.
        </p>
      </div>
      <TaskBoard
        tasks={rows.map((t) => ({
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
        users={allUsers}
        campaigns={allCampaigns}
        currentUserId={user.id}
        canAssignOthers={user.canAssign || user.role === "admin" || user.role === "manager"}
        icsUrl={`/api/export/ics?user=${user.id}&token=${calendarToken(user.id)}`}
      />
    </div>
  );
}
