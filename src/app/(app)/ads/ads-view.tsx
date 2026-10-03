"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { deleteAdsMonthlyAction, upsertAdsMonthlyAction } from "./actions";

interface AdsRow {
  id: string;
  period: string;
  sbuId: string;
  product: string | null;
  channel: string | null;
  objective: string | null;
  centerBudget: string | null;
  hoBudget: string | null;
  actualSpend: string | null;
  actualLeads: string | null;
  cpl: number | null;
  misaOrderCode: string | null;
  status: string;
  reportUrl: string | null;
}

const STATUS_LABELS: Record<string, string> = { planned: "Dự kiến", running: "Đang chạy", done: "Xong", cancelled: "Huỷ" };

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  return Number(v).toLocaleString("vi-VN");
}

export function AdsMonthlyView({ rows, sbus, currentPeriod }: { rows: AdsRow[]; sbus: { id: string; code: string }[]; currentPeriod: string }) {
  const router = useRouter();
  const [periodFilter, setPeriodFilter] = React.useState(currentPeriod);
  const [editing, setEditing] = React.useState<AdsRow | "new" | null>(null);
  const [pending, start] = React.useTransition();

  const sbuCode = (id: string) => sbus.find((s) => s.id === id)?.code ?? "";
  const periods = [...new Set(rows.map((r) => r.period))].sort().reverse();
  const visible = rows.filter((r) => r.period === periodFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect value={periodFilter} onValueChange={(v) => v && setPeriodFilter(v)} options={[periodFilter, ...periods.filter((p) => p !== periodFilter)].map((p) => ({ value: p, label: p }))} />
        <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" /> Thêm dòng
        </Button>
      </div>

      <div className="overflow-auto rounded-md border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">SBU</th>
              <th className="px-2 py-2">Sản phẩm</th>
              <th className="px-2 py-2">Kênh</th>
              <th className="px-2 py-2 text-right">NS Trung tâm</th>
              <th className="px-2 py-2 text-right">NS Hệ thống (HO)</th>
              <th className="px-2 py-2 text-right">Chi tiêu thực tế</th>
              <th className="px-2 py-2 text-right">Lead thực tế</th>
              <th className="px-2 py-2 text-right">CPL</th>
              <th className="px-2 py-2">Mã MISA</th>
              <th className="px-2 py-2">Trạng thái</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="px-2 py-1.5">{sbuCode(r.sbuId)}</td>
                <td className="px-2 py-1.5">{r.product}</td>
                <td className="px-2 py-1.5">{r.channel}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.centerBudget)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.hoBudget)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(r.actualSpend)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.actualLeads ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.cpl != null ? r.cpl.toLocaleString("vi-VN") : "—"}</td>
                <td className="px-2 py-1.5">{r.misaOrderCode}</td>
                <td className="px-2 py-1.5">{STATUS_LABELS[r.status] ?? r.status}</td>
                <td className="px-2 py-1.5">
                  <button className="text-xs hover:underline" onClick={() => setEditing(r)}>
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-8 text-center text-muted-foreground">
                  Chưa có dữ liệu kỳ {periodFilter}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        row={editing}
        sbus={sbus}
        defaultPeriod={periodFilter}
        onOpenChange={(o) => !o && setEditing(null)}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
        onDelete={(id) =>
          start(async () => {
            const res = await deleteAdsMonthlyAction(id);
            if (res.ok) {
              toast.success("Đã xoá.");
              setEditing(null);
              router.refresh();
            } else toast.error(res.error);
          })
        }
        deletePending={pending}
      />
    </div>
  );
}

function EditDialog({
  row,
  sbus,
  defaultPeriod,
  onOpenChange,
  onDone,
  onDelete,
  deletePending,
}: {
  row: AdsRow | "new" | null;
  sbus: { id: string; code: string }[];
  defaultPeriod: string;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  const isNew = row === "new";
  const r = isNew ? null : row;
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    period: r?.period ?? defaultPeriod,
    sbuId: r?.sbuId ?? sbus[0]?.id ?? "",
    product: r?.product ?? "",
    channel: r?.channel ?? "",
    objective: r?.objective ?? "",
    centerBudget: r?.centerBudget ?? "",
    hoBudget: r?.hoBudget ?? "",
    actualSpend: r?.actualSpend ?? "",
    actualLeads: r?.actualLeads ?? "",
    misaOrderCode: r?.misaOrderCode ?? "",
    status: r?.status ?? "planned",
    reportUrl: r?.reportUrl ?? "",
  });

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Thêm dòng Ads" : `Sửa — ${r?.product ?? ""}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <F label="Kỳ (YYYY-MM)">
              <Input value={f.period} onChange={(e) => setF((p) => ({ ...p, period: e.target.value }))} placeholder="2026-10" />
            </F>
            <F label="SBU">
              <SimpleSelect value={f.sbuId} onValueChange={(v) => v && setF((p) => ({ ...p, sbuId: v }))} options={sbus.map((s) => ({ value: s.id, label: s.code }))} />
            </F>
            <F label="Sản phẩm">
              <Input value={f.product} onChange={(e) => setF((p) => ({ ...p, product: e.target.value }))} />
            </F>
            <F label="Kênh">
              <Input value={f.channel} onChange={(e) => setF((p) => ({ ...p, channel: e.target.value }))} />
            </F>
            <F label="Ngân sách Trung tâm">
              <Input type="number" value={f.centerBudget} onChange={(e) => setF((p) => ({ ...p, centerBudget: e.target.value }))} />
            </F>
            <F label="Ngân sách Hệ thống (HO)">
              <Input type="number" value={f.hoBudget} onChange={(e) => setF((p) => ({ ...p, hoBudget: e.target.value }))} />
            </F>
            <F label="Chi tiêu thực tế">
              <Input type="number" value={f.actualSpend} onChange={(e) => setF((p) => ({ ...p, actualSpend: e.target.value }))} />
            </F>
            <F label="Lead thực tế">
              <Input type="number" value={f.actualLeads} onChange={(e) => setF((p) => ({ ...p, actualLeads: e.target.value }))} />
            </F>
            <F label="Mã order MISA">
              <Input value={f.misaOrderCode} onChange={(e) => setF((p) => ({ ...p, misaOrderCode: e.target.value }))} />
            </F>
            <F label="Trạng thái">
              <SimpleSelect value={f.status} onValueChange={(v) => v && setF((p) => ({ ...p, status: v }))} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
            </F>
          </div>
          <F label="Link báo cáo">
            <Input value={f.reportUrl} onChange={(e) => setF((p) => ({ ...p, reportUrl: e.target.value }))} />
          </F>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={pending || !f.period.trim() || !f.sbuId}
              onClick={() =>
                start(async () => {
                  const res = await upsertAdsMonthlyAction({
                    id: isNew ? undefined : r!.id,
                    period: f.period.trim(),
                    sbuId: f.sbuId,
                    product: f.product || null,
                    channel: f.channel || null,
                    objective: f.objective || null,
                    centerBudget: f.centerBudget || null,
                    hoBudget: f.hoBudget || null,
                    actualSpend: f.actualSpend || null,
                    actualLeads: f.actualLeads || null,
                    misaOrderCode: f.misaOrderCode || null,
                    status: f.status as never,
                    reportUrl: f.reportUrl || null,
                  });
                  if (res.ok) {
                    toast.success("Đã lưu.");
                    onDone();
                  } else toast.error(res.error);
                })
              }
            >
              Lưu
            </Button>
            {!isNew && r && (
              <Button variant="destructive" size="icon" disabled={deletePending} onClick={() => onDelete(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
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
