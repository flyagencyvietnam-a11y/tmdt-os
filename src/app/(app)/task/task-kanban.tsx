"use client";

import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { AlertTriangle, CalendarDays, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateTaskAction } from "./actions";
import { CARD_TONE_CLASS, taskTone } from "./task-style";

export interface KanbanTask {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: string | null;
  blockedReason: string | null;
  sourceType: string;
}

export const KANBAN_STATUSES = [
  { key: "todo", label: "Cần làm" },
  { key: "in_progress", label: "Đang làm" },
  { key: "in_review", label: "Chờ duyệt" },
  { key: "blocked", label: "Bị chặn" },
  { key: "done", label: "Xong" },
] as const;

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

/**
 * Thời điểm kết thúc lần kéo gần nhất. Sau khi thả thẻ, trình duyệt có thể bắn thêm 1 cú "click" lên thẻ vừa kéo
 * (có khi trễ vài trăm ms) — cú click đó không được mở task.
 */
let lastDragAt = 0;
const CLICK_GUARD_MS = 800;

/**
 * Bảng Kanban kéo-thả đổi trạng thái — dùng chung cho "Tất cả task" và "Việc của tôi".
 * Bấm vào tiêu đề thẻ mở task dạng popup; KÉO thẻ KHÔNG được mở popup (xem KanbanCard).
 */
export function TaskKanban({ tasks, userName, today, className }: { tasks: KanbanTask[]; userName: (id: string | null) => string; today: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function move(id: string, status: string) {
    start(async () => {
      let blockedReason: string | undefined;
      if (status === "blocked") {
        blockedReason = window.prompt("Lý do bị chặn:") ?? undefined;
        if (!blockedReason) return;
      }
      const res = await updateTaskAction(id, { status: status as never, blockedReason });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const taskId = e.active.id as string;
    const newStatus = e.over?.id as string | undefined;
    if (!newStatus) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === newStatus) return;
    move(taskId, newStatus);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={() => {
        lastDragAt = Number.MAX_SAFE_INTEGER;
      }}
      onDragCancel={() => {
        lastDragAt = Date.now();
      }}
      onDragEnd={(e) => {
        lastDragAt = Date.now();
        onDragEnd(e);
      }}
    >
      <div className={cn("grid gap-3 md:grid-cols-5", className)}>
        {KANBAN_STATUSES.map((col) => (
          <KanbanColumn key={col.key} id={col.key} label={col.label} items={tasks.filter((t) => t.status === col.key)} userName={userName} today={today} disabled={pending} />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({ id, label, items, userName, today, disabled }: { id: string; label: string; items: KanbanTask[]; userName: (id: string | null) => string; today: string; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("flex min-h-48 flex-col rounded-xl border bg-muted/50 p-2 transition-colors", isOver && "border-brand/50 bg-brand/5 ring-2 ring-brand/30")}>
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

function KanbanCard({ task, userName, today, disabled }: { task: KanbanTask; userName: string; today: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled });
  const tone = taskTone(task, today);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined}
      className={cn(
        "cursor-grab rounded-lg border border-l-[3px] p-2.5 text-sm shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing",
        CARD_TONE_CLASS[tone],
        PRIORITY_BORDER[task.priority],
        isDragging && "opacity-70 shadow-lg",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{task.code}</span>
        {task.sourceType === "recurring" && (
          <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1 font-semibold text-violet-700 dark:text-violet-300" title="Việc lặp lại">
            <Repeat className="h-3 w-3" /> Lặp
          </span>
        )}
        {task.priority !== "medium" && (
          <span className={cn("rounded px-1 font-semibold", task.priority === "urgent" ? "bg-red-500/10 text-red-600 dark:text-red-400" : task.priority === "high" ? "bg-orange-500/10 text-orange-600" : "bg-muted")}>
            {PRIORITY_LABEL[task.priority]}
          </span>
        )}
      </div>
      <Link
        href={`/task/${task.id}`}
        className="line-clamp-3 font-medium leading-snug hover:text-brand"
        draggable={false}
        onClick={(e) => {
          if (isDragging || Date.now() - lastDragAt < CLICK_GUARD_MS) e.preventDefault();
        }}
      >
        {task.title}
      </Link>
      {task.status === "blocked" && task.blockedReason && <p className="mt-1 line-clamp-2 rounded bg-red-500/5 px-1.5 py-1 text-[11px] text-red-700 dark:text-red-400">⛔ {task.blockedReason}</p>}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{userName}</span>
        {task.dueDate && (
          <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums", tone === "overdue" && "font-semibold text-red-700 dark:text-red-300")}>
            {tone === "overdue" ? <AlertTriangle className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
            {fmtDate(task.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}
