"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";

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

const STATUS_BG: Record<string, string> = {
  todo: "#64748b",
  in_progress: "#2563eb",
  in_review: "#d97706",
  blocked: "#dc2626",
  done: "#059669",
  cancelled: "#9ca3af",
};

function dayNum(d: string): number {
  return Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86400000);
}
function dayStr(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROW_H = 32;

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

  const pxPerDay = zoom === "week" ? 28 : 10;

  const visible = tasks.filter((t) => {
    if (campaignFilter === "none" && t.campaignId) return false;
    if (campaignFilter !== "all" && campaignFilter !== "none" && t.campaignId !== campaignFilter) return false;
    if (assigneeFilter !== "all" && t.assigneeId !== assigneeFilter) return false;
    return true;
  });

  if (visible.length === 0) {
    return <p className="rounded-md border p-10 text-center text-sm text-muted-foreground">Không có task nào có ngày để hiển thị.</p>;
  }

  const allDays = visible.flatMap((t) => [t.startDate, t.dueDate].filter(Boolean) as string[]).map(dayNum);
  const todayN = dayNum(todayStr());
  const minDay = Math.min(...allDays, todayN) - 2;
  const maxDay = Math.max(...allDays, todayN) + 2;
  const totalDays = maxDay - minDay + 1;
  const chartWidth = totalDays * pxPerDay;

  // Nhóm theo campaign, campaign không có task con bị lọc hết thì ẩn.
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

  // Vị trí hàng (y index) cho mỗi task theo thứ tự hiển thị (để vẽ mũi tên phụ thuộc).
  const rowIndexById = new Map<string, number>();
  let rowCursor = 0;
  const rendered: ({ kind: "header"; label: string } | { kind: "task"; task: GanttTask })[] = [];
  for (const key of orderedGroupKeys) {
    rendered.push({ kind: "header", label: key === "__none" ? "Không gắn campaign" : campaignName(key) });
    rowCursor++;
    for (const t of groups.get(key)!.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))) {
      rendered.push({ kind: "task", task: t });
      rowIndexById.set(t.id, rowCursor);
      rowCursor++;
    }
  }

  const visibleIds = new Set(visible.map((t) => t.id));
  const arrowDeps = dependencies.filter((d) => visibleIds.has(d.predecessorId) && visibleIds.has(d.successorId));

  const xOf = (day: string | null, fallback: string | null) => {
    const d = day ?? fallback;
    if (!d) return 0;
    return (dayNum(d) - minDay) * pxPerDay;
  };

  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          triggerClassName="h-8 w-28"
          value={zoom}
          onValueChange={(v) => v && setZoom(v as "week" | "month")}
          options={[{ value: "week", label: "Tuần" }, { value: "month", label: "Tháng" }]}
        />
        <SimpleSelect
          triggerClassName="h-8 w-56"
          value={campaignFilter}
          onValueChange={(v) => v && setCampaignFilter(v)}
          options={[{ value: "all", label: "Mọi campaign" }, { value: "none", label: "Không gắn campaign" }, ...campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]}
        />
        <SimpleSelect
          triggerClassName="h-8 w-44"
          value={assigneeFilter}
          onValueChange={(v) => v && setAssigneeFilter(v)}
          options={[{ value: "all", label: "Mọi người phụ trách" }, ...users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))]}
        />
      </div>

      <div className="flex overflow-auto rounded-md border" style={{ maxHeight: "70vh" }}>
        <div className="sticky left-0 z-10 shrink-0 border-r bg-background" style={{ width: 240 }}>
          <div className="border-b bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground" style={{ height: ROW_H }}>
            Task
          </div>
          {rendered.map((r, i) =>
            r.kind === "header" ? (
              <div key={`h-${i}`} className="truncate border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold" style={{ height: ROW_H }}>
                {r.label}
              </div>
            ) : (
              <button
                key={r.task.id}
                className="flex w-full items-center truncate border-b px-3 text-left text-xs hover:bg-muted/30"
                style={{ height: ROW_H }}
                onClick={() => router.push(`/task/${r.task.id}`)}
                title={r.task.title}
              >
                <span className="truncate">{r.task.title}</span>
              </button>
            ),
          )}
        </div>

        <div className="relative shrink-0" style={{ width: chartWidth }}>
          {/* Thanh ngày (header) */}
          <div className="sticky top-0 z-10 border-b bg-muted/60" style={{ height: ROW_H }}>
            {Array.from({ length: totalDays }, (_, i) => minDay + i)
              .filter((d) => zoom === "week" || d % 7 === 0)
              .map((d) => (
                <div
                  key={d}
                  className="absolute top-0 flex h-full items-center border-l px-1 text-[10px] text-muted-foreground"
                  style={{ left: (d - minDay) * pxPerDay }}
                >
                  {dayStr(d).slice(5)}
                </div>
              ))}
          </div>

          {/* Đường hôm nay */}
          <div
            className="absolute top-0 z-[5] w-px bg-red-500"
            style={{ left: (todayN - minDay) * pxPerDay, height: rendered.length * ROW_H + ROW_H }}
          />

          {/* Mũi tên phụ thuộc */}
          <svg className="pointer-events-none absolute left-0 top-0 z-[4]" width={chartWidth} height={rendered.length * ROW_H + ROW_H}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
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
              const x1 = xOf(pred.dueDate, pred.startDate);
              const y1 = predRow * ROW_H + ROW_H + ROW_H / 2;
              const x2 = xOf(succ.startDate, succ.dueDate);
              const y2 = succRow * ROW_H + ROW_H + ROW_H / 2;
              return <path key={i} d={`M${x1},${y1} C${x1 + 20},${y1} ${x2 - 20},${y2} ${x2},${y2}`} stroke="#94a3b8" strokeWidth={1.5} fill="none" markerEnd="url(#arrow)" />;
            })}
          </svg>

          {rendered.map((r, i) =>
            r.kind === "header" ? (
              <div key={`hb-${i}`} className="border-b bg-muted/40" style={{ height: ROW_H }} />
            ) : (
              <TaskBar key={r.task.id} task={r.task} pxPerDay={pxPerDay} minDay={minDay} onClick={() => router.push(`/task/${r.task.id}`)} userName={userName} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function TaskBar({
  task,
  pxPerDay,
  minDay,
  onClick,
  userName,
}: {
  task: GanttTask;
  pxPerDay: number;
  minDay: number;
  onClick: () => void;
  userName: (id: string | null) => string;
}) {
  const start = task.startDate ?? task.dueDate;
  const end = task.dueDate ?? task.startDate;
  if (!start || !end) return <div className="border-b" style={{ height: ROW_H }} />;
  const x = (dayNum(start) - minDay) * pxPerDay;
  const w = Math.max((dayNum(end) - dayNum(start) + 1) * pxPerDay, 6);
  const color = STATUS_BG[task.status] ?? "#64748b";

  return (
    <div className="relative border-b" style={{ height: ROW_H }}>
      {task.isMilestone ? (
        <div
          className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
          style={{ left: x - 6, width: 12, height: 12, backgroundColor: color, transform: "translateY(-50%) rotate(45deg)" }}
          onClick={onClick}
          title={`${task.code} — ${task.title}`}
        />
      ) : (
        <div
          className={cn("absolute top-1/2 flex -translate-y-1/2 cursor-pointer items-center rounded px-1.5 text-[10px] text-white")}
          style={{ left: x, width: w, height: 18, backgroundColor: color, opacity: task.status === "done" || task.status === "cancelled" ? 0.6 : 1 }}
          onClick={onClick}
          title={`${task.code} — ${task.title} (${userName(task.assigneeId)})`}
        >
          <span className="truncate">{task.title}</span>
        </div>
      )}
    </div>
  );
}
