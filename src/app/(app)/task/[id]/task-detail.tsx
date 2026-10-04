"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, History, ListChecks, MessageSquare, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { addCommentAction, toggleChecklistItemAction, updateTaskAction } from "../actions";

interface TaskFull {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  blockedReason: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  startDate: string | null;
  workstream: string | null;
  channel: string | null;
  referenceUrl: string | null;
  deliverableUrl: string | null;
  sourceType: string;
}

const STATUS_OPTIONS = [
  { value: "todo", label: "Cần làm" },
  { value: "in_progress", label: "Đang làm" },
  { value: "in_review", label: "Chờ duyệt" },
  { value: "blocked", label: "Bị chặn" },
  { value: "done", label: "Xong" },
  { value: "cancelled", label: "Huỷ" },
];
const STATUS_COLOR: Record<string, TagColor> = { todo: "slate", in_progress: "blue", in_review: "amber", blocked: "red", done: "emerald", cancelled: "gray" };

const CONTENT_STATUS_LABEL: Record<string, string> = { brief: "Brief", drafting: "Soạn nội dung", designing: "Thiết kế", in_review: "Chờ duyệt", approved: "Đã duyệt", published: "Đã đăng", cancelled: "Huỷ" };

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Gấp" },
  { value: "high", label: "Cao" },
  { value: "medium", label: "Trung bình" },
  { value: "low", label: "Thấp" },
];
const PRIORITY_COLOR: Record<string, TagColor> = { urgent: "red", high: "orange", medium: "sky", low: "slate" };

const SOURCE_LABEL: Record<string, string> = {
  manual: "Tạo tay",
  import: "Nhập từ file",
  recurring: "Việc lặp",
  content_item: "Content calendar",
  media_shoot: "Quay chụp",
  request: "Request",
  campaign_template: "Campaign",
};

/** Tên trường hiển thị cho lịch sử thay đổi (thay vì tên cột DB). */
const FIELD_LABEL: Record<string, string> = {
  status: "trạng thái",
  priority: "ưu tiên",
  assigneeId: "người phụ trách",
  assignee_id: "người phụ trách",
  dueDate: "hạn",
  due_date: "hạn",
  startDate: "ngày bắt đầu",
  start_date: "ngày bắt đầu",
  title: "tiêu đề",
  description: "mô tả",
  deliverableUrl: "link bàn giao",
  deliverable_url: "link bàn giao",
  blockedReason: "lý do bị chặn",
  blocked_reason: "lý do bị chặn",
};

