"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateTaskAction } from "./actions";

export interface TaskRowData {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

const PRIORITY_LABEL: Record<string, string> = { urgent: "Gấp", high: "Cao", medium: "TB", low: "Thấp" };

export function TaskRow({ task, today, compact }: { task: TaskRowData; today: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const overdue = !!task.dueDate && task.dueDate < today && task.status !== "done" && task.status !== "cancelled";

  function toggleDone(checked: boolean) {
    start(async () => {
      const res = await updateTaskAction(task.id, { status: checked ? "done" : "todo" });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Checkbox checked={task.status === "done"} onCheckedChange={(v) => toggleDone(v === true)} disabled={pending} />
      <Link href={`/task/${task.id}`} className={cn("flex-1 truncate text-sm hover:underline", task.status === "done" && "text-muted-foreground line-through")}>
        {task.title}
      </Link>
      {!compact && task.priority !== "medium" && (
        <Badge variant="outline" className={task.priority === "urgent" ? "text-crit" : ""}>
          {PRIORITY_LABEL[task.priority]}
        </Badge>
      )}
      {task.status === "blocked" && <Badge variant="outline" className="text-warn">chặn</Badge>}
      {task.dueDate && (
        <span className={cn("shrink-0 text-xs", overdue ? "text-crit font-medium" : "text-muted-foreground")}>
          {fmtDate(task.dueDate)}
        </span>
      )}
    </div>
  );
}
