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
import { acceptRequestAction, createRequestAction, updateRequestStatusAction } from "./actions";
import { todayVnDayStr } from "@/lib/time";

interface RequestItem {
  id: string;
  code: string;
  receivedDate: string;
  requesterName: string;
  requesterSbuId: string | null;
  requestType: string;
  description: string;
  status: string;
  committedDate: string | null;
  desiredDate: string | null;
}

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

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  accepted: "Đã nhận",
  in_progress: "Đang xử lý",
  in_review: "Chờ duyệt",
  done: "Xong",
  rejected: "Từ chối",
  postponed: "Hoãn",
};
const STATUS_COLORS: Record<string, TagColor> = {
  new: "red",
  accepted: "blue",
  in_progress: "amber",
  in_review: "violet",
  done: "emerald",
  rejected: "gray",
  postponed: "slate",
};

export function RequestBoard({
  requests,
  sbus,
  canManage,
}: {
  requests: RequestItem[];
  sbus: { id: string; code: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

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
        defaultWidth: 110,
      },
      {
        field: "description",
        header: "Mô tả",
        kind: "text",
        accessor: (r) => r.description,
        defaultWidth: 280,
        groupable: false,
        cell: (r) => (
          <span className="line-clamp-1" title={r.description}>
            {r.description}
          </span>
        ),
      },
      {
        field: "committedDate",
        header: "Hạn cam kết",
        kind: "date",
        accessor: (r) => r.committedDate,
        cell: (r) => fmtDate(r.committedDate),
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
        defaultWidth: 120,
      },
      ...(canManage
        ? ([
            {
              field: "__actions",
              header: "Thao tác",
              kind: "text",
              accessor: () => "",
              sortable: false,
              groupable: false,
              defaultWidth: 160,
              cell: (r) => <RequestActions request={r} />,
            },
          ] as GridColumn<RequestItem>[])
        : []),
    ],
    [sbus, sbuLabel, canManage],
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Request mới
        </Button>
      </div>

      <DataGrid
        entity="requests"
        columns={columns}
        rows={requests}
        getRowId={(r) => r.id}
        initialView={{ sorts: [{ field: "receivedDate", direction: "desc" }] }}
        emptyText="Chưa có request."
      />

      <CreateRequestDialog
        open={open}
        onOpenChange={setOpen}
        sbus={sbus}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function RequestActions({ request: r }: { request: RequestItem }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [committedDate, setCommittedDate] = React.useState(r.desiredDate ?? "");

  if (r.status === "new") {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Input type="date" className="h-7 w-28 text-xs" value={committedDate} onChange={(e) => setCommittedDate(e.target.value)} />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await acceptRequestAction(r.id, committedDate);
              if (res.ok) router.refresh();
              else toast.error(res.error);
            })
          }
        >
          Nhận
        </Button>
      </div>
    );
  }
  if (["accepted", "in_progress", "in_review"].includes(r.status)) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          start(async () => {
            const res = await updateRequestStatusAction(r.id, "done");
            if (res.ok) router.refresh();
            else toast.error(res.error);
          });
        }}
      >
        Đánh dấu xong
      </Button>
    );
  }
  return null;
}

function CreateRequestDialog({
  open,
  onOpenChange,
  sbus,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sbus: { id: string; code: string; name: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    requesterName: "",
    requesterSbuId: "",
    requestType: "other",
    description: "",
    desiredDate: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request mới</DialogTitle>
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
          <Fld label="Mô tả">
            <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </Fld>
          <Fld label="Ngày mong muốn">
            <Input type="date" value={f.desiredDate} onChange={(e) => set("desiredDate", e.target.value)} />
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
                  desiredDate: f.desiredDate || null,
                });
                if (res.ok) {
                  toast.success("Đã gửi request.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Gửi request
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
