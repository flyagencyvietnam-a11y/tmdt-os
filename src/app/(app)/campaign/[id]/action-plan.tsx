"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskRow } from "../../task/task-row";
import { createTaskAction } from "../../task/actions";
import { todayVnDayStr } from "@/lib/time";

interface ActionTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: string | null;
  workstream: string | null;
}

export function CampaignActionPlan({
  campaignId,
  tasks,
  currentUserId,
}: {
  campaignId: string;
  tasks: ActionTask[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [newTitle, setNewTitle] = React.useState("");
  const today = todayVnDayStr();

  const groups = new Map<string, ActionTask[]>();
  for (const t of tasks) {
    const key = t.workstream ?? "Chưa phân nhóm";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  function addAction() {
    if (!newTitle.trim()) return;
    start(async () => {
      const res = await createTaskAction({
        title: newTitle,
        type: "campaign_action",
        campaignId,
        assigneeId: currentUserId,
      });
      if (res.ok) {
        setNewTitle("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Thêm action..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addAction()}
        />
        <Button size="sm" onClick={addAction} disabled={pending || !newTitle.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Thêm
        </Button>
      </div>
      {[...groups.entries()].map(([workstream, items]) => (
        <div key={workstream} className="space-y-1">
          <div className="text-xs font-semibold uppercase text-muted-foreground">{workstream}</div>
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {items.map((t) => (
              <TaskRow key={t.id} task={{ id: t.id, code: "", title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate }} today={today} />
            ))}
          </div>
        </div>
      ))}
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">Chưa có action nào.</p>}
    </div>
  );
}
