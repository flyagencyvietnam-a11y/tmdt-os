"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
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

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Gấp" },
  { value: "high", label: "Cao" },
  { value: "medium", label: "Trung bình" },
  { value: "low", label: "Thấp" },
];

export function TaskDetail({
  task,
  users,
  checklist,
  comments,
  activity,
  campaign,
  brand,
  recurringRuleName,
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
  currentUserId: string;
  canAssignOthers: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [commentText, setCommentText] = React.useState("");

  function patch(p: Parameters<typeof updateTaskAction>[1]) {
    start(async () => {
      const res = await updateTaskAction(task.id, p);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div>
          <div className="text-xs text-muted-foreground">
            {task.code}
            {task.sourceType === "recurring" && recurringRuleName && (
              <Badge variant="outline" className="ml-2">
                lặp — {recurringRuleName}
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold">{task.title}</h1>
        </div>

        {task.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>}

        {checklist.length > 0 && (
          <div className="space-y-1 rounded-lg border p-3">
            <div className="text-sm font-semibold">
              Checklist ({checklist.filter((c) => c.done).length}/{checklist.length})
            </div>
            {checklist.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
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
        )}

        <div className="space-y-2 rounded-lg border p-3">
          <div className="text-sm font-semibold">Bình luận</div>
          {comments.map((c) => (
            <div key={c.id} className="border-b pb-2 text-sm last:border-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.authorName}</span>
                <span>{fmtDateTime(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <Textarea
              rows={2}
              placeholder="Viết bình luận..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <Button
              disabled={pending || !commentText.trim()}
              onClick={() =>
                start(async () => {
                  const res = await addCommentAction({ taskId: task.id, body: commentText, mentionedUserIds: [] });
                  if (res.ok) {
                    setCommentText("");
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Gửi
            </Button>
          </div>
        </div>

        {activity.length > 0 && (
          <div className="space-y-1 rounded-lg border p-3">
            <div className="text-sm font-semibold">Lịch sử thay đổi</div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {activity.map((a) => (
                <li key={a.id}>
                  {fmtDateTime(a.occurredAt)} — {a.actorName ?? "Hệ thống"} đổi <code>{a.field}</code>:{" "}
                  {JSON.stringify(a.fromValue)} → {JSON.stringify(a.toValue)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <Field label="Trạng thái">
          <SimpleSelect value={task.status} onValueChange={(v) => v && patch({ status: v as never })} options={STATUS_OPTIONS} />
        </Field>
        {task.status === "blocked" && (
          <Field label="Lý do bị chặn">
            <Textarea
              rows={2}
              defaultValue={task.blockedReason ?? ""}
              onBlur={(e) => patch({ blockedReason: e.target.value })}
            />
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
          <SimpleSelect value={task.priority} onValueChange={(v) => v && patch({ priority: v as never })} options={PRIORITY_OPTIONS} />
        </Field>
        <Field label="Hạn">
          <Input type="date" defaultValue={task.dueDate ?? ""} onChange={(e) => patch({ dueDate: e.target.value || null })} />
        </Field>
        {campaign && (
          <Field label="Campaign">
            <a href={`/campaign/${campaign.id}`} className="text-sm text-brand hover:underline">
              {campaign.code} — {campaign.name}
            </a>
          </Field>
        )}
        {brand && <Field label="Brand">{brand.name}</Field>}
        {task.workstream && <Field label="Workstream">{task.workstream}</Field>}
        {task.channel && <Field label="Kênh">{task.channel}</Field>}
        {task.referenceUrl && (
          <Field label="Link tham khảo">
            <a href={task.referenceUrl} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline break-all">
              {task.referenceUrl}
            </a>
          </Field>
        )}
        <Field label="Link bàn giao">
          <Input defaultValue={task.deliverableUrl ?? ""} onBlur={(e) => patch({ deliverableUrl: e.target.value || null })} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div>{children}</div>
    </div>
  );
}
