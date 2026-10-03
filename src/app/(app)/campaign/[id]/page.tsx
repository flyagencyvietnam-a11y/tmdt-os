import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns, tasks } from "@/lib/db/schema";
import { CampaignActionPlan } from "./action-plan";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) notFound();

  const actionTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.campaignId, id), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.workstream), asc(tasks.dueDate));

  const total = actionTasks.length;
  const done = actionTasks.filter((t) => t.status === "done" || t.status === "cancelled").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = actionTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">{campaign.code}</div>
        <h1 className="text-xl font-semibold">{campaign.name}</h1>
        <p className="text-sm text-muted-foreground">
          {campaign.startDate} – {campaign.endDate} · Tiến độ {done}/{total} task xong
          {overdueCount > 0 && <span className="text-crit"> · {overdueCount} trễ hạn</span>}
        </p>
      </div>

      {(campaign.objective || campaign.heroActivity || campaign.cta || campaign.channels) && (
        <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          {campaign.objective && <Info label="Mục tiêu" value={campaign.objective} />}
          {campaign.heroActivity && <Info label="Hero activity" value={campaign.heroActivity} />}
          {campaign.cta && <Info label="CTA" value={campaign.cta} />}
          {campaign.channels && <Info label="Kênh" value={campaign.channels} />}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Action plan (task nhóm theo workstream)</h2>
        <CampaignActionPlan
          campaignId={campaign.id}
          tasks={actionTasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            assigneeId: t.assigneeId,
            dueDate: t.dueDate,
            workstream: t.workstream,
          }))}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
