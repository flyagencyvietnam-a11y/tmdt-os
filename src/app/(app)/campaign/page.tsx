import { desc, isNull, notInArray, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns, tasks } from "@/lib/db/schema";
import { overdueSqlFragment } from "@/lib/services/tasks";
import { todayVnDayStr } from "@/lib/time";
import { CampaignList } from "./campaign-list";
import { PageHeader } from "@/components/shell/page-header";
import { ScopeChips } from "@/components/scope-chips";

export const metadata = { title: "Campaign — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function CampaignPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: scopeParam } = await searchParams;
  const user = await requireUser();
  // Mặc định ẩn campaign đã xong/huỷ để danh sách chỉ còn những gì đang cần theo dõi.
  const scope = scopeParam === "all" ? "all" : "current";
  const today = todayVnDayStr();
  const [rows, [{ all, closed }], taskStats] = await Promise.all([
    scope === "all" ? db.select().from(campaigns).orderBy(desc(campaigns.startDate)) : db.select().from(campaigns).where(notInArray(campaigns.status, ["done", "cancelled"])).orderBy(desc(campaigns.startDate)),
    db.select({ all: sql<number>`count(*)::int`, closed: sql<number>`(count(*) filter (where ${campaigns.status} in ('done','cancelled')))::int` }).from(campaigns).where(isNull(campaigns.deletedAt)),
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
      <PageHeader title="Campaign" description="Danh sách campaign và tiến độ. Mở một campaign để xem action plan và giao task." />
      <ScopeChips
        param="scope"
        value={scope}
        defaultValue="current"
        options={[
          { value: "current", label: "Đang theo dõi", count: Number(all) - Number(closed) },
          { value: "all", label: "Tất cả (gồm đã xong/huỷ)", count: Number(all) },
        ]}
      />
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
