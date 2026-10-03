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
import { DataGrid, type GridColumn } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";
import { fmtDate } from "@/lib/format";
import { createCampaignAction, updateCampaignAction } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  brand_theme: "Brand Theme",
  product_gtm: "GTM sản phẩm",
  business_program: "Chương trình kinh doanh",
  rebrand: "Rebrand",
  data_program: "Dữ liệu",
  internal_program: "Nội bộ",
  other: "Khác",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  preparing: "Đang chuẩn bị",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn tất",
  cancelled: "Huỷ",
  needs_confirmation: "Cần xác nhận",
};
const STATUS_COLORS: Record<string, TagColor> = {
  planned: "slate",
  preparing: "amber",
  running: "blue",
  paused: "orange",
  done: "emerald",
  cancelled: "gray",
  needs_confirmation: "red",
};

interface CampaignRow {
  id: string;
  code: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  taskTotal: number;
  taskDone: number;
  progressPct: number | null;
  overdueCount: number;
}

export function CampaignList({ campaigns, canEdit }: { campaigns: CampaignRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ code: "", name: "", type: "other", startDate: "", endDate: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      if (field !== "status" && field !== "type") return;
      const res = await updateCampaignAction({ id: rowId, [field]: raw } as never);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const columns: GridColumn<CampaignRow>[] = React.useMemo(
    () => [
      { field: "code", header: "Mã", kind: "text", accessor: (r) => r.code, defaultWidth: 120, groupable: false },
      {
        field: "name",
        header: "Tên",
        kind: "text",
        accessor: (r) => r.name,
        defaultWidth: 260,
        groupable: false,
        cell: (r) => (
          <a href={`/campaign/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.name}
          </a>
        ),
      },
      {
        field: "type",
        header: "Loại",
        kind: "enum",
        accessor: (r) => r.type,
        enumLabels: TYPE_LABEL,
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.type,
        defaultWidth: 160,
      },
      {
        field: "status",
        header: "Trạng thái",
        kind: "enum",
        accessor: (r) => r.status,
        enumLabels: STATUS_LABEL,
        enumColors: STATUS_COLORS,
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.status,
        defaultWidth: 140,
      },
      {
        field: "startDate",
        header: "Bắt đầu",
        kind: "date",
        accessor: (r) => r.startDate,
        cell: (r) => fmtDate(r.startDate),
        defaultWidth: 100,
        groupable: false,
      },
      {
        field: "endDate",
        header: "Kết thúc",
        kind: "date",
        accessor: (r) => r.endDate,
        cell: (r) => fmtDate(r.endDate),
        defaultWidth: 100,
        groupable: false,
      },
      {
        field: "progressPct",
        header: "Tiến độ",
        kind: "number",
        accessor: (r) => r.progressPct,
        cell: (r) => (r.progressPct === null ? <span className="text-muted-foreground">—</span> : `${r.taskDone}/${r.taskTotal} (${r.progressPct}%)`),
        align: "right",
        groupable: false,
      },
      {
        field: "overdueCount",
        header: "Trễ hạn",
        kind: "number",
        accessor: (r) => r.overdueCount,
        cell: (r) => (r.overdueCount > 0 ? <span className="font-medium text-crit">{r.overdueCount}</span> : "0"),
        align: "right",
        groupable: false,
      },
    ],
    [canEdit],
  );

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Campaign mới
          </Button>
        </div>
      )}

      <DataGrid
        entity="campaigns"
        columns={columns}
        rows={campaigns}
        getRowId={(r) => r.id}
        initialView={{ sorts: [{ field: "startDate", direction: "desc" }] }}
        onEditCell={canEdit ? onEditCell : undefined}
        emptyText="Chưa có campaign. Nạp qua template T1 hoặc tạo thủ công."
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campaign mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Fld label="Mã (vd BT-2026-11)">
              <Input value={f.code} onChange={(e) => set("code", e.target.value)} />
            </Fld>
            <Fld label="Tên">
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Fld>
            <Fld label="Loại">
              <SimpleSelect
                value={f.type}
                onValueChange={(v) => v && set("type", v)}
                options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Fld>
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Bắt đầu">
                <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Fld>
              <Fld label="Kết thúc">
                <Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </Fld>
            </div>
            <Button
              className="w-full"
              disabled={pending || !f.code.trim() || !f.name.trim() || !f.startDate || !f.endDate}
              onClick={() =>
                start(async () => {
                  const res = await createCampaignAction(f as never);
                  if (res.ok) {
                    toast.success("Đã tạo campaign.");
                    setOpen(false);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Tạo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
