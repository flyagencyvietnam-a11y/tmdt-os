"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { todayVnDayStr } from "@/lib/time";

interface GanttTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  isMilestone: boolean;
  campaignId: string | null;
  assigneeId: string | null;
}
interface Dep {
  predecessorId: string;
  successorId: string;
}
interface Lite {
  id: string;
  code?: string;
  name?: string;
  fullName?: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  todo: { label: "Cần làm", color: "#64748b" },
  in_progress: { label: "Đang làm", color: "#2563eb" },
  in_review: { label: "Chờ duyệt", color: "#d97706" },
  blocked: { label: "Bị chặn", color: "#dc2626" },
  done: { label: "Xong", color: "#059669" },
  cancelled: { label: "Huỷ", color: "#9ca3af" },
};
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function dayNum(d: string): number {
  return Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86400000);
}
function dayDate(n: number): Date {
  return new Date(n * 86400000);
}

const ROW_H = 34;
/** Header 2 tầng: tháng + ngày. */
const HEADER_H = 48;
const LEFT_W = 260;

export function GanttChart({
  tasks,
  dependencies,
  campaigns,
  users,
}: {
  tasks: GanttTask[];
  dependencies: Dep[];
  campaigns: Lite[];
  users: Lite[];
}) {
  const router = useRouter();
  const [zoom, setZoom] = React.useState<"week" | "month">("week");
  const [campaignFilter, setCampaignFilter] = React.useState("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState("all");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const pxPerDay = zoom === "week" ? 36 : 14;

  const visible = tasks.filter((t) => {
    if (campaignFilter === "none" && t.campaignId) return false;
    if (campaignFilter !== "all" && campaignFilter !== "none" && t.campaignId !== campaignFilter) return false;
    if (assigneeFilter !== "all" && t.assigneeId !== assigneeFilter) return false;
    return true;
  });

  const allDays = visible.flatMap((t) => [t.startDate, t.dueDate].filter(Boolean) as string[]).map(dayNum);
  const todayN = dayNum(todayVnDayStr());
  const minDay = Math.min(...allDays, todayN) - 3;
  const maxDay = Math.max(...allDays, todayN) + 7;
  const totalDays = maxDay - minDay + 1;
  const chartWidth = totalDays * pxPerDay;
  const days = Array.from({ length: totalDays }, (_, i) => minDay + i);

  // Tự cuộn để "hôm nay" nằm gần mép trái vùng biểu đồ khi mở / đổi zoom.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (todayN - minDay - 3) * pxPerDay);
  }, [todayN, minDay, pxPerDay]);

  if (visible.length === 0) {
    return (
      <div className="space-y-3">
        <Toolbar {...{ zoom, setZoom, campaignFilter, setCampaignFilter, assigneeFilter, setAssigneeFilter, campaigns, users }} />
        <p className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Không có task nào có ngày để hiển thị.</p>
      </div>
    );
  }

  const campaignName = (id: string) => {
    const c = campaigns.find((x) => x.id === id);
    return c ? `${c.code} — ${c.name}` : "";
  };
  const groups = new Map<string, GanttTask[]>();
  for (const t of visible) {
    const key = t.campaignId ?? "__none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const orderedGroupKeys = [...groups.keys()].sort((a, b) => {
    if (a === "__none") return 1;
    if (b === "__none") return -1;
    return campaignName(a).localeCompare(campaignName(b));
  });

  const rowIndexById = new Map<string, number>();
  let rowCursor = 0;
  const rendered: ({ kind: "header"; label: string; count: number } | { kind: "task"; task: GanttTask })[] = [];
  for (const key of orderedGroupKeys) {
    const items = groups.get(key)!;
    rendered.push({ kind: "header", label: key === "__none" ? "Không gắn campaign" : campaignName(key), count: items.length });
    rowCursor++;
    for (const t of items.sort((a, b) => (a.startDate ?? a.dueDate ?? "").localeCompare(b.startDate ?? b.dueDate ?? ""))) {
      rendered.push({ kind: "task", task: t });
      rowIndexById.set(t.id, rowCursor);
      rowCursor++;
    }
  }
  const bodyH = rendered.length * ROW_H;

  const visibleIds = new Set(visible.map((t) => t.id));
  const arrowDeps = dependencies.filter((d) => visibleIds.has(d.predecessorId) && visibleIds.has(d.successorId));
  const xOf = (day: string | null, fallback: string | null) => {
    const d = day ?? fallback;
    return d ? (dayNum(d) - minDay) * pxPerDay : 0;
  };
  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? "";

  // Dải tháng cho header tầng trên.
  const months: { key: string; label: string; start: number; len: number }[] = [];
  for (const d of days) {
    const dt = dayDate(d);
    const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
    const last = months[months.length - 1];
    if (last?.key === key) last.len++;
    else months.push({ key, label: `Tháng ${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}`, start: d, len: 1 });
  }

  return (
    <div className="space-y-3">
      <Toolbar {...{ zoom, setZoom, campaignFilter, setCampaignFilter, assigneeFilter, setAssigneeFilter, campaigns, users }} />

      <div ref={scrollRef} className="relative overflow-auto rounded-xl border bg-card shadow-xs" style={{ maxHeight: "72vh" }}>
        <div className="flex" style={{ width: LEFT_W + chartWidth }}>
          {/* Cột tên task — dính trái */}
          <div className="sticky left-0 z-20 shrink-0 border-r bg-card" style={{ width: LEFT_W }}>
            <div className="sticky top-0 z-10 flex items-end border-b bg-muted px-3 pb-2 text-xs font-semibold text-muted-foreground" style={{ height: HEADER_H }}>
              Task
            </div>
            {rendered.map((r, i) =>
              r.kind === "header" ? (
                <div key={`h-${i}`} className="flex items-center gap-2 border-b bg-muted/60 px-3 text-xs font-semibold" style={{ height: ROW_H }} title={r.label}>
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-background px-1.5 text-[10px] text-muted-foreground">{r.count}</span>
                </div>
              ) : (
                <button
                  key={r.task.id}
                  type="button"
                  className="flex w-full items-center gap-2 border-b px-3 text-left text-xs hover:bg-muted/40"
                  style={{ height: ROW_H }}
                  onClick={() => router.push(`/task/${r.task.id}`)}
                  title={r.task.title}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS[r.task.status]?.color }} />
                  <span className="truncate">{r.task.title}</span>
                </button>
              ),
            )}
          </div>

          {/* Vùng biểu đồ */}
          <div className="relative shrink-0" style={{ width: chartWidth }}>
            <div className="sticky top-0 z-10 border-b bg-muted" style={{ height: HEADER_H }}>
              {months.map((m) => (
                <div key={m.key} className="absolute top-0 flex h-6 items-center truncate border-l px-2 text-[11px] font-semibold" style={{ left: (m.start - minDay) * pxPerDay, width: m.len * pxPerDay }}>
                  {m.label}
                </div>
              ))}
              {days.map((d) => {
                const dt = dayDate(d);
                const wd = dt.getUTCDay();
                const show = zoom === "week" || wd === 1;
                if (!show) return null;
                return (
                  <div
                    key={d}
                    className={cn("absolute bottom-0 flex h-6 flex-col items-center justify-center border-l text-[10px] leading-none text-muted-foreground", d === todayN && "font-bold text-red-600")}
                    style={{ left: (d - minDay) * pxPerDay, width: zoom === "week" ? pxPerDay : pxPerDay * 7 }}
                  >
                    {zoom === "week" ? (
                      <>
                        <span>{WEEKDAY[wd]}</span>
                        <span className="mt-0.5 tabular-nums">{dt.getUTCDate()}</span>
                      </>
                    ) : (
                      <span className="tabular-nums">
                        {String(dt.getUTCDate()).padStart(2, "0")}/{String(dt.getUTCMonth() + 1).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nền: cuối tuần + dòng nhóm */}
            <div className="pointer-events-none absolute left-0" style={{ top: HEADER_H, width: chartWidth, height: bodyH }}>
              {days
                .filter((d) => {
                  const wd = dayDate(d).getUTCDay();
                  return wd === 0;
                })
                .map((d) => (
                  <div key={d} className="absolute top-0 h-full bg-muted/50" style={{ left: (d - minDay) * pxPerDay, width: pxPerDay }} />
                ))}
              {zoom === "week" &&
                days
                  .filter((d) => dayDate(d).getUTCDay() === 1)
                  .map((d) => <div key={`w${d}`} className="absolute top-0 h-full border-l border-dashed border-border" style={{ left: (d - minDay) * pxPerDay }} />)}
            </div>

            {/* Hôm nay */}
            <div className="pointer-events-none absolute z-[6]" style={{ left: (todayN - minDay) * pxPerDay + pxPerDay / 2, top: HEADER_H, height: bodyH }}>
              <div className="h-full w-0.5 -translate-x-1/2 bg-red-500/80" />
              <span className="absolute -top-0 left-1 whitespace-nowrap rounded bg-red-500 px-1 py-px text-[9px] font-semibold text-white">Hôm nay</span>
            </div>

            {/* Mũi tên phụ thuộc */}
            <svg className="pointer-events-none absolute left-0 z-[5]" style={{ top: HEADER_H }} width={chartWidth} height={bodyH}>
              <defs>
                <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
                </marker>
              </defs>
              {arrowDeps.map((d, i) => {
                const pred = visible.find((t) => t.id === d.predecessorId);
                const succ = visible.find((t) => t.id === d.successorId);
                if (!pred || !succ) return null;
                const predRow = rowIndexById.get(pred.id);
                const succRow = rowIndexById.get(succ.id);
                if (predRow == null || succRow == null) return null;
                const x1 = xOf(pred.dueDate, pred.startDate) + pxPerDay;
                const y1 = predRow * ROW_H + ROW_H / 2;
                const x2 = xOf(succ.startDate, succ.dueDate);
                const y2 = succRow * ROW_H + ROW_H / 2;
                return <path key={i} d={`M${x1},${y1} C${x1 + 20},${y1} ${x2 - 20},${y2} ${x2},${y2}`} stroke="#94a3b8" strokeWidth={1.5} fill="none" markerEnd="url(#gantt-arrow)" />;
              })}
            </svg>

            {rendered.map((r, i) =>
              r.kind === "header" ? (
                <div key={`hb-${i}`} className="border-b bg-muted/40" style={{ height: ROW_H }} />
              ) : (
                <TaskBar key={r.task.id} task={r.task} pxPerDay={pxPerDay} minDay={minDay} todayN={todayN} onClick={() => router.push(`/task/${r.task.id}`)} userName={userName} />
              ),
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        {Object.entries(STATUS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-slate-500" /> Mốc
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] ring-2 ring-red-500" /> Trễ hạn
        </span>
      </div>
    </div>
  );
}

function Toolbar({
  zoom,
  setZoom,
  campaignFilter,
  setCampaignFilter,
  assigneeFilter,
  setAssigneeFilter,
  campaigns,
  users,
}: {
  zoom: "week" | "month";
  setZoom: (z: "week" | "month") => void;
  campaignFilter: string;
  setCampaignFilter: (v: string) => void;
  assigneeFilter: string;
  setAssigneeFilter: (v: string) => void;
  campaigns: Lite[];
  users: Lite[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
      <div className="flex rounded-lg bg-muted p-0.5 text-sm">
        {(
          [
            ["week", "Theo ngày"],
            ["month", "Theo tuần"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setZoom(k)}
            className={cn("rounded-md px-2.5 py-1 transition-colors", zoom === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      <SimpleSelect
        triggerClassName="h-8 w-60"
        value={campaignFilter}
        onValueChange={(v) => v && setCampaignFilter(v)}
        options={[{ value: "all", label: "Mọi campaign" }, { value: "none", label: "Không gắn campaign" }, ...campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]}
      />
      <SimpleSelect
        triggerClassName="h-8 w-48"
        value={assigneeFilter}
        onValueChange={(v) => v && setAssigneeFilter(v)}
        options={[{ value: "all", label: "Mọi người phụ trách" }, ...users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))]}
      />
    </div>
  );
}

function TaskBar({
  task,
  pxPerDay,
  minDay,
  todayN,
  onClick,
  userName,
}: {
  task: GanttTask;
  pxPerDay: number;
  minDay: number;
  todayN: number;
  onClick: () => void;
  userName: (id: string | null) => string;
}) {
  const start = task.startDate ?? task.dueDate;
  const end = task.dueDate ?? task.startDate;
  if (!start || !end) return <div className="border-b" style={{ height: ROW_H }} />;
  const x = (dayNum(start) - minDay) * pxPerDay;
  const w = Math.max((dayNum(end) - dayNum(start) + 1) * pxPerDay - 4, 8);
  const color = STATUS[task.status]?.color ?? "#64748b";
  const overdue = dayNum(end) < todayN && task.status !== "done" && task.status !== "cancelled";
  const title = `${task.code} — ${task.title}${userName(task.assigneeId) ? ` (${userName(task.assigneeId)})` : ""}`;
  // Thanh đủ rộng thì ghi tên bên trong, không thì ghi bên phải thanh.
  const inside = w >= 110;

  return (
    <div className="relative border-b" style={{ height: ROW_H }}>
      {task.isMilestone ? (
        <>
          <div
            className="absolute top-1/2 cursor-pointer"
            style={{ left: x + pxPerDay / 2 - 7, width: 14, height: 14, backgroundColor: color, transform: "translateY(-50%) rotate(45deg)" }}
            onClick={onClick}
            title={title}
          />
          <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground" style={{ left: x + pxPerDay / 2 + 12 }}>
            {task.title}
          </span>
        </>
      ) : (
        <>
          <div
            className={cn("absolute top-1/2 flex -translate-y-1/2 cursor-pointer items-center rounded-md px-2 text-[11px] font-medium text-white shadow-xs transition-[filter] hover:brightness-110", overdue && "ring-2 ring-red-500 ring-offset-1 ring-offset-card")}
            style={{ left: x + 2, width: w, height: 20, backgroundColor: color, opacity: task.status === "done" || task.status === "cancelled" ? 0.55 : 1 }}
            onClick={onClick}
            title={title}
          >
            {inside && <span className="truncate">{task.title}</span>}
          </div>
          {!inside && (
            <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground" style={{ left: x + w + 8 }}>
              {task.title}
            </span>
          )}
        </>
      )}
    </div>
  );
}
