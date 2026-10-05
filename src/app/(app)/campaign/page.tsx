import { and, asc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaignSbus, campaigns, sbus, tasks, users } from "@/lib/db/schema";
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
  const [rows, [{ all, closed }], taskStats, allUsers, allSbus, sbuLinks] = await Promise.all([
    // Mặc định theo thời gian diễn ra: campaign bắt đầu sớm nhất lên trước.
    scope === "all"
      ? db.select().from(campaigns).where(isNull(campaigns.deletedAt)).orderBy(asc(campaigns.startDate), asc(campaigns.endDate))
      : db.select().from(campaigns).where(and(isNull(campaigns.deletedAt), notInArray(campaigns.status, ["done", "cancelled"]))).orderBy(asc(campaigns.startDate), asc(campaigns.endDate)),
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
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind }).from(sbus).where(eq(sbus.active, true)).orderBy(asc(sbus.code)),
    db.select().from(campaignSbus),
  ]);
  const sbusOf = new Map<string, string[]>();
  for (const l of sbuLinks) (sbusOf.get(l.campaignId) ?? sbusOf.set(l.campaignId, []).get(l.campaignId)!).push(l.sbuId);

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
            ownerId: c.ownerId,
            sbuIds: sbusOf.get(c.id) ?? [],
            taskTotal: total,
            taskDone: done,
            progressPct: total > 0 ? Math.round((done / total) * 100) : null,
            overdueCount: Number(s?.overdue ?? 0),
          };
        })}
        users={allUsers}
        sbus={allSbus}
        currentUserId={user.id}
        today={today}
        canEdit={isStaff(user.role)}
      />
    </div>
  );
}
