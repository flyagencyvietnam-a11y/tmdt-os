"use client";

import { Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DataGrid, type GridColumn, type SavedViewLike, type ViewConfig } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";
import { fmtDate } from "@/lib/format";
import { todayVnDayStr } from "@/lib/time";
import { isTaskRecurring, ROW_TONE_CLASS, taskTone } from "./task-style";
import { bulkUpdateTasksAction, updateTaskAction } from "./actions";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/simple-select";

export interface TaskGridRow {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  campaignId: string | null;
  dueDate: string | null;
  channel: string | null;
  sourceType: string;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "Cần làm",
  in_progress: "Đang làm",
  in_review: "Chờ duyệt",
  blocked: "Bị chặn",
  done: "Xong",
  cancelled: "Huỷ",
};
const STATUS_COLORS: Record<string, TagColor> = {
  todo: "slate",
  in_progress: "blue",
  in_review: "amber",
  blocked: "red",
  done: "emerald",
  cancelled: "gray",
};
const PRIORITY_LABELS: Record<string, string> = { urgent: "Gấp", high: "Cao", medium: "Trung bình", low: "Thấp" };
const PRIORITY_COLORS: Record<string, TagColor> = { urgent: "red", high: "orange", medium: "sky", low: "slate" };
const TYPE_LABELS: Record<string, string> = {
  campaign_action: "Action plan",
  content: "Content",
  media: "Quay chụp",
  request: "Request",
  monitoring: "Giám sát",
  ads: "Ads",
  report: "Báo cáo",
  meeting: "Họp",
  general: "Chung",
};
const SOURCE_LABELS: Record<string, string> = {
  manual: "Thủ công",
  import: "Import",
  recurring: "Việc lặp",
  content_item: "Content",
  media_shoot: "Quay chụp",
  request: "Request",
  campaign_template: "Mẫu campaign",
};

