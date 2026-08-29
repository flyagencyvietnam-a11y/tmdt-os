import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getFormRefs } from "@/lib/services/refs";
import { listTasks, taskCompletionStats } from "@/lib/services/tasks";
import { TaskBoard } from "./task-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Công việc — VMG TMĐT OS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const canSeeAll = can(user.role, "taskAssignOthers", "read");
  const scope = canSeeAll && sp.scope === "team" ? "team" : "mine";

  const [tasks, refs, stats] = await Promise.all([
    listTasks(db, scope === "mine" ? { assigneeId: user.id } : {}),
    getFormRefs(db),
    taskCompletionStats(db, scope === "mine" ? { assigneeId: user.id } : {}),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Công việc</h1>
        <p className="text-sm text-muted-foreground">
          Việc dự án & định kỳ (SPEC Mục 13). Việc chăm sóc lead ở màn hình “Hôm nay”,
          không tạo task riêng.
        </p>
      </div>
      <TaskBoard
        tasks={tasks.map((t) => ({
          ...t,
          completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        }))}
        stats={stats}
        users={refs.users}
        currentUserId={user.id}
        canSeeAll={canSeeAll}
        canAssignOthers={can(user.role, "taskAssignOthers", "create")}
        scope={scope}
      />
    </div>
  );
}
