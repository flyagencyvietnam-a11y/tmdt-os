import { desc, isNull, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns, tasks } from "@/lib/db/schema";
import { overdueSqlFragment } from "@/lib/services/tasks";
import { todayVnDayStr } from "@/lib/time";
import { CampaignList } from "./campaign-list";

export const metadata = { title: "Campaign — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function CampaignPage() {
  const user = await requireUser();
  const today = todayVnDayStr();
  const [rows, taskStats] = await Promise.all([
    db.select().from(campaigns).orderBy(desc(campaigns.startDate)),
    db
      .select({
        campaignId: tasks.campaignId,
        total: sql<number>`count(*)`,
        done: sql<number>`count(*) filter (where ${tasks.status} in ('done','cancelled'))`,
        overdue: sql<number>`count(*) filter (where ${overdueSqlFragment(today)})`,
      })
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .groupBy(tasks.campaignId),
  ]);

  const statsByCampaign = new Map(taskStats.filter((s) => s.campaignId).map((s) => [s.campaignId as string, s]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Campaign master</h1>
        <p className="text-sm text-muted-foreground">
          Action plan của mỗi campaign chính là các task gắn <code>campaign_id</code> (SPEC Mục 4.1) — mở
          một campaign để xem/giao task.
        </p>
      </div>
      <CampaignList
        campaigns={rows.map((c) => {
          const s = statsByCampaign.get(c.id);
          const total = Number(s?.total ?? 0);
          const done = Number(s?.done ?? 0);
          return {
            id: c.id,
            code: c.code,
            name: c.name,
            type: c.type,
            startDate: c.startDate,
            endDate: c.endDate,
            status: c.status,
            taskTotal: total,
            taskDone: done,
            progressPct: total > 0 ? Math.round((done / total) * 100) : null,
            overdueCount: Number(s?.overdue ?? 0),
          };
        })}
        canEdit={user.role === "admin" || user.role === "manager"}
      />
    </div>
  );
}