export function TaskGrid({
  rows,
  users,
  campaigns,
  canEdit,
  canAssignOthers,
}: {
  rows: TaskGridRow[];
  users: { id: string; fullName: string }[];
  campaigns: { id: string; code: string; name: string }[];
  canEdit: boolean;
  canAssignOthers: boolean;
}) {
  const router = useRouter();
  const [savedViews, setSavedViews] = React.useState<SavedViewLike[]>([]);
  const [pending, start] = React.useTransition();
  const today = todayVnDayStr();

  React.useEffect(() => {
    fetch("/api/views?entity=tasks")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.views)) setSavedViews(d.views);
      })
      .catch(() => {});
  }, []);

  const userName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);
  const campaignLabel = React.useCallback(
    (id: string | null) => {
      const c = campaigns.find((x) => x.id === id);
      return c ? `${c.code} — ${c.name}` : "";
    },
    [campaigns],
  );

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      const v = raw.trim();
      let patch: Parameters<typeof updateTaskAction>[1] | null = null;
      if (field === "title") {
        if (!v) return toast.error("Tiêu đề không được để trống.");
        patch = { title: v };
      } else if (field === "status") {
        if (v === "blocked") {
          const reason = window.prompt("Lý do bị chặn:") ?? "";
          if (!reason) return;
          patch = { status: "blocked", blockedReason: reason };
        } else {
          patch = { status: v as never };
        }
      } else if (field === "priority") {
        patch = { priority: v as never };
      } else if (field === "dueDate") {
        patch = { dueDate: v || null };
      } else if (field === "assigneeId") {
        patch = { assigneeId: v || null };
      } else if (field === "channel") {
        patch = { channel: v || null };
      } else if (field === "campaignId") {
        patch = { campaignId: v || null };
      } else {
        return;
      }
      const res = await updateTaskAction(rowId, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const columns: GridColumn<TaskGridRow>[] = React.useMemo(
    () => [
      {
        field: "code",
        header: "Mã",
        kind: "text",
        accessor: (r) => r.code,
        defaultWidth: 100,
        groupable: false,
        sortable: true,
      },
      {
        field: "title",
        header: "Tiêu đề",
        kind: "text",
        accessor: (r) => r.title,
        editable: canEdit,
        defaultWidth: 360,
        groupable: false,
        cell: (r) => (
          <span className="inline-flex max-w-full items-center gap-1.5">
            {isTaskRecurring(r) && <Repeat className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-label="Việc lặp lại" />}
            <Link href={`/task/${r.id}`} className="truncate font-medium hover:text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
              {r.title}
            </Link>
          </span>
        ),
      },
      {
        field: "status",
        header: "Trạng thái",
        kind: "enum",
        accessor: (r) => r.status,
        enumLabels: STATUS_LABELS,
        enumColors: STATUS_COLORS,
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.status,
        defaultWidth: 120,
      },
      {
        field: "priority",
        header: "Ưu tiên",
        kind: "enum",
        accessor: (r) => r.priority,
        enumLabels: PRIORITY_LABELS,
        enumColors: PRIORITY_COLORS,
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.priority,
        defaultWidth: 110,
      },
      {
        field: "assigneeId",
        header: "Người phụ trách",
        kind: "enum",
        accessor: (r) => r.assigneeId ?? "",
        cell: (r) => userName(r.assigneeId) || <span className="text-muted-foreground">—</span>,
        enumOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        filterOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        editable: canEdit && canAssignOthers,
        editKind: "select",
        editOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        editValue: (r) => r.assigneeId ?? "",
        defaultWidth: 160,
      },
      {
        field: "dueDate",
        header: "Hạn",
        kind: "date",
        accessor: (r) => r.dueDate,
        cell: (r) => fmtDate(r.dueDate),
        editable: canEdit,
        editInputType: "date",
        editValue: (r) => r.dueDate ?? "",
        defaultWidth: 110,
      },
      {
        field: "type",
        header: "Loại",
        kind: "enum",
        accessor: (r) => r.type,
        enumLabels: TYPE_LABELS,
        defaultWidth: 130,
      },
      {
        field: "campaignId",
        header: "Campaign",
        kind: "enum",
        accessor: (r) => r.campaignId ?? "",
        cell: (r) => campaignLabel(r.campaignId) || <span className="text-muted-foreground">—</span>,
        enumOptions: campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        filterOptions: campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        defaultWidth: 180,
      },
      {
        field: "channel",
        header: "Kênh",
        kind: "text",
        accessor: (r) => r.channel ?? "",
        editable: canEdit,
        defaultWidth: 120,
      },
      {
        field: "sourceType",
        header: "Nguồn",
        kind: "enum",
        accessor: (r) => r.sourceType,
        enumLabels: SOURCE_LABELS,
        defaultWidth: 110,
      },
    ],
    [users, campaigns, canEdit, canAssignOthers, userName, campaignLabel],
  );

  const initialView: ViewConfig = {
    sorts: [{ field: "dueDate", direction: "asc" }],
  };

  return (
    <DataGrid
      entity="tasks"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      initialView={initialView}
      rowClassName={(r) => ROW_TONE_CLASS[taskTone(r, today)]}
      savedViews={savedViews}
      onEditCell={canEdit ? onEditCell : undefined}
      onSaveView={async (name, config) => {
        const res = await fetch("/api/views", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entity: "tasks", name, config, visibility: "private" }),
        });
        if (res.ok) {
          const d = await res.json();
          setSavedViews((s) => [...s, d.view]);
          toast.success("Đã lưu view.");
        } else toast.error("Không lưu được view.");
      }}
      onDeleteView={async (id) => {
        await fetch(`/api/views/${id}`, { method: "DELETE" });
        setSavedViews((s) => s.filter((v) => v.id !== id));
      }}
      bulkActions={
        canAssignOthers
          ? (selected, clear) => (
              <BulkAssign
                ids={selected.map((r) => r.id)}
                users={users}
                pending={pending}
                onRun={(assigneeId) =>
                  start(async () => {
                    const res = await bulkUpdateTasksAction(
                      selected.map((r) => r.id),
                      { assigneeId },
                    );
                    if (res.ok) {
                      toast.success(`Đã giao ${selected.length} task.`);
                      clear();
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              />
            )
          : undefined
      }
      emptyText="Không có task nào khớp bộ lọc."
    />
  );
}

function BulkAssign({
  ids,
  users,
  pending,
  onRun,
}: {
  ids: string[];
  users: { id: string; fullName: string }[];
  pending: boolean;
  onRun: (assigneeId: string) => void;
}) {
  const [value, setValue] = React.useState("");
  return (
    <div className="flex items-center gap-1">
      <SimpleSelect
        value={value}
        onValueChange={(v) => setValue(v ?? "")}
        options={users.map((u) => ({ value: u.id, label: u.fullName }))}
        placeholder="Giao cho..."
      />
      <Button size="sm" disabled={pending || !value} onClick={() => onRun(value)}>
        Giao {ids.length} task
      </Button>
    </div>
  );
}
