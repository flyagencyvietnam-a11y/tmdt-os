"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";
import { fmtDate } from "@/lib/format";
import { ROW_TONE_CLASS } from "../task/task-style";
import { DateInput } from "@/components/ui/date-input";
import { assignRequestExecutorAction, createRequestAction, updateRequestAction } from "./actions";
import { todayVnDayStr } from "@/lib/time";

interface RequestItem {
  id: string;
  code: string;
  receivedDate: string;
  requesterName: string;
  requesterSbuId: string | null;
  /** Người thực hiện = người phụ trách task đi kèm request. */
  executorId: string | null;
  requestType: string;
  description: string;
  status: string;
  /** Hạn hoàn thành (cũng là hạn của task đi kèm). */
  committedDate: string | null;
}

// Mặc định: hạn gần nhất lên trước (ô trống xuống cuối), cùng hạn thì request mới hơn trước.
const INITIAL_VIEW = { sorts: [{ field: "committedDate", direction: "asc" as const }, { field: "receivedDate", direction: "desc" as const }] };

const TYPE_LABEL: Record<string, string> = {
  design: "Thiết kế",
  ads: "Ads",
  content: "Content",
  media: "Quay chụp",
  posm: "POSM",
  event: "Sự kiện",
  consulting: "Tư vấn",
  other: "Khác",
};

// Request chỉ là sổ ghi nhận task được order — không có bước duyệt (SPEC Phụ lục D mục 25).
const STATUS_LABEL: Record<string, string> = {
  in_progress: "Đang làm",
  done: "Xong",
  postponed: "Hoãn",
  rejected: "Huỷ",
};
const STATUS_COLORS: Record<string, TagColor> = {
  in_progress: "amber",
  done: "emerald",
  postponed: "slate",
  rejected: "gray",
};
const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));
type EditPatch = Parameters<typeof updateRequestAction>[1];

