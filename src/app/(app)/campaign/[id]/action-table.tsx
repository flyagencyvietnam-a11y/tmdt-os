"use client";

import { Flag, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { BulkDeleteButton } from "@/components/data-grid/bulk-delete";
import { DataGrid, type GridColumn, type ViewConfig } from "@/components/data-grid";
import { LinksCell, sbuTagOptions } from "@/components/sbu-links";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { diffDaysStr, todayVnDayStr } from "@/lib/time";
import { bulkUpdateTasksAction, createTaskAction, deleteTasksAction, setTaskSbusAction, updateTaskAction } from "../../task/actions";
import { BulkAssign, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS } from "../../task/task-grid";
import { isTaskRecurring, ROW_TONE_CLASS, taskTone } from "../../task/task-style";

export interface ActionRow {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  workstream: string | null;
  isMilestone: boolean;
  sourceType: string;
  sbuIds: string[];
  collaborators: string[];
  checklistDone: number;
  checklistTotal: number;
}

type User = { id: string; fullName: string };

/**
 * ACTION PLAN của 1 campaign dạng bảng: mỗi dòng = 1 task (mã, workstream, người phụ trách, người hỗ trợ, ngày bắt đầu/hạn, trạng thái, ưu tiên, SBU…).
 * Sửa trực tiếp trên ô (kiểu Excel); gom nhóm theo workstream, lọc/sắp xếp như mọi bảng khác của hệ thống.
 */
export function ActionTable({
  campaignId,
  rows,
  users,
  sbus,
  currentUserId,
  canEdit,
  canAssignOthers,
}: {
  campaignId: string;
  rows: ActionRow[];
  users: User[];
  sbus: { id: string; code: string; name: string; kind: string }[];
  currentUserId: string;
  canEdit: boolean;
  canAssignOthers: boolean;
}) {
  const router = useRouter();
  const today = todayVnDayStr();
  const [pending, start] = React.useTransition();
  const sbuOpts = React.useMemo(() => sbuTagOptions(sbus), [sbus]);
  const userName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);
  const workstreams = React.useMemo(() => [...new Set(rows.map((r) => r.workstream).filter((x): x is string => !!x))], [rows]);

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
        } else patch = { status: v as never };
      } else if (field === "priority") patch = { priority: v as never };
      else if (field === "assigneeId") patch = { assigneeId: v || null };
      else if (field === "workstream") patch = { workstream: v || null };
      else if (field === "startDate") patch = { startDate: v || null };
      else if (field === "dueDate") patch = { dueDate: v || null };
      else return;
      const res = await updateTaskAction(rowId, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const columns: GridColumn<ActionRow>[] = React.useMemo(
    () => [
      { field: "code", header: "Mã", kind: "text", accessor: (r) => r.code, defaultWidth: 90, groupable: false },
      {
        field: "title",
        header: "Công việc",
        kind: "text",
        accessor: (r) => r.title,
        editable: canEdit,
        defaultWidth: 380,
        groupable: false,
        cell: (r) => (
          <span className="inline-flex max-w-full items-center gap-1.5">
            {r.isMilestone && <Flag className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Mốc" />}
            {isTaskRecurring(r) && <Repeat className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-label="Việc lặp lại" />}
            <Link href={`/task/${r.id}`} className="truncate font-medium hover:text-brand hover:underline" onClick={(e) => e.stopPropagation()} title={r.title}>
              {r.title}
            </Link>
          </span>
        ),
      },
      {
        field: "workstream",
        header: "Workstream",
        kind: "text",
        accessor: (r) => r.workstream ?? "",
        editable: canEdit,
        defaultWidth: 170,
        cell: (r) => r.workstream || <span className="text-muted-foreground">—</span>,
      },
      {
        field: "assigneeId",
        header: "Người phụ trách (PIC)",
        kind: "enum",
        accessor: (r) => r.assigneeId ?? "",
        cell: (r) => userName(r.assigneeId) || <span className="font-medium text-amber-700 dark:text-amber-400">Chưa giao</span>,
        enumOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        filterOptions: [{ value: "", label: "Chưa giao" }, ...users.map((u) => ({ value: u.id, label: u.fullName }))],
        editable: canEdit && canAssignOthers,
        editKind: "select",
        editOptions: [{ value: "", label: "— Chưa giao —" }, ...users.map((u) => ({ value: u.id, label: u.fullName }))],
        editValue: (r) => r.assigneeId ?? "",
        defaultWidth: 170,
      },
      {
        field: "collaborators",
        header: "Phối hợp",
        kind: "text",
        accessor: (r) => r.collaborators.join(", "),
        sortable: false,
        groupable: false,
        cell: (r) => (r.collaborators.length ? r.collaborators.join(", ") : <span className="text-muted-foreground">—</span>),
        defaultWidth: 130,
      },
      {
        field: "startDate",
        header: "Bắt đầu",
        kind: "date",
        accessor: (r) => r.startDate,
        cell: (r) => (r.startDate ? fmtDate(r.startDate) : <span className="text-muted-foreground">—</span>),
        editable: canEdit,
        editInputType: "date",
        editValue: (r) => r.startDate ?? "",
        defaultWidth: 110,
      },
      {
        field: "dueDate",
        header: "Hạn",
        kind: "date",
        accessor: (r) => r.dueDate,
        cell: (r) => (r.dueDate ? fmtDate(r.dueDate) : <span className="text-muted-foreground">—</span>),
        editable: canEdit,
        editInputType: "date",
        editValue: (r) => r.dueDate ?? "",
        defaultWidth: 110,
      },
      {
        field: "timing",
        header: "Tiến độ thời gian",
        kind: "number",
        accessor: (r) => (r.dueDate && r.status !== "done" && r.status !== "cancelled" ? diffDaysStr(today, r.dueDate) : null),
        sortable: true,
        groupable: false,
        defaultWidth: 130,
        cell: (r) => {
          if (r.status === "done") return <span className="text-emerald-700 dark:text-emerald-400">Đã xong</span>;
          if (r.status === "cancelled") return <span className="text-muted-foreground">Đã huỷ</span>;
          if (!r.dueDate) return <span className="text-muted-foreground">Chưa có hạn</span>;
          const d = diffDaysStr(today, r.dueDate);
          if (d < 0) return <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Trễ {-d} ngày</span>;
          if (d === 0) return <span className="font-medium text-brand">Hôm nay</span>;
          return <span className="text-muted-foreground">Còn {d} ngày</span>;
        },
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
        field: "checklist",
        header: "Checklist",
        kind: "text",
        accessor: (r) => (r.checklistTotal ? `${r.checklistDone}/${r.checklistTotal}` : ""),
        sortable: false,
        groupable: false,
        cell: (r) => (r.checklistTotal ? <span className="tabular-nums">{r.checklistDone}/{r.checklistTotal}</span> : <span className="text-muted-foreground">—</span>),
        defaultWidth: 90,
      },
      {
        field: "sbuIds",
        header: "SBU",
        kind: "enum",
        accessor: (r) => r.sbuIds,
        cell: (r) => (
          <LinksCell
            key={r.sbuIds.join(",")}
            value={r.sbuIds}
            options={sbuOpts}
            canEdit={canEdit}
            empty="Chưa gắn SBU"
            onSave={async (v) => {
              const res = await setTaskSbusAction(r.id, v);
              if (res.ok) router.refresh();
              else toast.error(res.error);
            }}
          />
        ),
        enumOptions: sbuOpts,
        filterOptions: sbuOpts,
        defaultWidth: 180,
      },
    ],
    [users, canEdit, canAssignOthers, userName, sbuOpts, router, today],
  );

  const initialView: ViewConfig = React.useMemo(
    () => ({ sorts: [{ field: "dueDate", direction: "asc" }], ...(workstreams.length > 1 ? { groupBy: [{ field: "workstream" }] } : {}) }),
    [workstreams.length],
  );

  // ---- thêm action ----
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ title: "", workstream: "", assigneeId: "", startDate: "", dueDate: "" });
  const canAdd = f.title.trim().length > 0;
  function addAction() {
    if (!canAdd) return;
    start(async () => {
      const res = await createTaskAction({
        title: f.title.trim(),
        type: "campaign_action",
        campaignId,
        workstream: f.workstream.trim() || null,
        assigneeId: f.assigneeId || (canAssignOthers ? null : currentUserId),
        startDate: f.startDate || null,
        dueDate: f.dueDate || null,
      });
      if (res.ok) {
        toast.success("Đã thêm action.");
        setF({ title: "", workstream: f.workstream, assigneeId: "", startDate: "", dueDate: "" });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="rounded-xl border bg-card p-3 shadow-xs">
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" /> Thêm action
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_9rem_9rem]">
                <Input autoFocus placeholder="Tên công việc…" value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addAction()} />
                <Input placeholder="Workstream (nhóm)" list="ws-list" value={f.workstream} onChange={(e) => setF((p) => ({ ...p, workstream: e.target.value }))} />
                <datalist id="ws-list">
                  {workstreams.map((w) => (
                    <option key={w} value={w} />
                  ))}
                </datalist>
                <SimpleSelect
                  value={f.assigneeId}
                  onValueChange={(v) => setF((p) => ({ ...p, assigneeId: v ?? "" }))}
                  placeholder="Người phụ trách"
                  options={[{ value: "", label: canAssignOthers ? "— Chưa giao —" : "Tôi" }, ...(canAssignOthers ? users : users.filter((u) => u.id === currentUserId)).map((u) => ({ value: u.id, label: u.fullName }))]}
                />
                <DateInput value={f.startDate} onChange={(v) => setF((p) => ({ ...p, startDate: v }))} placeholder="Bắt đầu" />
                <DateInput value={f.dueDate} onChange={(v) => setF((p) => ({ ...p, dueDate: v }))} placeholder="Hạn" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending || !canAdd} onClick={addAction}>
                  Thêm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <DataGrid
        entity="campaign_actions"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        initialView={initialView}
        rowClassName={(r) => ROW_TONE_CLASS[taskTone(r, today)]}
        onEditCell={canEdit ? onEditCell : undefined}
        bulkActions={
          canEdit
            ? (selected, clear) => (
                <>
                  {canAssignOthers && (
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
                  )}
                  <BulkDeleteButton
                    count={selected.length}
                    noun="task"
                    warning="Task con sẽ bị xoá theo. Việc lặp lại không bị xoá hẳn mà chuyển sang Lưu trữ."
                    onRun={async () => {
                      const res = await deleteTasksAction(selected.map((r) => r.id));
                      if (res.ok) {
                        toast.success(`Đã xoá ${res.deleted ?? 0} task.`);
                        clear();
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                  />
                </>
              )
            : undefined
        }
        emptyText="Campaign này chưa có action nào."
      />
    </div>
  );
}
