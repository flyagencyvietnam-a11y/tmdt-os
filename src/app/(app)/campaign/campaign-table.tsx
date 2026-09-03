"use client";

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
import { DataGrid, type GridColumn, type ViewConfig } from "@/components/data-grid";
import { cn } from "@/lib/utils";
import { fmtRatioX, fmtVnd } from "@/lib/format";
import {
  createCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
  upsertDailyMetricAction,
} from "./actions";

interface Row {
  id: string;
  internalCode: string;
  displayName: string;
  externalId: string | null;
  productCode: string | null;
  targetCpmql: number;
  channel: string;
  status: string;
  dailyBudget: number | null;
  ownerId: string;
  ownerName: string | null;
  startedOn: string;
  endedOn: string | null;
  spendDay: number | null;
  messagesDay: number | null;
  spend: number;
  leads: number;
  mql: number;
  sql: number;
  won: number;
  revenue: number;
  cpl: number | null;
  cpmql: number | null;
  cac: number | null;
  roas: number | null;
  crLeadWon: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  ON: "● ON",
  PAUSED: "❚❚ PAUSED",
  OFF: "○ OFF",
};
const CHANNELS = ["FB", "GOOGLE", "TIKTOK", "KHAC"];

function cpmqlTone(cpmql: number | null, target: number, mql: number, spend: number) {
  if (mql === 0) return spend >= target * 1.5 ? "text-crit font-medium" : "";
  if (cpmql == null) return "";
  if (cpmql <= target * 0.7) return "text-ok font-medium";
  if (cpmql <= target) return "";
  if (cpmql <= target * 1.5) return "text-warn font-medium";
  return "text-crit font-medium";
}

