"use client";

import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createTaskAction, updateTaskAction } from "./actions";
import { KanbanColumn } from "./kanban-column";

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
}

const STATUSES = [
  { key: "todo", label: "Cần làm" },
  { key: "in_progress", label: "Đang làm" },
  { key: "in_review", label: "Chờ duyệt" },
  { key: "blocked", label: "Bị chặn" },
  { key: "done", label: "Xong" },
] as const;

const PRIORITY_LABEL: Record<string, string> = { urgent: "Gấp", high: "Cao", medium: "TB", low: "Thấp" };

const STATUS_SELECT_OPTIONS: { value: string; label: string }[] = [
  ...STATUSES.map((s) => ({ value: s.key as string, label: s.label as string })),
  { value: "cancelled", label: "Huỷ" },
];

export function TaskBoard({
  tasks,
  users,
  campaigns,
  currentUserId,
  canAssignOthers,
}: {
  tasks: TaskItem[];
  users: { id: string; fullName: string }[];
  campaigns: { id: string; code: string; name: string }[];
  currentUserId: string;
  canAssignOthers: boolean;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<"list" | "kanban">("list");
  const [statusFilter, setStatusFilter] = React.useState<string>("open");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const today = new Date().toISOString().slice(0, 10);

  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";

  const visible = tasks.filter((t) => {
    if (statusFilter === "open" && (t.status === "done" || t.status === "cancelled")) return false;
    if (statusFilter !== "open" && statusFilter !== "all" && t.status !== statusFilter) return false;
    if (assigneeFilter === "mine" && t.assigneeId !== currentUserId) return false;
    if (assigneeFilter !== "all" && assigneeFilter !== "mine" && t.assigneeId !== assigneeFilter) return false;
    return true;
  });

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
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border text-sm">
          <button
            className={cn("px-2.5 py-1", view === "list" && "bg-brand/10 font-medium text-brand")}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={cn("px-2.5 py-1", view === "kanban" && "bg-brand/10 font-medium text-brand")}
            onClick={() => setView("kanban")}
          >
            Kanban
          </button>
        </div>
        <SimpleSelect
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v)}
          options={[
            { value: "open", label: "Đang mở" },
            { value: "all", label: "Tất cả trạng thái" },
            ...STATUSES.map((s) => ({ value: s.key, label: s.label })),
          ]}
        />
        <SimpleSelect
          value={assigneeFilter}
          onValueChange={(v) => v && setAssigneeFilter(v)}
          options={[
            { value: "all", label: "Mọi người phụ trách" },
            { value: "mine", label: "Của tôi" },
            ...users.map((u) => ({ value: u.id, label: u.fullName })),
          ]}
        />
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Task mới
        </Button>
      </div>

      {view === "list" ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Tiêu đề</th>
                <th className="px-3 py-2">Người phụ trách</th>
                <th className="px-3 py-2">Hạn</th>
                <th className="px-3 py-2">Ưu tiên</th>
                <th className="px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const overdue = !!t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "cancelled";
                return (
                  <tr key={t.id} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{t.code}</td>
                    <td className="px-3 py-2">
                      <a href={`/task/${t.id}`} className="hover:underline">
                        {t.title}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{userName(t.assigneeId)}</td>
                    <td className={cn("px-3 py-2", overdue && "font-medium text-crit")}>{fmtDate(t.dueDate)}</td>
                    <td className="px-3 py-2">{PRIORITY_LABEL[t.priority]}</td>
                    <td className="px-3 py-2">
                      <SimpleSelect
                        value={t.status}
                        onValueChange={(v) => v && move(t.id, v)}
                        options={STATUS_SELECT_OPTIONS}
                      />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Không có task.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
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