export function TaskDetail({
  task,
  users,
  checklist,
  comments,
  activity,
  campaign,
  brand,
  recurringRuleName,
  contentItem,
  currentUserId,
  canAssignOthers,
}: {
  task: TaskFull;
  users: { id: string; fullName: string }[];
  checklist: { id: string; text: string; done: boolean }[];
  comments: { id: string; body: string; createdAt: string; authorName: string }[];
  activity: { id: string; field: string; fromValue: unknown; toValue: unknown; occurredAt: string; actorName: string | null }[];
  campaign: { id: string; code: string; name: string } | null;
  brand: { id: string; code: string; name: string } | null;
  recurringRuleName: string | null;
  /** Bài content gắn với task này (task cha đăng bài hoặc bước con của nó). */
  contentItem: { id: string; topic: string; status: string; publishDate: string; parentTaskId: string | null } | null;
  currentUserId: string;
  canAssignOthers: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [commentText, setCommentText] = React.useState("");
  const [showActivity, setShowActivity] = React.useState(false);

  const today = todayVnDayStr();
  const closed = task.status === "done" || task.status === "cancelled";
  const overdueDays = task.dueDate && !closed && task.dueDate < today ? Math.round((Date.parse(today) - Date.parse(task.dueDate)) / 86_400_000) : 0;
  const doneCount = checklist.filter((c) => c.done).length;
  const userName = (id: unknown) => users.find((u) => u.id === id)?.fullName ?? (id ? String(id) : "—");

  function patch(p: Parameters<typeof updateTaskAction>[1], okMsg?: string) {
    start(async () => {
      const res = await updateTaskAction(task.id, p);
      if (res.ok) {
        if (okMsg) toast.success(okMsg);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function sendComment() {
    if (!commentText.trim()) return;
    start(async () => {
      const res = await addCommentAction({ taskId: task.id, body: commentText, mentionedUserIds: [] });
      if (res.ok) {
        setCommentText("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  /** Giá trị dễ đọc cho lịch sử (nhãn trạng thái/ưu tiên, tên người, ngày dd/mm/yyyy). */
  function humanValue(field: string, v: unknown): string {
    if (v == null || v === "") return "trống";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (field === "status") return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
    if (field === "priority") return PRIORITY_OPTIONS.find((o) => o.value === s)?.label ?? s;
    if (/assignee/i.test(field)) return userName(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  }

  return (
    <div className="space-y-4">
      <Link href="/task" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Tất cả task
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground">{task.code}</span>
              <Tag color={STATUS_COLOR[task.status]}>{STATUS_OPTIONS.find((o) => o.value === task.status)?.label ?? task.status}</Tag>
              <Tag color={PRIORITY_COLOR[task.priority]}>Ưu tiên: {PRIORITY_OPTIONS.find((o) => o.value === task.priority)?.label}</Tag>
              {task.sourceType === "recurring" && recurringRuleName ? (
                <Tag color="violet">
                  <Repeat className="mr-1 h-3 w-3" /> {recurringRuleName}
                </Tag>
              ) : (
                <span className="text-muted-foreground">· {SOURCE_LABEL[task.sourceType] ?? task.sourceType}</span>
              )}
            </div>
            <Input
              key={task.title}
              defaultValue={task.title}
              aria-label="Tiêu đề task"
              className="h-auto border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-input focus-visible:px-2 md:text-2xl"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== task.title) patch({ title: v }, "Đã đổi tiêu đề.");
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>

          {contentItem && (
            <Link href={`/content?item=${contentItem.id}`} className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted">
              <CheckCircle2 className={cn("h-4 w-4 shrink-0", contentItem.status === "published" ? "text-emerald-600" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="block truncate">
                  Bài content: <b>{contentItem.topic}</b> · đăng {fmtDate(contentItem.publishDate)} ·{" "}
                  <span className={cn(contentItem.status === "published" && "font-medium text-emerald-700 dark:text-emerald-400")}>{CONTENT_STATUS_LABEL[contentItem.status] ?? contentItem.status}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {contentItem.parentTaskId === task.id ? "Xong task này = tự tick “Đã đăng” bên Content" : task.title.startsWith("Đăng bài:") ? "Xong bước “Đăng bài” = tự tick “Đã đăng” bên Content" : "Task con trong quy trình của bài content này"}; tick “Đã đăng” bên Content thì task cũng xong.
                </span>
              </span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          )}

          {overdueDays > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Đã trễ hạn <b>{overdueDays} ngày</b> (hạn {fmtDate(task.dueDate)}).
            </div>
          )}
          {task.status === "blocked" && task.blockedReason && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
              <b className="text-red-700 dark:text-red-400">Bị chặn:</b> {task.blockedReason}
            </div>
          )}

          <Section icon={null} title="Mô tả">
            <Textarea
              key={task.description ?? ""}
              rows={4}
              defaultValue={task.description ?? ""}
              placeholder="Thêm mô tả, yêu cầu, ghi chú bàn giao…"
              className="border-transparent bg-transparent px-0 shadow-none hover:border-input focus-visible:border-input focus-visible:px-3"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (task.description ?? "")) patch({ description: v || null }, "Đã lưu mô tả.");
              }}
            />
          </Section>

          {checklist.length > 0 && (
            <Section icon={<ListChecks className="h-4 w-4" />} title={`Checklist · ${doneCount}/${checklist.length}`}>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
              </div>
              <div className="space-y-1">
                {checklist.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={c.done}
                      onCheckedChange={(v) =>
                        start(async () => {
                          const res = await toggleChecklistItemAction(c.id, v === true);
                          if (res.ok) router.refresh();
                          else toast.error(res.error);
                        })
                      }
                      disabled={pending}
                    />
                    <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.text}</span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          <Section icon={<MessageSquare className="h-4 w-4" />} title={`Bình luận${comments.length ? ` · ${comments.length}` : ""}`}>
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3 text-sm">
                  <Avatar name={c.authorName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.authorName}</span>
                      <span>{fmtDateTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-muted-foreground">Chưa có bình luận.</p>}
              <div className="space-y-2 border-t pt-3">
                <Textarea
                  rows={2}
                  placeholder="Viết bình luận… (Ctrl + Enter để gửi)"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendComment();
                  }}
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={pending || !commentText.trim()} onClick={sendComment}>
                    Gửi bình luận
                  </Button>
                </div>
              </div>
            </div>
          </Section>

          {activity.length > 0 && (
            <Section
              icon={<History className="h-4 w-4" />}
              title={`Lịch sử thay đổi · ${activity.length}`}
              action={
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowActivity((v) => !v)}>
                  {showActivity ? "Thu gọn" : "Xem"}
                </button>
              }
            >
              {showActivity ? (
                <ol className="relative space-y-3 border-l pl-4 text-xs">
                  {[...activity].reverse().map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <div className="text-muted-foreground">{fmtDateTime(a.occurredAt)}</div>
                      <div>
                        <b>{a.actorName ?? "Hệ thống"}</b> đổi {FIELD_LABEL[a.field] ?? a.field}: <span className="text-muted-foreground line-through">{humanValue(a.field, a.fromValue)}</span> →{" "}
                        <b>{humanValue(a.field, a.toValue)}</b>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Thay đổi gần nhất: {fmtDateTime(activity[activity.length - 1].occurredAt)} bởi {activity[activity.length - 1].actorName ?? "Hệ thống"}.
                </p>
              )}
            </Section>
          )}
        </div>

        <aside className="h-fit space-y-4 rounded-xl border bg-card p-4 shadow-xs lg:sticky lg:top-20">
          {!closed ? (
            <Button className="w-full" variant="outline" disabled={pending} onClick={() => patch({ status: "done" }, "Đã hoàn thành task.")}>
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" /> Đánh dấu xong
            </Button>
          ) : (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {task.status === "done" ? "✓ Task đã hoàn thành" : "Task đã huỷ"}
            </p>
          )}
          <Field label="Trạng thái">
            <SimpleSelect value={task.status} onValueChange={(v) => v && patch({ status: v as never })} options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: <Tag color={STATUS_COLOR[o.value]}>{o.label}</Tag> }))} />
          </Field>
          {task.status === "blocked" && (
            <Field label="Lý do bị chặn">
              <Textarea rows={2} defaultValue={task.blockedReason ?? ""} onBlur={(e) => patch({ blockedReason: e.target.value })} />
            </Field>
          )}
          <Field label="Người phụ trách">
            <SimpleSelect
              value={task.assigneeId ?? ""}
              onValueChange={(v) => patch({ assigneeId: v || null })}
              options={(canAssignOthers ? users : users.filter((u) => u.id === currentUserId)).map((u) => ({ value: u.id, label: u.fullName }))}
              disabled={!canAssignOthers && task.assigneeId !== currentUserId}
            />
          </Field>
          <Field label="Ưu tiên">
            <SimpleSelect value={task.priority} onValueChange={(v) => v && patch({ priority: v as never })} options={PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: <Tag color={PRIORITY_COLOR[o.value]}>{o.label}</Tag> }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu">
              <Input type="date" defaultValue={task.startDate ?? ""} onChange={(e) => patch({ startDate: e.target.value || null })} />
            </Field>
            <Field label="Hạn">
              <Input type="date" defaultValue={task.dueDate ?? ""} className={cn(overdueDays > 0 && "border-red-400 text-red-700 dark:text-red-400")} onChange={(e) => patch({ dueDate: e.target.value || null })} />
            </Field>
          </div>

          <div className="space-y-3 border-t pt-4">
            {campaign && (
              <Field label="Campaign">
                <Link href={`/campaign/${campaign.id}`} className="text-sm font-medium text-brand hover:underline">
                  {campaign.code} — {campaign.name}
                </Link>
              </Field>
            )}
            {brand && <Field label="Brand">{brand.name}</Field>}
            {task.workstream && <Field label="Mảng việc">{task.workstream}</Field>}
            {task.channel && <Field label="Kênh">{task.channel}</Field>}
            {task.referenceUrl && (
              <Field label="Link tham khảo">
                <a href={task.referenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-sm text-brand hover:underline">
                  Mở link <ExternalLink className="h-3 w-3" />
                </a>
              </Field>
            )}
            <Field label="Link bàn giao">
              <div className="flex gap-1.5">
                <Input defaultValue={task.deliverableUrl ?? ""} placeholder="https://…" onBlur={(e) => e.target.value !== (task.deliverableUrl ?? "") && patch({ deliverableUrl: e.target.value || null }, "Đã lưu link bàn giao.")} />
                {task.deliverableUrl && (
                  <a href={task.deliverableUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted" title="Mở link">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </Field>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <header className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {title}
        {action && <span className="ml-auto">{action}</span>}
      </header>
      {children}
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  const ini = parts.length === 0 ? "?" : parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold uppercase text-brand">{ini}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}
