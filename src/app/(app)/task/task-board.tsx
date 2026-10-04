"use client";

import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CalendarDays, Columns3, List as ListIcon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadMore, ScopeChips, useUrlParam } from "@/components/scope-chips";
import { TASK_VIEW_LABEL, type TaskView } from "@/lib/task-view";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { createTaskAction, updateTaskAction } from "./actions";
import { KanbanColumn } from "./kanban-column";
import { TaskCalendar } from "./task-calendar";
import { TaskGrid } from "./task-grid";
import { todayVnDayStr } from "@/lib/time";

export interface TaskItem {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: string | null;
  campaignId: string | null;
  blockedReason: string | null;
  sourceType: string;
  channel: string | null;
}

const STATUSES = [
  { key: "todo", label: "Cần làm" },
  { key: "in_progress", label: "Đang làm" },
  { key: "in_review", label: "Chờ duyệt" },
  { key: "blocked", label: "Bị chặn" },
  { key: "done", label: "Xong" },
] as const;

export function TaskBoard({
  tasks,
  total,
  counts,
  view: scopeView,
  defaultView,
  assigneeId,
  pageSize,
  users,
  campaigns,
  currentUserId,
  canAssignOthers,
  icsUrl,
}: {
  tasks: TaskItem[];
  /** Tổng số task khớp phạm vi (có thể lớn hơn số đã tải). */
  total: number;
  counts: Record<TaskView, number>;
  view: TaskView;
  defaultView: TaskView;
  assigneeId: string | null;
  pageSize: number;
  users: { id: string; fullName: string }[];
  campaigns: { id: string; code: string; name: string }[];
  currentUserId: string;
  canAssignOthers: boolean;
  icsUrl?: string;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<"list" | "kanban" | "calendar">("list");
  const url = useUrlParam();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const today = todayVnDayStr();

  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";

  // Phạm vi (view / người phụ trách / giới hạn) đã được SERVER lọc; bảng bên dưới lọc mịn thêm trên số đã tải.
  const visible = tasks;

  const overdueCount = visible.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length;

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
    <div className="space-y-3">
      <div className="rounded-xl border bg-card px-2 py-1.5 shadow-xs">
        <ScopeChips
          param="view"
          value={scopeView}
          defaultValue={defaultView}
          options={(["active", "mine", "overdue", "week", "done", "archived", "all"] as TaskView[]).map((v) => ({ value: v, label: TASK_VIEW_LABEL[v], count: counts[v], alert: v === "overdue" }))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <div className="flex rounded-lg bg-muted p-0.5 text-sm">
          {(
            [
              ["list", "Danh sách", ListIcon],
              ["kanban", "Kanban", Columns3],
              ["calendar", "Lịch", CalendarDays],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
                view === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setView(key)}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <SimpleSelect
          triggerClassName="h-8 w-48"
          value={scopeView === "mine" ? "mine" : (assigneeId ?? "all")}
          onValueChange={(v) => {
            if (!v) return;
            if (v === "mine") return url.set({ view: "mine", assignee: null });
            // Chọn 1 người cụ thể khi đang ở "Của tôi" → chuyển sang "Đang làm việc" để lọc đúng người đó.
            const updates: Record<string, string | null> = { assignee: v === "all" ? null : v };
            if (scopeView === "mine") updates.view = defaultView === "active" ? null : "active";
            url.set(updates);
          }}
          options={[
            { value: "all", label: "Mọi người phụ trách" },
            { value: "mine", label: "Của tôi" },
            ...users.map((u) => ({ value: u.id, label: u.fullName })),
          ]}
        />
        <span className="text-xs text-muted-foreground">
          {visible.length.toLocaleString("vi-VN")}{total > visible.length ? ` / ${total.toLocaleString("vi-VN")}` : ""} task
          {overdueCount > 0 && <span className="ml-1 font-medium text-red-600 dark:text-red-400">· {overdueCount} trễ hạn</span>}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Task mới
        </Button>
      </div>

      {view === "list" && <TaskGrid rows={visible} users={users} campaigns={campaigns} canEdit canAssignOthers={canAssignOthers} />}
      {view === "kanban" && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid gap-3 md:grid-cols-5">
            {STATUSES.map((col) => (
              <KanbanColumn
                key={col.key}
                id={col.key}
                label={col.label}
                items={visible.filter((t) => t.status === col.key)}
                userName={userName}
                today={today}
                disabled={pending}
              />
            ))}
          </div>
        </DndContext>
      )}
      {view === "calendar" && <TaskCalendar tasks={visible} icsUrl={icsUrl} />}

      <LoadMore shown={visible.length} total={total} step={pageSize} />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
        campaigns={campaigns}
        currentUserId={currentUserId}
        canAssignOthers={canAssignOthers}
        onDone={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  users,
  campaigns,
  currentUserId,
  canAssignOthers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: { id: string; fullName: string }[];
  campaigns: { id: string; code: string; name: string }[];
  currentUserId: string;
  canAssignOthers: boolean;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    title: "",
    description: "",
    assigneeId: currentUserId,
    dueDate: "",
    priority: "medium",
    type: "general",
    campaignId: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Task mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Tiêu đề">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Loại">
              <SimpleSelect
                value={f.type}
                onValueChange={(v) => v && set("type", v)}
                options={[
                  { value: "general", label: "Chung" },
                  { value: "campaign_action", label: "Action plan" },
                  { value: "content", label: "Content" },
                  { value: "media", label: "Quay chụp" },
                  { value: "monitoring", label: "Giám sát" },
                  { value: "ads", label: "Ads" },
                  { value: "report", label: "Báo cáo" },
                  { value: "meeting", label: "Họp" },
                ]}
              />
            </F>
            <F label="Ưu tiên">
              <SimpleSelect
                value={f.priority}
                onValueChange={(v) => v && set("priority", v)}
                options={[
                  { value: "urgent", label: "Gấp" },
                  { value: "high", label: "Cao" },
                  { value: "medium", label: "Trung bình" },
                  { value: "low", label: "Thấp" },
                ]}
              />
            </F>
            <F label="Người phụ trách">
              <SimpleSelect
                value={f.assigneeId}
                onValueChange={(v) => v && set("assigneeId", v)}
                options={(canAssignOthers ? users : users.filter((u) => u.id === currentUserId)).map((u) => ({
                  value: u.id,
                  label: u.fullName,
                }))}
              />
            </F>
            <F label="Hạn">
              <Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </F>
            <F label="Campaign (tuỳ chọn)">
              <SimpleSelect
                value={f.campaignId}
                onValueChange={(v) => set("campaignId", v ?? "")}
                options={[{ value: "", label: "— Không gắn campaign —" }, ...campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]}
              />
            </F>
          </div>
          <Button
            className="w-full"
            disabled={pending || !f.title.trim()}
            onClick={() =>
              start(async () => {
                const res = await createTaskAction({
                  title: f.title,
                  description: f.description || null,
                  type: f.type as never,
                  priority: f.priority as never,
                  assigneeId: f.assigneeId || null,
                  dueDate: f.dueDate || null,
                  campaignId: f.campaignId || null,
                });
                if (res.ok) {
                  toast.success("Đã tạo task.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Tạo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
