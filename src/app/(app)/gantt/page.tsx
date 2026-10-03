import { and, isNull, or, isNotNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { campaigns, taskDependencies, tasks, users } from "@/lib/db/schema";
import { GanttChart } from "./gantt-chart";

export const metadata = { title: "Gantt — VMG MKT OS" };
export const dynamic = "force-dynamic";

/** SPEC Mục 8.3 — Gantt: thanh theo start_date-due_date, nhóm theo campaign, mũi tên phụ thuộc, mốc, đường "hôm nay". */
export default async function GanttPage() {
  const user = await requireUser();
  if (user.role === "center_contributor" || user.role === "viewer") redirect("/khong-co-quyen");

  const rows = await db
    .select()
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), or(isNotNull(tasks.dueDate), isNotNull(tasks.startDate))));

  const deps = await db.select().from(taskDependencies);
  const allCampaigns = await db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns);
  const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Gantt</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 8.3 — nhóm theo campaign, mũi tên phụ thuộc, mốc (◆), đường đỏ là hôm nay.
        </p>
      </div>
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
