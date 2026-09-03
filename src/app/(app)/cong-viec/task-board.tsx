"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "./actions";

const COLS = [
  { key: "TODO", label: "Cần làm" },
  { key: "IN_PROGRESS", label: "Đang làm" },
  { key: "DONE", label: "Xong" },
] as const;
const PRIORITY: Record<string, string> = {
  LOW: "Thấp",
  NORMAL: "Thường",
  HIGH: "Cao",
  URGENT: "Gấp",
};

interface Task {
  id: string;
  title: string;
  description: string | null;
  groupCode: string | null;
  type: string;
  status: string;
  priority: string;
  progressPct: number;
  dueDate: string | null;
  goalKpi: string | null;
  linkUrl: string | null;
  blockedReason: string | null;
  recurrenceRule: string | null;
  assigneeId: string;
  assigneeName: string | null;
  completedAt: string | null;
  leadId: string | null;
  leadCode: string | null;
  leadStage: string | null;
}

export function TaskBoard({
  tasks,
  stats,
  users,
  currentUserId,
  canSeeAll,
  canAssignOthers,
  scope,
}: {
  tasks: Task[];
  stats: {
    total: number;
    done: number;
    blocked: number;
    inProgress: number;
    todo: number;
    completionPct: number | null;
  };
  users: { id: string; fullName: string }[];
  currentUserId: string;
  canSeeAll: boolean;
  canAssignOthers: boolean;
  scope: "mine" | "team";
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function move(id: string, status: string) {
    start(async () => {
      let blockedReason: string | undefined;
      if (status === "BLOCKED") {
        blockedReason = window.prompt("Lý do bị chặn:") ?? undefined;
        if (!blockedReason) return;
      }
      const res = await updateTaskAction(id, { status: status as never, blockedReason });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  const visible = tasks.filter((t) => t.status !== "CANCELLED");
  const blocked = visible.filter((t) => t.status === "BLOCKED");
  const overdue = visible.filter(
    (t) => t.dueDate && t.dueDate < today && t.status !== "DONE",
  );

  return (
    <div className="space-y-4">
      {/* Thẻ tổng */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Kpi label="Tổng" v={stats.total} />
          <Kpi label="Xong" v={stats.done} />
          <Kpi label="% hoàn thành" v={fmtPct(stats.completionPct)} />
          <Kpi label="Đang làm" v={stats.inProgress} />
          <Kpi label="Quá hạn" v={overdue.length} tone={overdue.length ? "crit" : undefined} />
          <Kpi label="Bị chặn" v={stats.blocked} tone={stats.blocked ? "warn" : undefined} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canSeeAll && (
            <div className="flex rounded-md border text-sm">
              <a
                href="/cong-viec"
                className={cn(
                  "px-2.5 py-1",
                  scope === "mine" && "bg-brand/10 font-medium text-brand",
                )}
              >
                Của tôi
              </a>
              <a
                href="/cong-viec?scope=team"
                className={cn(
                  "px-2.5 py-1",
                  scope === "team" && "bg-brand/10 font-medium text-brand",
                )}
              >
                Toàn đội
              </a>
            </div>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Việc mới
          </Button>
        </div>
      </div>

      {blocked.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm">
          <div className="mb-1 font-medium">Đang bị chặn ({blocked.length})</div>
          <ul className="space-y-0.5">
            {blocked.map((t) => (
              <li key={t.id}>
                {t.title} — {t.blockedReason}
                <button
                  className="ml-2 text-xs text-brand hover:underline"
                  onClick={() => move(t.id, "IN_PROGRESS")}
                >
                  gỡ chặn
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Kanban */}
      <div className="grid gap-3 md:grid-cols-3">
        {COLS.map((col) => {
          const items = visible.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-lg border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                {col.label}
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <TaskCard
                    key={t.id}
                    t={t}
                    today={today}
                    scope={scope}
                    onMove={move}
                    onDelete={
                      canAssignOthers
                        ? () =>
                            start(async () => {
                              const res = await deleteTaskAction(t.id);
                              if (res.ok) router.refresh();
                              else toast.error(res.error);
                            })
                        : undefined
                    }
                    disabled={pending}
                  />
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
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

function Kpi({
  label,
  v,
  tone,
}: {
  label: string;
  v: React.ReactNode;
  tone?: "crit" | "warn";
}) {
  return (
    <div className="rounded-md border px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "crit" && "text-crit",
          tone === "warn" && "text-warn",
        )}
      >
        {v}
      </div>
    </div>
  );
}

function TaskCard({
  t,
  today,
  scope,
  onMove,
  onDelete,
  disabled,
}: {
  t: Task;
  today: string;
  scope: "mine" | "team";
  onMove: (id: string, status: string) => void;
  onDelete?: () => void;
  disabled: boolean;
}) {
  const overdue = t.dueDate && t.dueDate < today && t.status !== "DONE";
  return (
    <div className="rounded-md border bg-background p-2 text-sm">
      <div className="flex items-start justify-between gap-1">
        <span className="font-medium">{t.title}</span>
        {t.priority !== "NORMAL" && (
          <Badge variant="outline" className={t.priority === "URGENT" ? "text-crit" : ""}>
            {PRIORITY[t.priority]}
          </Badge>
        )}
      </div>
      {t.groupCode && (
        <div className="text-[10px] text-muted-foreground">{t.groupCode}</div>
      )}
      {t.goalKpi && (
        <div className="mt-0.5 text-xs text-muted-foreground">🎯 {t.goalKpi}</div>
      )}
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {t.type === "RECURRING" && <Badge variant="outline">định kỳ</Badge>}
        {t.type === "LEAD_CARE" && <Badge variant="outline">chăm sóc lead</Badge>}
        {scope === "team" && <span>{t.assigneeName}</span>}
        {t.dueDate && (
          <span className={overdue ? "text-crit" : ""}>{fmtDate(t.dueDate)}</span>
        )}
        {t.leadId ? (
          <Link href={`/lead/${t.leadId}`} className="text-brand hover:underline">
            {t.leadCode ?? "mở lead"}
          </Link>
        ) : (
          t.linkUrl && (
            <a href={t.linkUrl} target="_blank" rel="noreferrer" className="text-brand">
              link
            </a>
          )
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]
          .filter((s) => s !== t.status)
          .map((s) => (
            <button
              key={s}
              disabled={disabled}
              className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted"
              onClick={() => onMove(t.id, s)}
            >
              →{" "}
              {s === "TODO"
                ? "Cần làm"
                : s === "IN_PROGRESS"
                  ? "Đang làm"
                  : s === "DONE"
                    ? "Xong"
                    : "Chặn"}
            </button>
          ))}
        {onDelete && (
          <button
            className="rounded border px-1.5 py-0.5 text-[10px] text-crit hover:bg-muted"
            onClick={onDelete}
          >
            xóa
          </button>
        )}
      </div>
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  users,
  currentUserId,
  canAssignOthers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: { id: string; fullName: string }[];
  currentUserId: string;
  canAssignOthers: boolean;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    title: "",
    description: "",
    groupCode: "",
    type: "PROJECT",
    assigneeId: currentUserId,
    goalKpi: "",
    dueDate: "",
    priority: "NORMAL",
    recurrenceRule: "DAILY_WEEKDAY",
    linkUrl: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đầu việc mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Tiêu đề">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
          </F>
          <F label="Mô tả">
            <Textarea
              rows={2}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Nhóm">
              <Input
                value={f.groupCode}
                onChange={(e) => set("groupCode", e.target.value)}
              />
            </F>
            <F label="Loại">
              <SimpleSelect
                value={f.type}
                onValueChange={(v) => set("type", v)}
                options={[
                  { value: "PROJECT", label: "Dự án" },
                  { value: "RECURRING", label: "Định kỳ" },
                ]}
              />
            </F>
            {canAssignOthers && (
              <F label="Người phụ trách">
                <SimpleSelect
                  value={f.assigneeId}
                  onValueChange={(v) => set("assigneeId", v)}
                  options={users.map((u) => ({ value: u.id, label: u.fullName }))}
                />
              </F>
            )}
            <F label="Ưu tiên">
              <SimpleSelect
                value={f.priority}
                onValueChange={(v) => set("priority", v)}
                options={Object.entries(PRIORITY).map(([k, l]) => ({
                  value: k,
                  label: l,
                }))}
              />
            </F>
            {f.type === "PROJECT" && (
              <F label="Hạn">
                <Input
                  type="date"
                  value={f.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </F>
            )}
            {f.type === "RECURRING" && (
              <F label="Luật lặp">
                <SimpleSelect
                  value={f.recurrenceRule}
                  onValueChange={(v) => set("recurrenceRule", v)}
                  options={[
                    { value: "DAILY", label: "Mỗi ngày" },
                    { value: "DAILY_WEEKDAY", label: "T2–T7" },
                    { value: "WEEKLY:MON", label: "Mỗi thứ Hai" },
                    { value: "MONTHLY:1", label: "Ngày 1 hằng tháng" },
                    { value: "MONTHLY:3", label: "Ngày 3 hằng tháng" },
                  ]}
                />
              </F>
            )}
          </div>
          <F label="Mục tiêu / KPI">
            <Input value={f.goalKpi} onChange={(e) => set("goalKpi", e.target.value)} />
          </F>
          <F label="Link tài liệu (Canva/Drive)">
            <Input value={f.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.title.trim()}
            onClick={() =>
              start(async () => {
                const res = await createTaskAction({
                  title: f.title,
                  description: f.description || null,
                  groupCode: f.groupCode || null,
                  type: f.type as never,
                  assigneeId: f.assigneeId,
                  goalKpi: f.goalKpi || null,
                  dueDate: f.type === "PROJECT" ? f.dueDate || null : null,
                  priority: f.priority as never,
                  recurrenceRule: f.type === "RECURRING" ? f.recurrenceRule : null,
                  linkUrl: f.linkUrl || null,
                });
                if (res.ok) {
                  toast.success("Đã tạo đầu việc.");
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
