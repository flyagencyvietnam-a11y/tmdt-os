import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Gauge, Newspaper, UserX } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatCard } from "@/components/stat-card";
import { canAssignOthers, canSee, isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { brands, campaignBrands, campaignSbus, campaigns, checklistItems, contentItems, sbus, taskCollaborators, taskSbus, tasks, users } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { addDaysStr, diffDaysStr, todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CAMPAIGN_INFO_FIELDS, CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE, CAMPAIGN_TYPE_LABEL, type CampaignInfoKey } from "../campaign-meta";
import { ActionTable, type ActionRow } from "./action-table";
import { CampaignContent, type CampaignContentRow } from "./content-section";
import { CampaignInfoPanel, CampaignMetaBar } from "./campaign-editors";
import { DeleteCampaignButton } from "./delete-campaign-button";
import { DuplicateCampaignDialog } from "./duplicate-campaign-dialog";

export const dynamic = "force-dynamic";

/**
 * TRANG RIÊNG của 1 campaign (không còn là popup): thông tin đầy đủ (sửa tại chỗ) → thẻ tiến độ → ACTION PLAN dạng bảng
 * (mã, workstream, PIC, phối hợp, ngày bắt đầu/hạn, trạng thái, ưu tiên, SBU…) → bài content của campaign.
 */
export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canSee(user.role, "campaign")) redirect("/khong-co-quyen");

  const [campaign] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), isNull(campaigns.deletedAt))).limit(1);
  if (!campaign) notFound();

  const live = and(eq(tasks.campaignId, id), isNull(tasks.deletedAt));
  const [brandRows, sbuLinks, taskRows, collabRows, taskSbuRows, checkRows, contentRows, allUsers, allSbus] = await Promise.all([
    db.select({ code: brands.code, name: brands.name }).from(campaignBrands).innerJoin(brands, eq(brands.id, campaignBrands.brandId)).where(eq(campaignBrands.campaignId, id)),
    db.select({ id: sbus.id, code: sbus.code, kind: sbus.kind }).from(campaignSbus).innerJoin(sbus, eq(sbus.id, campaignSbus.sbuId)).where(eq(campaignSbus.campaignId, id)),
    db.select().from(tasks).where(live).orderBy(asc(tasks.dueDate), asc(tasks.code)),
    db.select({ taskId: taskCollaborators.taskId, name: users.fullName }).from(taskCollaborators).innerJoin(tasks, eq(tasks.id, taskCollaborators.taskId)).innerJoin(users, eq(users.id, taskCollaborators.userId)).where(live),
    db.select({ taskId: taskSbus.taskId, sbuId: taskSbus.sbuId }).from(taskSbus).innerJoin(tasks, eq(tasks.id, taskSbus.taskId)).where(live),
    db
      .select({ taskId: checklistItems.taskId, total: sql<number>`count(*)::int`, done: sql<number>`(count(*) filter (where ${checklistItems.done}))::int` })
      .from(checklistItems)
      .innerJoin(tasks, eq(tasks.id, checklistItems.taskId))
      .where(live)
      .groupBy(checklistItems.taskId),
    db
      .select({ ci: contentItems, taskCode: tasks.code, ownerName: users.fullName })
      .from(contentItems)
      .leftJoin(tasks, eq(tasks.id, contentItems.parentTaskId))
      .leftJoin(users, eq(users.id, contentItems.ownerId))
      .where(and(eq(contentItems.campaignId, id), isNull(contentItems.deletedAt)))
      .orderBy(asc(contentItems.publishDate)),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)).orderBy(asc(users.fullName)),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind }).from(sbus).where(eq(sbus.active, true)).orderBy(asc(sbus.code)),
  ]);

  const today = todayVnDayStr();
  const collabBy = new Map<string, string[]>();
  for (const c of collabRows) (collabBy.get(c.taskId) ?? collabBy.set(c.taskId, []).get(c.taskId)!).push(c.name);
  const sbuBy = new Map<string, string[]>();
  for (const s of taskSbuRows) (sbuBy.get(s.taskId) ?? sbuBy.set(s.taskId, []).get(s.taskId)!).push(s.sbuId);
  const checkBy = new Map(checkRows.map((c) => [c.taskId, c]));

  const actionRows: ActionRow[] = taskRows.map((t) => ({
    id: t.id,
    code: t.code,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    startDate: t.startDate,
    dueDate: t.dueDate,
    workstream: t.workstream,
    isMilestone: t.isMilestone,
    sourceType: t.sourceType,
    sbuIds: sbuBy.get(t.id) ?? [],
    collaborators: collabBy.get(t.id) ?? [],
    checklistDone: Number(checkBy.get(t.id)?.done ?? 0),
    checklistTotal: Number(checkBy.get(t.id)?.total ?? 0),
  }));

  const closed = (s: string) => s === "done" || s === "cancelled";
  const total = taskRows.length;
  const done = taskRows.filter((t) => closed(t.status)).length;
  const open = taskRows.filter((t) => !closed(t.status));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const weekEnd = addDaysStr(today, 7);
  const dueWeek = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length;
  const unassigned = open.filter((t) => !t.assigneeId).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const published = contentRows.filter((c) => c.ci.status === "published").length;

  // Thời gian campaign: đã trôi bao nhiêu % so với tiến độ task.
  const span = Math.max(1, diffDaysStr(campaign.startDate, campaign.endDate) + 1);
  const elapsed = today < campaign.startDate ? 0 : today > campaign.endDate ? 1 : (diffDaysStr(campaign.startDate, today) + 1) / span;
  const phase =
    today < campaign.startDate
      ? `Sắp diễn ra — còn ${diffDaysStr(today, campaign.startDate)} ngày nữa bắt đầu`
      : today > campaign.endDate
        ? `Đã kết thúc ${diffDaysStr(campaign.endDate, today)} ngày trước`
        : `Đang diễn ra — ngày thứ ${diffDaysStr(campaign.startDate, today) + 1}/${span}, còn ${diffDaysStr(today, campaign.endDate)} ngày`;
  const behind = elapsed < 1 && elapsed > 0 && pct / 100 < elapsed - 0.15;

  const infoValues = Object.fromEntries(CAMPAIGN_INFO_FIELDS.map((f) => [f.key, (campaign[f.key as keyof typeof campaign] as string | null) ?? null])) as Record<CampaignInfoKey, string | null>;
  const canEdit = isStaff(user.role);
  const contentGridRows: CampaignContentRow[] = contentRows.map((r) => ({
    id: r.ci.id,
    publishDate: r.ci.publishDate,
    topic: r.ci.topic,
    channels: r.ci.channels.length ? r.ci.channels : [r.ci.channel],
    pillar: r.ci.contentPillar,
    status: r.ci.status,
    ownerName: r.ownerName ?? "",
    taskCode: r.taskCode ?? null,
    taskId: r.ci.parentTaskId,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/campaign" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Tất cả campaign
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{campaign.code}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", CAMPAIGN_STATUS_TONE[campaign.status])}>{CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}</span>
              <span className="rounded bg-muted px-1.5 py-0.5">{CAMPAIGN_TYPE_LABEL[campaign.type] ?? campaign.type}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            {campaign.tagline && <p className="mt-0.5 text-sm text-muted-foreground">{campaign.tagline}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {fmtDate(campaign.startDate)} → {fmtDate(campaign.endDate)}
              </span>{" "}
              · {phase}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <DuplicateCampaignDialog campaignId={campaign.id} sourceCode={campaign.code} />
              <DeleteCampaignButton campaignId={campaign.id} name={campaign.name} taskCount={total} />
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Brand:</span>
            {brandRows.length ? brandRows.map((b) => <span key={b.code} className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-500/20 dark:text-violet-300" title={b.name}>{b.code}</span>) : <span className="text-muted-foreground/70">—</span>}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">SBU:</span>
            {sbuLinks.length ? (
              sbuLinks.map((s) => (
                <Link key={s.id} href={`/sbu/${s.id}`} className={cn("rounded px-1.5 py-0.5 text-xs font-medium hover:underline", s.kind === "brand" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300")}>
                  {s.code}
                </Link>
              ))
            ) : (
              <span className="text-muted-foreground/70">toàn hệ thống / chưa gắn</span>
            )}
          </span>
        </div>
      </div>

      <CampaignMetaBar id={campaign.id} status={campaign.status} type={campaign.type} ownerId={campaign.ownerId} startDate={campaign.startDate} endDate={campaign.endDate} owners={allUsers} canEdit={canEdit} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Tiến độ task"
          value={`${pct}%`}
          icon={Gauge}
          tone={behind ? "warn" : "brand"}
          hint={
            <div className="space-y-1">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-muted" title={`Hoàn thành ${pct}% · thời gian campaign đã trôi ${Math.round(elapsed * 100)}%`}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                {elapsed > 0 && elapsed < 1 && <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${elapsed * 100}%` }} />}
              </div>
              <span>
                {done}/{total} xong · thời gian đã trôi {Math.round(elapsed * 100)}%
              </span>
            </div>
          }
        />
        <StatCard label="Trễ hạn" value={overdue} icon={AlertTriangle} tone={overdue ? "crit" : "muted"} hint={overdue ? "Cần xử lý ngay" : "Không có"} />
        <StatCard label="Đến hạn 7 ngày tới" value={dueWeek} icon={CalendarClock} tone="info" />
        <StatCard label="Chưa giao người" value={unassigned} icon={UserX} tone={unassigned ? "warn" : "muted"} hint={unassigned ? "Task đang mở chưa có PIC" : undefined} />
        <StatCard label="Bài content" value={contentRows.length ? `${published}/${contentRows.length}` : "—"} icon={Newspaper} tone="info" hint={contentRows.length ? "đã đăng / tổng" : "Chưa có bài"} />
        <StatCard label="Hoàn tất" value={done} icon={CheckCircle2} tone="ok" hint={`trên ${total} task`} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Action plan ({total} task)</h2>
        <ActionTable campaignId={campaign.id} rows={actionRows} users={allUsers} sbus={allSbus} currentUserId={user.id} canEdit={canEdit} canAssignOthers={canAssignOthers(user)} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Thông tin campaign</h2>
        <CampaignInfoPanel id={campaign.id} values={infoValues} canEdit={canEdit} />
      </section>

      {contentRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Bài content của campaign ({contentRows.length})</h2>
          <CampaignContent rows={contentGridRows} />
        </section>
      )}
    </div>
  );
}