export function CampaignTable({
  rows,
  day,
  canManage,
  canEditCampaign,
  canEnterMetrics,
  products,
  owners,
}: {
  rows: Row[];
  day: string;
  canManage: boolean;
  canEditCampaign: boolean;
  canEnterMetrics: boolean;
  products: { id: string; code: string; name: string }[];
  owners: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      const v = raw.trim();
      setSaving(true);
      let res: Awaited<ReturnType<typeof updateCampaignAction>>;
      try {
        if (field === "status") {
          const next = v as "ON" | "OFF" | "PAUSED";
          let reason: string | undefined;
          if (next === "OFF") {
            reason = window.prompt("Lý do tắt campaign (bắt buộc):") ?? undefined;
            if (!reason) return;
          }
          res = await setCampaignStatusAction(rowId, next, reason);
        } else if (field === "displayName") {
          if (!v) {
            toast.error("Tên campaign không được để trống.");
            return;
          }
          res = await updateCampaignAction(rowId, { displayName: v });
        } else if (field === "dailyBudget") {
          res = await updateCampaignAction(rowId, {
            dailyBudget: v ? Number(v.replace(/[^\d.-]/g, "")) : null,
          });
        } else if (field === "channel") {
          res = await updateCampaignAction(rowId, {
            channel: v as "FB" | "GOOGLE" | "TIKTOK" | "KHAC",
          });
        } else if (field === "startedOn") {
          res = await updateCampaignAction(rowId, { startedOn: v });
        } else if (field === "externalId") {
          res = await updateCampaignAction(rowId, { externalId: v || null });
        } else if (field === "spendDay") {
          res = await upsertDailyMetricAction({
            campaignId: rowId,
            metricDate: day,
            spend: v ? Math.round(Number(v.replace(/[^\d.-]/g, ""))) : 0,
            messages: row.messagesDay ?? 0,
          });
        } else if (field === "messagesDay") {
          res = await upsertDailyMetricAction({
            campaignId: rowId,
            metricDate: day,
            spend: row.spendDay ?? 0,
            messages: v ? Math.round(Number(v.replace(/[^\d.-]/g, ""))) : 0,
          });
        } else {
          return;
        }
      } finally {
        setSaving(false);
      }
      if (res.ok) {
        toast.success("Đã lưu.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    },
    [rows, day, router],
  );

  const columns: GridColumn<Row>[] = React.useMemo(
    () => [
      {
        field: "status",
        header: "Trạng thái",
        kind: "enum",
        accessor: (r) => r.status,
        enumLabels: STATUS_LABELS,
        editable: canEditCampaign,
        editKind: "select",
        editOptions: ["ON", "PAUSED", "OFF"].map((s) => ({
          value: s,
          label: STATUS_LABELS[s],
        })),
        editValue: (r) => r.status,
        cell: (r) => (
          <span
            className={cn(
              "text-xs font-medium",
              r.status === "ON"
                ? "text-ok"
                : r.status === "PAUSED"
                  ? "text-warn"
                  : "text-muted-foreground",
            )}
          >
            {STATUS_LABELS[r.status]}
          </span>
        ),
        defaultWidth: 110,
      },
      {
        field: "displayName",
        header: "Tên",
        kind: "text",
        accessor: (r) => r.displayName,
        editable: canEditCampaign,
        cell: (r) => (
          <div>
            <div className="font-medium">{r.displayName}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {r.internalCode}
            </div>
          </div>
        ),
        defaultWidth: 240,
        groupable: false,
      },
      {
        field: "productCode",
        header: "SP",
        kind: "enum",
        accessor: (r) => r.productCode,
        cell: (r) => <Badge variant="secondary">{r.productCode}</Badge>,
        defaultWidth: 90,
      },
      {
        field: "dailyBudget",
        header: "NS/ngày",
        kind: "money",
        accessor: (r) => r.dailyBudget,
        editable: canEditCampaign,
        cell: (r) => (r.dailyBudget ? fmtVnd(r.dailyBudget) : "–"),
        align: "right",
      },
      {
        field: "spendDay",
        header: `Spend (${day})`,
        kind: "money",
        accessor: (r) => r.spendDay,
        editable: canEnterMetrics,
        cell: (r) =>
          r.spendDay == null ? (
            <span className="text-muted-foreground">–</span>
          ) : (
            fmtVnd(r.spendDay)
          ),
        align: "right",
        groupable: false,
        sortable: true,
      },
      {
        field: "messagesDay",
        header: `Mess (${day})`,
        kind: "number",
        accessor: (r) => r.messagesDay,
        editable: canEnterMetrics,
        cell: (r) =>
          r.messagesDay == null ? (
            <span className="text-muted-foreground">–</span>
          ) : (
            String(r.messagesDay)
          ),
        align: "right",
        groupable: false,
      },
      {
        field: "spend",
        header: "Spend 30n",
        kind: "money",
        accessor: (r) => r.spend,
        cell: (r) => fmtVnd(r.spend),
        align: "right",
      },
      {
        field: "leads",
        header: "Lead",
        kind: "number",
        accessor: (r) => r.leads,
        align: "right",
      },
      {
        field: "mql",
        header: "MQL",
        kind: "number",
        accessor: (r) => r.mql,
        align: "right",
      },
      {
        field: "sql",
        header: "SQL",
        kind: "number",
        accessor: (r) => r.sql,
        align: "right",
      },
      {
        field: "won",
        header: "HV",
        kind: "number",
        accessor: (r) => r.won,
        align: "right",
      },
      {
        field: "cpl",
        header: "CPL",
        kind: "money",
        accessor: (r) => r.cpl,
        cell: (r) => fmtVnd(r.cpl),
        align: "right",
      },
      {
        field: "cpmql",
        header: "CPMQL",
        kind: "money",
        accessor: (r) => r.cpmql,
        cell: (r) => (
          <span
            className={cpmqlTone(r.cpmql, r.targetCpmql, r.mql, r.spend)}
          >
            {fmtVnd(r.cpmql)}
          </span>
        ),
        align: "right",
      },
      {
        field: "cac",
        header: "CAC",
        kind: "money",
        accessor: (r) => r.cac,
        cell: (r) => fmtVnd(r.cac),
        align: "right",
      },
      {
        field: "roas",
        header: "ROAS",
        kind: "number",
        accessor: (r) => r.roas,
        cell: (r) => fmtRatioX(r.roas),
        align: "right",
      },
      {
        field: "channel",
        header: "Kênh",
        kind: "enum",
        accessor: (r) => r.channel,
        editable: canEditCampaign,
        editKind: "select",
        editOptions: CHANNELS.map((c) => ({ value: c, label: c })),
        editValue: (r) => r.channel,
        defaultWidth: 90,
      },
      {
        field: "startedOn",
        header: "Bắt đầu",
        kind: "date",
        accessor: (r) => r.startedOn,
        editable: canEditCampaign,
        groupable: false,
      },
      {
        field: "externalId",
        header: "ID Meta/Google",
        kind: "text",
        accessor: (r) => r.externalId,
        editable: canEditCampaign,
        cell: (r) => r.externalId ?? "–",
        groupable: false,
        defaultWidth: 150,
      },
      {
        field: "ownerName",
        header: "Owner",
        kind: "text",
        accessor: (r) => r.ownerName ?? "—",
        defaultWidth: 120,
      },
    ],
    [day, canEditCampaign, canEnterMetrics],
  );

  const initialView: ViewConfig = {
    columns: [
      { field: "spend", aggregate: "sum" },
      { field: "leads", aggregate: "sum" },
      { field: "mql", aggregate: "sum" },
      { field: "won", aggregate: "sum" },
      { field: "startedOn", visible: false },
      { field: "externalId", visible: false },
    ],
    sorts: [{ field: "spendDay", direction: "desc" }],
    rowHeight: "medium",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">Ngày nhập số liệu</label>
        <Input
          type="date"
          value={day}
          className="h-8 w-40"
          onChange={(e) =>
            e.target.value && router.push(`/campaign?date=${e.target.value}`)
          }
        />
        {(canEditCampaign || canEnterMetrics) && (
          <span className="text-xs text-muted-foreground">
            {saving ? "Đang lưu…" : "Nhấp đôi ô để sửa"}
          </span>
        )}
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            + Campaign
          </Button>
        )}
      </div>

      <DataGrid
        entity="CAMPAIGNS"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        initialView={initialView}
        onEditCell={canEditCampaign || canEnterMetrics ? onEditCell : undefined}
        emptyText="Chưa có campaign."
      />

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        products={products}
        owners={owners}
        onDone={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateCampaignDialog({
  open,
  onOpenChange,
  products,
  owners,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: { id: string; code: string; name: string }[];
  owners: { id: string; fullName: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    displayName: "",
    productId: products[0]?.id ?? "",
    channel: "FB",
    objective: "MESSAGE",
    ownerId: owners[0]?.id ?? "",
    dailyBudget: "",
    externalId: "",
    startedOn: new Date().toISOString().slice(0, 10),
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Campaign mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Tên hiển thị">
            <Input value={f.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Sản phẩm">
              <SimpleSelect
                value={f.productId}
                onValueChange={(v) => set("productId", v)}
                options={products.map((p) => ({ value: p.id, label: p.code }))}
              />
            </F>
            <F label="Kênh">
              <SimpleSelect
                value={f.channel}
                onValueChange={(v) => set("channel", v)}
                options={CHANNELS.map((c) => ({ value: c, label: c }))}
              />
            </F>
            <F label="Mục tiêu">
              <SimpleSelect
                value={f.objective}
                onValueChange={(v) => set("objective", v)}
                options={["MESSAGE", "LEADFORM", "TRAFFIC", "KHAC"].map((c) => ({
                  value: c,
                  label: c,
                }))}
              />
            </F>
            <F label="Người phụ trách">
              <SimpleSelect
                value={f.ownerId}
                onValueChange={(v) => set("ownerId", v)}
                options={owners.map((o) => ({ value: o.id, label: o.fullName }))}
              />
            </F>
            <F label="Ngân sách/ngày (đ)">
              <Input
                type="number"
                value={f.dailyBudget}
                onChange={(e) => set("dailyBudget", e.target.value)}
              />
            </F>
            <F label="Ngày bắt đầu">
              <Input
                type="date"
                value={f.startedOn}
                onChange={(e) => set("startedOn", e.target.value)}
              />
            </F>
          </div>
          <F label="ID Meta / Google (tùy chọn)">
            <Input value={f.externalId} onChange={(e) => set("externalId", e.target.value)} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.displayName.trim()}
            onClick={() =>
              start(async () => {
                const res = await createCampaignAction({
                  displayName: f.displayName,
                  productId: f.productId,
                  channel: f.channel as never,
                  objective: f.objective as never,
                  ownerId: f.ownerId,
                  dailyBudget: f.dailyBudget ? Number(f.dailyBudget) : null,
                  externalId: f.externalId || null,
                  startedOn: f.startedOn,
                });
                if (res.ok) onDone();
                else toast.error(res.error);
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
