"use client";

import { Plus, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { createMonitoringItemAction, markMonitoringRefreshedAction, runMonitoringAlertsNowAction } from "./actions";

type Alert = "overdue" | "due_soon" | "ok" | "no_data";
interface MonitoringRow {
  id: string;
  sbuId: string;
  kind: string;
  title: string;
  currentStateNote: string | null;
  lastUpdatedDate: string | null;
  cycleMonths: number;
  photoUrl: string | null;
  alert: Alert;
  nextDue: string | null;
}

const ALERT_LABELS: Record<Alert, string> = { overdue: "Quá hạn", due_soon: "Sắp đến hạn", ok: "Còn hạn", no_data: "Chưa có dữ liệu" };
const ALERT_COLORS_FIXED: Record<Alert, TagColor> = { overdue: "red", due_soon: "amber", ok: "emerald", no_data: "gray" };
const KIND_LABELS: Record<string, string> = {
  posm: "POSM",
  signage: "Bảng hiệu",
  ooh: "OOH",
  google_maps: "Google Maps",
  vmp_booth: "Quầy tư vấn VMP",
  exam_room: "Phòng thi",
  other: "Khác",
};

export function MonitoringView({ items, sbus, canManage }: { items: MonitoringRow[]; sbus: { id: string; code: string }[]; canManage: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [refreshFor, setRefreshFor] = React.useState<MonitoringRow | null>(null);
  const [pending, start] = React.useTransition();

  const sbuCode = React.useCallback((id: string) => sbus.find((s) => s.id === id)?.code ?? "", [sbus]);

  const columns: GridColumn<MonitoringRow>[] = React.useMemo(
    () => [
      { field: "sbuId", header: "SBU", kind: "enum", accessor: (r) => r.sbuId, cell: (r) => sbuCode(r.sbuId), enumOptions: sbus.map((s) => ({ value: s.id, label: s.code })), defaultWidth: 90 },
      { field: "kind", header: "Loại", kind: "enum", accessor: (r) => r.kind, enumLabels: KIND_LABELS, defaultWidth: 140 },
      { field: "title", header: "Hạng mục", kind: "text", accessor: (r) => r.title, defaultWidth: 220, groupable: false },
      { field: "lastUpdatedDate", header: "Cập nhật gần nhất", kind: "date", accessor: (r) => r.lastUpdatedDate, cell: (r) => (r.lastUpdatedDate ? fmtDate(r.lastUpdatedDate) : "—"), defaultWidth: 140 },
      { field: "cycleMonths", header: "Chu kỳ (tháng)", kind: "number", accessor: (r) => r.cycleMonths, defaultWidth: 110 },
      { field: "nextDue", header: "Hạn kế tiếp", kind: "date", accessor: (r) => r.nextDue, cell: (r) => (r.nextDue ? fmtDate(r.nextDue) : "—"), defaultWidth: 120 },
      {
        field: "alert",
        header: "Cảnh báo",
        kind: "enum",
        accessor: (r) => r.alert,
        cell: (r) => <Tag color={ALERT_COLORS_FIXED[r.alert]}>{ALERT_LABELS[r.alert]}</Tag>,
        enumLabels: ALERT_LABELS,
        defaultWidth: 140,
      },
      {
        field: "actions",
        header: "",
        kind: "text",
        accessor: () => "",
        groupable: false,
        sortable: false,
        cell: (r) =>
          canManage ? (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setRefreshFor(r)}>
              Cập nhật
            </Button>
          ) : null,
        defaultWidth: 110,
      },
    ],
    [sbus, canManage, sbuCode],
  );

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await runMonitoringAlertsNowAction();
                if (res.ok) {
                  toast.success(`Đã sinh ${res.data.created} task cảnh báo.`);
                  router.refresh();
                } else toast.error(res.error);
              })
            }
          >
            <RefreshCcw className="mr-1 h-4 w-4" /> Chạy cảnh báo ngay
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Hạng mục mới
          </Button>
        </div>
      )}
      <DataGrid entity="monitoring_items" columns={columns} rows={items} getRowId={(r) => r.id} emptyText="Chưa có hạng mục giám sát nào." />
      <CreateMonitoringDialog open={createOpen} onOpenChange={setCreateOpen} sbus={sbus} onDone={() => { setCreateOpen(false); router.refresh(); }} />
      <RefreshDialog item={refreshFor} onOpenChange={(o) => !o && setRefreshFor(null)} onDone={() => { setRefreshFor(null); router.refresh(); }} />
    </div>
  );
}

function CreateMonitoringDialog({ open, onOpenChange, sbus, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; sbus: { id: string; code: string }[]; onDone: () => void }) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ sbuId: sbus[0]?.id ?? "", kind: "posm", title: "", cycleMonths: 12 });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hạng mục giám sát mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="SBU">
            <SimpleSelect value={f.sbuId} onValueChange={(v) => v && setF((p) => ({ ...p, sbuId: v }))} options={sbus.map((s) => ({ value: s.id, label: s.code }))} />
          </F>
          <F label="Loại">
            <SimpleSelect value={f.kind} onValueChange={(v) => v && setF((p) => ({ ...p, kind: v }))} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
          </F>
          <F label="Tên hạng mục">
            <Input value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} />
          </F>
          <F label="Chu kỳ (tháng)">
            <Input type="number" min={1} value={f.cycleMonths} onChange={(e) => setF((p) => ({ ...p, cycleMonths: Number(e.target.value) }))} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.sbuId || !f.title.trim()}
            onClick={() =>
              start(async () => {
                const res = await createMonitoringItemAction({ sbuId: f.sbuId, kind: f.kind as never, title: f.title.trim(), cycleMonths: f.cycleMonths });
                if (res.ok) {
                  toast.success("Đã tạo.");
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

function RefreshDialog({ item, onOpenChange, onDone }: { item: MonitoringRow | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [pending, start] = React.useTransition();
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cập nhật: {item?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Ngày cập nhật">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </F>
          <F label="Link ảnh">
            <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          </F>
          <F label="Ghi chú">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !item}
            onClick={() =>
              start(async () => {
                if (!item) return;
                const res = await markMonitoringRefreshedAction(item.id, { lastUpdatedDate: date, photoUrl: photoUrl || null, note: note || null });
                if (res.ok) {
                  toast.success("Đã cập nhật.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Lưu
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