export function RequestBoard({
  requests,
  sbus,
  users,
  currentUserId,
  canManage,
}: {
  requests: RequestItem[];
  sbus: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string }[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const today = todayVnDayStr();
  const executorName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);
  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      const v = raw.trim();
      let res: Awaited<ReturnType<typeof updateRequestAction>>;
      if (field === "executorId") res = await assignRequestExecutorAction(rowId, v);
      else if (field === "status") res = await updateRequestAction(rowId, { status: v as NonNullable<EditPatch["status"]> });
      else if (field === "committedDate") res = await updateRequestAction(rowId, { committedDate: v || null });
      else if (field === "requestType") res = await updateRequestAction(rowId, { requestType: v as NonNullable<EditPatch["requestType"]> });
      else if (field === "description") res = await updateRequestAction(rowId, { description: v });
      else return;
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const sbuLabel = React.useCallback(
    (id: string | null) => {
      const s = sbus.find((x) => x.id === id);
      return s ? s.code : "";
    },
    [sbus],
  );

  const columns: GridColumn<RequestItem>[] = React.useMemo(
    () => [
      { field: "code", header: "Mã", kind: "text", accessor: (r) => r.code, defaultWidth: 100, groupable: false },
      { field: "receivedDate", header: "Ngày nhận", kind: "date", accessor: (r) => r.receivedDate, cell: (r) => fmtDate(r.receivedDate), defaultWidth: 105, groupable: false },
      { field: "requesterName", header: "Người yêu cầu", kind: "text", accessor: (r) => r.requesterName, defaultWidth: 160, groupable: false },
      {
        field: "requesterSbuId",
        header: "Trung tâm",
        kind: "enum",
        accessor: (r) => r.requesterSbuId ?? "",
        cell: (r) => sbuLabel(r.requesterSbuId) || <span className="text-muted-foreground">—</span>,
        enumOptions: sbus.map((s) => ({ value: s.id, label: s.code })),
        filterOptions: sbus.map((s) => ({ value: s.id, label: s.code })),
        defaultWidth: 100,
      },
      {
        field: "requestType",
        header: "Loại",
        kind: "enum",
        accessor: (r) => r.requestType,
        enumLabels: TYPE_LABEL,
        editable: canManage,
        editKind: "select",
        editOptions: TYPE_OPTIONS,
        editValue: (r) => r.requestType,
        defaultWidth: 110,
      },
      {
        field: "description",
        header: "Nội dung",
        kind: "text",
        accessor: (r) => r.description,
        defaultWidth: 280,
        groupable: false,
        editable: canManage,
        editValue: (r) => r.description,
        cell: (r) => (
          <span className="line-clamp-1" title={r.description}>
            {r.description}
          </span>
        ),
      },
      {
        field: "executorId",
        header: "Người thực hiện",
        kind: "enum",
        accessor: (r) => r.executorId ?? "",
        cell: (r) => executorName(r.executorId) || <span className="text-muted-foreground">Chưa giao</span>,
        enumOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        filterOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        editable: canManage,
        editKind: "select",
        editOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        editValue: (r) => r.executorId ?? "",
        defaultWidth: 150,
      },
      {
        field: "committedDate",
        header: "Hạn",
        kind: "date",
        accessor: (r) => r.committedDate,
        cell: (r) => fmtDate(r.committedDate),
        editable: canManage,
        editInputType: "date",
        editValue: (r) => r.committedDate ?? "",
        defaultWidth: 110,
        groupable: false,
      },
      {
        field: "status",
        header: "Trạng thái",
        kind: "enum",
        accessor: (r) => r.status,
        enumLabels: STATUS_LABEL,
        enumColors: STATUS_COLORS,
        editable: canManage,
        editKind: "select",
        editOptions: STATUS_OPTIONS,
        editValue: (r) => r.status,
        defaultWidth: 120,
      },
    ],
    [sbus, sbuLabel, canManage, users, executorName],
  );

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ghi nhận request
          </Button>
        </div>
      )}

      <DataGrid
        entity="requests"
        columns={columns}
        rows={requests}
        getRowId={(r) => r.id}
        initialView={INITIAL_VIEW}
        onEditCell={canManage ? onEditCell : undefined}
        rowClassName={(r) => (r.committedDate && r.committedDate < today && !["done", "rejected"].includes(r.status) ? ROW_TONE_CLASS.overdue : undefined)}
        emptyText="Chưa có request."
      />

      <CreateRequestDialog
        open={open}
        onOpenChange={setOpen}
        sbus={sbus}
        users={users}
        currentUserId={currentUserId}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateRequestDialog({
  open,
  onOpenChange,
  sbus,
  users,
  currentUserId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sbus: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string }[];
  currentUserId: string;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    requesterName: "",
    requesterSbuId: "",
    requestType: "other",
    description: "",
    executorId: currentUserId,
    committedDate: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ghi nhận request</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Fld label="Người yêu cầu">
            <Input value={f.requesterName} onChange={(e) => set("requesterName", e.target.value)} />
          </Fld>
          <Fld label="Trung tâm">
            <SimpleSelect
              value={f.requesterSbuId}
              onValueChange={(v) => set("requesterSbuId", v ?? "")}
              options={[{ value: "", label: "— Không thuộc trung tâm —" }, ...sbus.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))]}
            />
          </Fld>
          <Fld label="Loại yêu cầu">
            <SimpleSelect value={f.requestType} onValueChange={(v) => v && set("requestType", v)} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          </Fld>
          <Fld label="Nội dung">
            <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </Fld>
          <Fld label="Người thực hiện">
            <SimpleSelect value={f.executorId} onValueChange={(v) => v && set("executorId", v)} options={users.map((u) => ({ value: u.id, label: u.fullName }))} />
          </Fld>
          <Fld label="Hạn (tuỳ chọn)">
            <DateInput value={f.committedDate} onChange={(v) => set("committedDate", v)} />
          </Fld>
          <p className="text-xs text-muted-foreground">
            Không nhập thông tin cá nhân học viên/phụ huynh.
          </p>
          <Button
            className="w-full"
            disabled={pending || !f.requesterName.trim() || !f.description.trim()}
            onClick={() =>
              start(async () => {
                const res = await createRequestAction({
                  receivedDate: todayVnDayStr(),
                  requesterName: f.requesterName,
                  requesterSbuId: f.requesterSbuId || null,
                  requestType: f.requestType as never,
                  description: f.description,
                  executorId: f.executorId || null,
                  committedDate: f.committedDate || null,
                });
                if (res.ok) {
                  toast.success("Đã ghi nhận request và tạo task.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Ghi nhận request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
