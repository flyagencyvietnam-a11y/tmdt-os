import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requests, sbus, taskSbus, tasks } from "@/lib/db/schema";
import { TaskRow } from "../../task/task-row";
import { todayVnDayStr } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SbuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (user.role === "center_contributor" && user.sbuId !== id) {
    return <p className="text-sm text-muted-foreground">Bạn chỉ xem được SBU của mình.</p>;
  }

  const [sbu] = await db.select().from(sbus).where(eq(sbus.id, id)).limit(1);
  if (!sbu) notFound();

  const [sbuTasks, sbuRequests] = await Promise.all([
    db
      .select({ task: tasks })
      .from(taskSbus)
      .innerJoin(tasks, eq(tasks.id, taskSbus.taskId))
      .where(and(eq(taskSbus.sbuId, id), isNull(tasks.deletedAt))),
    db.select().from(requests).where(and(eq(requests.requesterSbuId, id), isNull(requests.deletedAt))),
  ]);

  const today = todayVnDayStr();

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">{sbu.code}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{sbu.name}</h1>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Task liên quan ({sbuTasks.length})</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {sbuTasks.map((r) => (
            <TaskRow key={r.task.id} task={r.task} today={today} />
          ))}
          {sbuTasks.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Chưa có task nào gắn SBU này.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Request từ trung tâm ({sbuRequests.length})</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm shadow-xs">
          {sbuRequests.map((r) => (
            <div key={r.id} className="px-3 py-2">
              <span className="font-medium">{r.code}</span> — {r.description}
            </div>
          ))}
          {sbuRequests.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Chưa có request.</p>}
        </div>
      </div>
    </div>
  );
}
