import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, ClipboardList, Eye, Inbox, Layers, Megaphone, ShieldAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns, requests, sbus, taskSbus, tasks, users } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { isFanOutSbu, SBU_KIND_LABEL, SBU_REGION_LABEL } from "@/lib/sbu-kinds";
import { getSbuStats, listSbuCampaigns } from "@/lib/services/sbu-overview";
import { todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TaskRow } from "../../task/task-row";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  preparing: "Đang chuẩn bị",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn tất",
  cancelled: "Huỷ",
  needs_confirmation: "Cần xác nhận",
};
const STATUS_TONE: Record<string, string> = {
  planned: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  preparing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  running: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  paused: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  done: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
  needs_confirmation: "bg-red-500/12 text-red-700 dark:text-red-400",
};

const compact = (v: number | null) => (v == null ? "—" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}K` : String(Math.round(v)));

/**
 * Chi tiết 1 SBU (mở dạng popup từ danh sách): thẻ thống kê (cùng nguồn số với danh sách SBU) → campaign liên quan → task → request.
 * Số "Campaign" ở đây và ở danh sách SBU cùng lấy từ services/sbu-overview.ts — campaign đã xoá không bao giờ được tính.
 */
export default async function SbuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (user.role === "center_contributor" && user.sbuId !== id) {
    return <p className="text-sm text-muted-foreground">Bạn chỉ xem được SBU của mình.</p>;
  }

  const [sbu] = await db.select().from(sbus).where(eq(sbus.id, id)).limit(1);
  if (!sbu) notFound();
  const today = todayVnDayStr();

  const [sbuTasks, sbuRequests, sbuCampaigns, statsAll, [owner]] = await Promise.all([
    db
      .select({ task: tasks })
      .from(taskSbus)
      .innerJoin(tasks, eq(tasks.id, taskSbus.taskId))
      .where(and(eq(taskSbus.sbuId, id), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.dueDate)),
    db.select().from(requests).where(and(eq(requests.requesterSbuId, id), isNull(requests.deletedAt))),
    listSbuCampaigns(db, id, today),
    getSbuStats(db, today, new Set(isFanOutSbu(sbu) ? [id] : [])),
    sbu.hoOwnerId ? db.select({ name: users.fullName }).from(users).where(eq(users.id, sbu.hoOwnerId)).limit(1) : Promise.resolve([] as { name: string }[]),
  ]);
  const stats = statsAll.stats.get(id);
  const s = stats ?? { campaigns: sbuCampaigns.length, taskTotal: 0, taskDone: 0, taskOverdue: 0, itemsDone: 0, itemsApplicable: 0, requestsOpen: 0, monitoringTotal: 0, monitoringOverdue: 0, monitoringDueSoon: 0, brandPeriod: null, brandImpressions: null, brandEngagements: null, brandFollowers: null };

  // Chip campaign trên thẻ task (chỉ campaign còn sống).
  const campIds = [...new Set(sbuTasks.map((r) => r.task.campaignId).filter((x): x is string => !!x))];
  const campRows = campIds.length ? await db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns).where(and(inArray(campaigns.id, campIds), isNull(campaigns.deletedAt))) : [];
  const campById = new Map(campRows.map((c) => [c.id, c]));

  const open = sbuTasks.filter((r) => r.task.status !== "done" && r.task.status !== "cancelled");
  const closed = sbuTasks.filter((r) => r.task.status === "done" || r.task.status === "cancelled");
  const withCtx = (t: (typeof sbuTasks)[number]["task"]) => ({ ...t, campaign: t.campaignId ? (campById.get(t.campaignId) ?? null) : null });
  const taskPct = s.taskTotal ? Math.round((s.taskDone / s.taskTotal) * 100) : null;
  const isBrand = sbu.kind === "brand";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{sbu.code}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">{SBU_KIND_LABEL[sbu.kind] ?? sbu.kind}</span>
          {sbu.region !== "BRAND" && <span className="rounded bg-muted px-1.5 py-0.5">{SBU_REGION_LABEL[sbu.region] ?? sbu.region}</span>}
          {owner && <span>HO phụ trách: <b className="text-foreground">{owner.name}</b></span>}
          {!sbu.active && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-600">Ngừng hoạt động</span>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{sbu.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Campaign liên quan" value={sbuCampaigns.length} icon={Megaphone} tone={sbuCampaigns.length ? "brand" : "muted"} hint={sbuCampaigns.length ? `${sbuCampaigns.filter((c) => c.status === "running").length} đang chạy` : "Chưa có"} />
        <StatCard label="Task" value={`${s.taskDone}/${s.taskTotal}`} icon={ClipboardList} tone="info" hint={taskPct != null ? `${taskPct}% hoàn thành` : "Chưa có task"} />
        <StatCard label="Task trễ hạn" value={s.taskOverdue} icon={AlertTriangle} tone={s.taskOverdue ? "crit" : "muted"} hint={s.taskOverdue ? "Cần xử lý" : "Không có"} />
        <StatCard label="Request đang mở" value={s.requestsOpen} icon={Inbox} tone={s.requestsOpen ? "warn" : "muted"} />
        {s.itemsApplicable > 0 && <StatCard label={`Hạng mục ${today.slice(5, 7)}/${today.slice(0, 4)}`} value={`${s.itemsDone}/${s.itemsApplicable}`} icon={Layers} tone="info" hint="Ma trận hạng mục × SBU" />}
        {s.monitoringTotal > 0 && (
          <StatCard
            label="Giám sát"
            value={s.monitoringOverdue ? `${s.monitoringOverdue} quá hạn` : "Ổn"}
            icon={ShieldAlert}
            tone={s.monitoringOverdue ? "crit" : s.monitoringDueSoon ? "warn" : "ok"}
            hint={`${s.monitoringTotal} hạng mục${s.monitoringDueSoon ? ` · ${s.monitoringDueSoon} sắp hạn` : ""}`}
          />
        )}
        {isBrand && s.brandPeriod && (
          <>
            <StatCard label="Impression (Brand)" value={compact(s.brandImpressions)} icon={Eye} hint={`Tháng ${s.brandPeriod.slice(5)}/${s.brandPeriod.slice(0, 4)}`} />
            <StatCard label="Follower (Brand)" value={compact(s.brandFollowers)} icon={UserPlus} tone="ok" hint={`Tháng ${s.brandPeriod.slice(5)}/${s.brandPeriod.slice(0, 4)}`} />
          </>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Campaign liên quan ({sbuCampaigns.length})</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {sbuCampaigns.map((c) => {
            const pct = c.taskTotal ? Math.round((c.taskDone / c.taskTotal) * 100) : null;
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/campaign/${c.id}`} className="block truncate text-sm font-medium hover:text-brand">
                    <span className="text-muted-foreground">{c.code}</span> · {c.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                    </span>
                    {c.ownerName && <span>· Owner: {c.ownerName}</span>}
                    <span>· {c.via === "tasks" ? "qua task gắn SBU" : c.via === "linked" ? "gắn trực tiếp" : "gắn trực tiếp + task"}</span>
                  </div>
                </div>
                {c.taskTotal > 0 && (
                  <div className="w-32 shrink-0 text-right text-[11px] text-muted-foreground" title={`${c.taskDone}/${c.taskTotal} task của campaign gắn SBU này`}>
                    <div className="mb-0.5 tabular-nums">
                      {c.taskDone}/{c.taskTotal} task{c.taskOverdue > 0 && <span className="ml-1 font-semibold text-red-600">· {c.taskOverdue} trễ</span>}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct ?? 0}%` }} />
                    </div>
                  </div>
                )}
                <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", STATUS_TONE[c.status])}>{STATUS_LABEL[c.status] ?? c.status}</span>
              </div>
            );
          })}
          {sbuCampaigns.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground">Chưa có campaign nào gắn SBU này (trực tiếp hoặc qua task).</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          Task đang mở ({open.length})
          {closed.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> {closed.length} đã xong/huỷ ở cuối danh sách
            </span>
          )}
        </h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {open.map((r) => (
            <TaskRow key={r.task.id} task={withCtx(r.task)} today={today} />
          ))}
          {open.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Không có task đang mở.</p>}
        </div>
        {closed.length > 0 && (
          <details className="mt-3 overflow-hidden rounded-xl border bg-card shadow-xs">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">Task đã xong / huỷ ({closed.length})</summary>
            <div className="divide-y border-t">
              {closed.map((r) => (
                <TaskRow key={r.task.id} task={withCtx(r.task)} today={today} />
              ))}
            </div>
          </details>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Request từ trung tâm ({sbuRequests.length})</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm shadow-xs">
          {sbuRequests.map((r) => (
            <div key={r.id} className="px-3 py-2">
              <span className="font-medium">{r.code}</span> — {r.description}
            </div>
          ))}
          {sbuRequests.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Chưa có request.</p>}
        </div>
      </section>
    </div>
  );
}
