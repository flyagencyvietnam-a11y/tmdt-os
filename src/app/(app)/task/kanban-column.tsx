"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskItem } from "./task-board";

const PRIORITY_LABEL: Record<string, string> = { urgent: "Gấp", high: "Cao", medium: "TB", low: "Thấp" };

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
      className={cn("min-h-40 rounded-lg border bg-muted/20 p-2", isOver && "ring-2 ring-brand/40")}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
        {label}
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.map((t) => (
          <KanbanCard key={t.id} task={t} userName={userName(t.assigneeId)} today={today} disabled={disabled} />
        ))}
        {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">—</p>}
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
      className={cn("cursor-grab rounded-md border bg-background p-2 text-sm active:cursor-grabbing", isDragging && "opacity-60 shadow-lg")}
    >
      <div className="flex items-start justify-between gap-1">
        <a href={`/task/${task.id}`} className="font-medium hover:underline" onClick={(e) => isDragging && e.preventDefault()}>
          {task.title}
        </a>
        {task.priority !== "medium" && (
          <Badge variant="outline" className={task.priority === "urgent" ? "text-crit" : ""}>
            {PRIORITY_LABEL[task.priority]}
          </Badge>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{userName}</span>
        {task.dueDate && <span className={overdue ? "font-medium text-crit" : ""}>{fmtDate(task.dueDate)}</span>}
      </div>
    </div>
  );
}
