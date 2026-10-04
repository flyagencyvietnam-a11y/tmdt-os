"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskItem } from "./task-board";

const PRIORITY_LABEL: Record<string, string> = { urgent: "Gấp", high: "Cao", medium: "TB", low: "Thấp" };
const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-sky-400",
  low: "border-l-slate-300 dark:border-l-slate-600",
};
const COLUMN_DOT: Record<string, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-sky-500",
  in_review: "bg-amber-500",
  blocked: "bg-red-500",
  done: "bg-emerald-500",
};

export function KanbanColumn({
  id,
  label,
  items,
  userName,
  today,
  disabled,
}: {
  id: string;
  label: string;
  items: TaskItem[];
  userName: (id: string | null) => string;
  today: string;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("flex min-h-48 flex-col rounded-xl border bg-muted/50 p-2 transition-colors", isOver && "border-brand/50 bg-brand/5 ring-2 ring-brand/30")}
    >
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-0.5 text-sm font-semibold">
        <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[id] ?? "bg-muted-foreground")} />
        {label}
        <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-xs">{items.length}</span>
      </div>
      <div className="flex-1 space-y-2">
        {items.map((t) => (
          <KanbanCard key={t.id} task={t} userName={userName(t.assigneeId)} today={today} disabled={disabled} />
        ))}
        {items.length === 0 && <p className="rounded-lg border border-dashed px-1 py-6 text-center text-xs text-muted-foreground">Kéo task vào đây</p>}
      </div>
    </div>
  );
}

function KanbanCard({
  task,
  userName,
  today,
  disabled,
}: {
  task: TaskItem;
  userName: string;
  today: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled });
  const overdue = !!task.dueDate && task.dueDate < today && task.status !== "done" && task.status !== "cancelled";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined}
      className={cn(
        "cursor-grab rounded-lg border border-l-[3px] bg-card p-2.5 text-sm shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing",
        PRIORITY_BORDER[task.priority],
        isDragging && "opacity-70 shadow-lg",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{task.code}</span>
        {task.priority !== "medium" && (
          <span className={cn("rounded px-1 font-semibold", task.priority === "urgent" ? "bg-red-500/10 text-red-600 dark:text-red-400" : task.priority === "high" ? "bg-orange-500/10 text-orange-600" : "bg-muted")}>
            {PRIORITY_LABEL[task.priority]}
          </span>
        )}
      </div>
      <a href={`/task/${task.id}`} className="line-clamp-3 font-medium leading-snug hover:text-brand" onClick={(e) => isDragging && e.preventDefault()}>
        {task.title}
      </a>
      {task.status === "blocked" && task.blockedReason && (
        <p className="mt-1 line-clamp-2 rounded bg-red-500/5 px-1.5 py-1 text-[11px] text-red-700 dark:text-red-400">⛔ {task.blockedReason}</p>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{userName}</span>
        {task.dueDate && (
          <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums", overdue && "font-semibold text-red-600 dark:text-red-400")}>
            {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
            {fmtDate(task.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}
