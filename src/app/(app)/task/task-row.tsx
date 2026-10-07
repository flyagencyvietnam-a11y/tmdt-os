"use client";

import { Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateTaskAction } from "./actions";
import { TaskLinks, type TaskCampaignRef, type TaskSbuRef } from "./task-links";
import { isTaskOverdue, isTaskRecurring, ROW_TONE_CLASS } from "./task-style";

export interface TaskRowData {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  sourceType?: string | null;
  /** Campaign của task (nếu có) và các SBU liên quan — hiện thành chip dưới tiêu đề. */
  campaign?: TaskCampaignRef | null;
  sbus?: TaskSbuRef[];
}

const PRIORITY_LABEL: Record<string, string> = { urgent: "Gấp", high: "Cao", medium: "TB", low: "Thấp" };

export function TaskRow({ task, today, compact }: { task: TaskRowData; today: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const overdue = isTaskOverdue(task, today);
  const recurring = isTaskRecurring(task);

  function toggleDone(checked: boolean) {
    start(async () => {
      const res = await updateTaskAction(task.id, { status: checked ? "done" : "todo" });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <div className={cn("group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40", overdue ? ROW_TONE_CLASS.overdue : recurring && ROW_TONE_CLASS.recurring)}>
      <Checkbox checked={task.status === "done"} onCheckedChange={(v) => toggleDone(v === true)} disabled={pending} />
      <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority] ?? "bg-muted-foreground/30")} title={`Ưu tiên: ${PRIORITY_LABEL[task.priority] ?? task.priority}`} />
      <div className="min-w-0 flex-1">
        <Link href={`/task/${task.id}`} className="block">
          <span className={cn("flex items-center gap-1.5 truncate text-sm group-hover:text-brand", task.status === "done" && "text-muted-foreground line-through")}>
            {recurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-label="Việc lặp lại" />}
            <span className="truncate">{task.title}</span>
          </span>
          {!compact && <span className="block text-[11px] text-muted-foreground">{task.code}</span>}
        </Link>
        <TaskLinks campaign={task.campaign} sbus={task.sbus} className="mt-1" />
      </div>
      {task.status === "blocked" && (
        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
          Bị chặn
        </Badge>
      )}
      {task.dueDate && <DueLabel due={task.dueDate} today={today} overdue={overdue} />}
    </div>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-sky-500",
  low: "bg-slate-300 dark:bg-slate-600",
};

function DueLabel({ due, today, overdue }: { due: string; today: string; overdue: boolean }) {
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  const label = diff === 0 ? "Hôm nay" : diff === 1 ? "Ngày mai" : diff < 0 ? `Trễ ${-diff} ngày` : diff <= 7 ? `Còn ${diff} ngày` : fmtDate(due);
  return (
    <span
      title={fmtDate(due)}
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        overdue ? "bg-red-600 text-white" : diff === 0 ? "bg-brand/10 text-brand" : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
