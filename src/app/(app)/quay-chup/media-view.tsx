"use client";

import { Plus, Repeat } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { todayVnDayStr } from "@/lib/time";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";
import { ROW_TONE_CLASS } from "../task/task-style";
import {
  addMediaDeliverableAction,
  createMediaShootAction,
  generateRecurringShootsAction,
  updateMediaDeliverableAction,
  updateMediaShootAction,
} from "./actions";

interface ShootRow {
  id: string;
  code: string;
  shootDate: string;
  location: string | null;
  purpose: string | null;
  status: string;
  sbuId: string | null;
  brandId: string | null;
}
interface DeliverableRow {
  id: string;
  shootId: string;
  deliverableType: string;
  channel: string | null;
  editorId: string | null;
  dueDate: string | null;
  resultUrl: string | null;
}
interface Lite {
  id: string;
  code?: string;
  fullName?: string;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Dự kiến",
  prepared: "Đã chuẩn bị",
  shot: "Đã quay",
  editing: "Đang dựng",
  done: "Xong",
  cancelled: "Huỷ",
};

const SHOOT_STATUS_COLORS: Record<string, TagColor> = { planned: "slate", prepared: "sky", shot: "amber", editing: "violet", done: "emerald", cancelled: "gray" };

const SHOOT_VIEW = { sorts: [{ field: "shootDate", direction: "asc" as const }] };
const DELIVERABLE_VIEW = { sorts: [{ field: "dueDate", direction: "asc" as const }] };

export function MediaPlanView({
  shoots,
  deliverables,
  brands,
  sbus,
  users,
}: {
  shoots: ShootRow[];
  deliverables: DeliverableRow[];
  brands: Lite[];
  sbus: Lite[];
  users: Lite[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [recurOpen, setRecurOpen] = React.useState(false);
  const [deliverableForShoot, setDeliverableForShoot] = React.useState<string | null>(null);
  const today = todayVnDayStr();

  const shootCode = React.useCallback((id: string) => shoots.find((s) => s.id === id)?.code ?? "?", [shoots]);
  const sbuOpts = React.useMemo(() => sbus.map((s) => ({ value: s.id, label: s.code ?? "" })), [sbus]);
  const brandOpts = React.useMemo(() => brands.map((b) => ({ value: b.id, label: b.code ?? "" })), [brands]);
  const userOpts = React.useMemo(() => users.map((u) => ({ value: u.id, label: u.fullName ?? "" })), [users]);
  const delivCount = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deliverables) m.set(d.shootId, (m.get(d.shootId) ?? 0) + 1);
    return m;
  }, [deliverables]);

  const onEditShoot = React.useCallback(
    async (id: string, field: string, raw: string) => {
      const v = raw.trim();
      const patch: Parameters<typeof updateMediaShootAction>[1] =
        field === "shootDate" ? { shootDate: v } : field === "location" ? { location: v || null } : field === "purpose" ? { purpose: v || null } : field === "sbuId" ? { sbuId: v || null } : field === "brandId" ? { brandId: v || null } : field === "status" ? { status: v as never } : {};
      if (Object.keys(patch).length === 0) return;
      const res = await updateMediaShootAction(id, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const onEditDeliverable = React.useCallback(
    async (id: string, field: string, raw: string) => {
      const v = raw.trim();
      const patch: Parameters<typeof updateMediaDeliverableAction>[1] =
        field === "deliverableType" ? { deliverableType: v } : field === "channel" ? { channel: v || null } : field === "editorId" ? { editorId: v || null } : field === "dueDate" ? { dueDate: v || null } : field === "resultUrl" ? { resultUrl: v || null } : {};
      if (Object.keys(patch).length === 0) return;
      const res = await updateMediaDeliverableAction(id, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const shootColumns: GridColumn<ShootRow>[] = React.useMemo(
    () => [
      { field: "code", header: "Mã", kind: "text", accessor: (r) => r.code, defaultWidth: 110, groupable: false },
      { field: "shootDate", header: "Ngày quay", kind: "date", accessor: (r) => r.shootDate, cell: (r) => fmtDate(r.shootDate), editable: true, editInputType: "date", editValue: (r) => r.shootDate, defaultWidth: 115, groupable: false },
      { field: "purpose", header: "Mục đích", kind: "text", accessor: (r) => r.purpose ?? "", editable: true, defaultWidth: 280, groupable: false },
      { field: "location", header: "Địa điểm", kind: "text", accessor: (r) => r.location ?? "", editable: true, defaultWidth: 200 },
      { field: "sbuId", header: "SBU", kind: "enum", accessor: (r) => r.sbuId ?? "", cell: (r) => sbuOpts.find((o) => o.value === r.sbuId)?.label || <span className="text-muted-foreground/60">—</span>, enumOptions: sbuOpts, filterOptions: sbuOpts, editable: true, editKind: "select", editOptions: [{ value: "", label: "— Không —" }, ...sbuOpts], editValue: (r) => r.sbuId ?? "", defaultWidth: 90 },
      { field: "brandId", header: "Brand", kind: "enum", accessor: (r) => r.brandId ?? "", cell: (r) => brandOpts.find((o) => o.value === r.brandId)?.label || <span className="text-muted-foreground/60">—</span>, enumOptions: brandOpts, filterOptions: brandOpts, editable: true, editKind: "select", editOptions: [{ value: "", label: "— Không —" }, ...brandOpts], editValue: (r) => r.brandId ?? "", defaultWidth: 100 },
      { field: "status", header: "Trạng thái", kind: "enum", accessor: (r) => r.status, enumLabels: STATUS_LABELS, enumColors: SHOOT_STATUS_COLORS, editable: true, editKind: "select", editOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })), editValue: (r) => r.status, defaultWidth: 130 },
      {
        field: "deliverables",
        header: "Deliverable",
        kind: "number",
        accessor: (r) => delivCount.get(r.id) ?? 0,
        cell: (r) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              setDeliverableForShoot(r.id);
            }}
          >
            <span className="font-medium tabular-nums">{delivCount.get(r.id) ?? 0}</span> <Plus className="h-3 w-3" /> thêm
          </button>
        ),
        align: "right",
        defaultWidth: 120,
        groupable: false,
      },
    ],
    [sbuOpts, brandOpts, delivCount],
  );

  const deliverableColumns: GridColumn<DeliverableRow>[] = React.useMemo(
    () => [
      { field: "shootId", header: "Đợt quay", kind: "enum", accessor: (r) => r.shootId, cell: (r) => <span className="font-mono text-xs">{shootCode(r.shootId)}</span>, enumOptions: shoots.map((s) => ({ value: s.id, label: s.code })), filterOptions: shoots.map((s) => ({ value: s.id, label: s.code })), defaultWidth: 110 },
      { field: "deliverableType", header: "Loại sản phẩm", kind: "text", accessor: (r) => r.deliverableType, editable: true, defaultWidth: 260, groupable: false },
      { field: "channel", header: "Kênh", kind: "text", accessor: (r) => r.channel ?? "", editable: true, defaultWidth: 130 },
      { field: "editorId", header: "Người hậu kỳ", kind: "enum", accessor: (r) => r.editorId ?? "", cell: (r) => userOpts.find((o) => o.value === r.editorId)?.label || <span className="text-muted-foreground/60">Chưa giao</span>, enumOptions: userOpts, filterOptions: userOpts, editable: true, editKind: "select", editOptions: [{ value: "", label: "— Chưa giao —" }, ...userOpts], editValue: (r) => r.editorId ?? "", defaultWidth: 150 },
      { field: "dueDate", header: "Hạn hậu kỳ", kind: "date", accessor: (r) => r.dueDate, cell: (r) => fmtDate(r.dueDate), editable: true, editInputType: "date", editValue: (r) => r.dueDate ?? "", defaultWidth: 115, groupable: false },
      {
        field: "resultUrl",
        header: "Link kết quả",
        kind: "text",
        accessor: (r) => r.resultUrl ?? "",
        cell: (r) =>
          r.resultUrl ? (
            <a href={r.resultUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
              Mở link
            </a>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          ),
        editable: true,
        defaultWidth: 130,
        groupable: false,
      },
    ],
    [shoots, shootCode, userOpts],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setRecurOpen(true)}>
          <Repeat className="mr-1 h-4 w-4" /> Tạo lịch quay định kỳ
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Đợt quay mới
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Các đợt quay</h2>
        <DataGrid
          entity="media_shoots"
          columns={shootColumns}
          rows={shoots}
          getRowId={(r) => r.id}
          initialView={SHOOT_VIEW}
          onEditCell={onEditShoot}
          onAddRow={() => setCreateOpen(true)}
          addRowLabel="Đợt quay mới"
          rowClassName={(r) => (r.shootDate < today && !["done", "cancelled", "shot", "editing"].includes(r.status) ? ROW_TONE_CLASS.overdue : r.status === "done" || r.status === "cancelled" ? "opacity-60" : undefined)}
          emptyText="Chưa có đợt quay nào."
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Deliverable (sản phẩm hậu kỳ) của các đợt quay</h2>
        <DataGrid
          entity="media_deliverables"
          columns={deliverableColumns}
          rows={deliverables}
          getRowId={(r) => r.id}
          initialView={DELIVERABLE_VIEW}
          onEditCell={onEditDeliverable}
          rowClassName={(r) => (r.dueDate && r.dueDate < today && !r.resultUrl ? ROW_TONE_CLASS.overdue : undefined)}
          emptyText="Chưa có deliverable — bấm “+ thêm” ở cột Deliverable của một đợt quay."
        />
      </section>

      <CreateShootDialog open={createOpen} onOpenChange={setCreateOpen} brands={brands} sbus={sbus} users={users} onDone={() => { setCreateOpen(false); router.refresh(); }} />
      <RecurringShootsDialog open={recurOpen} onOpenChange={setRecurOpen} brands={brands} sbus={sbus} users={users} onDone={() => { setRecurOpen(false); router.refresh(); }} />
      <AddDeliverableDialog
        shootId={deliverableForShoot}
        onOpenChange={(o) => !o && setDeliverableForShoot(null)}
        users={users}
        onDone={() => {
          setDeliverableForShoot(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateShootDialog({
  open,
  onOpenChange,
  brands,
  sbus,
  users,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brands: Lite[];
  sbus: Lite[];
  users: Lite[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ shootDate: "", location: "", purpose: "", sbuId: "", brandId: "", responsibleId: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đợt quay mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Ngày quay">
            <DateInput value={f.shootDate} onChange={(v) => set("shootDate", v)} />
          </F>
          <F label="Địa điểm">
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} />
          </F>
          <F label="Mục đích">
            <Input value={f.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F label="SBU">
              <SimpleSelect value={f.sbuId} onValueChange={(v) => set("sbuId", v ?? "")} options={[{ value: "", label: "—" }, ...sbus.map((s) => ({ value: s.id, label: s.code ?? "" }))]} />
            </F>
            <F label="Brand">
              <SimpleSelect value={f.brandId} onValueChange={(v) => set("brandId", v ?? "")} options={[{ value: "", label: "—" }, ...brands.map((b) => ({ value: b.id, label: b.code ?? "" }))]} />
            </F>
          </div>
          <F label="Người phụ trách">
            <SimpleSelect value={f.responsibleId} onValueChange={(v) => set("responsibleId", v ?? "")} options={[{ value: "", label: "—" }, ...users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))]} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.shootDate}
            onClick={() =>
              start(async () => {
                const res = await createMediaShootAction({
                  shootDate: f.shootDate,
                  location: f.location || null,
                  purpose: f.purpose || null,
                  sbuId: f.sbuId || null,
                  brandId: f.brandId || null,
                  responsibleId: f.responsibleId || null,
                });
                if (res.ok) {
                  toast.success("Đã tạo đợt quay + task.");
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

function RecurringShootsDialog({
  open,
  onOpenChange,
  brands,
  sbus,
  users,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brands: Lite[];
  sbus: Lite[];
  users: Lite[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ firstDate: "", count: 4, intervalDays: 14, sbuId: "", brandId: "", purpose: "", responsibleId: "" });
  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo lịch quay định kỳ</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">nhập ngày đợt 1 và số đợt, hệ thống tạo các đợt cách nhau 14 ngày (có thể đổi).</p>
          <div className="grid grid-cols-2 gap-2">
            <F label="Ngày đợt 1">
              <DateInput value={f.firstDate} onChange={(v) => set("firstDate", v)} />
            </F>
            <F label="Số đợt">
              <Input type="number" min={1} max={26} value={f.count} onChange={(e) => set("count", Number(e.target.value))} />
            </F>
            <F label="Cách nhau (ngày)">
              <Input type="number" min={1} value={f.intervalDays} onChange={(e) => set("intervalDays", Number(e.target.value))} />
            </F>
            <F label="Mục đích">
              <Input value={f.purpose} onChange={(e) => set("purpose", e.target.value)} />
            </F>
            <F label="SBU">
              <SimpleSelect value={f.sbuId} onValueChange={(v) => set("sbuId", v ?? "")} options={[{ value: "", label: "—" }, ...sbus.map((s) => ({ value: s.id, label: s.code ?? "" }))]} />
            </F>
            <F label="Brand">
              <SimpleSelect value={f.brandId} onValueChange={(v) => set("brandId", v ?? "")} options={[{ value: "", label: "—" }, ...brands.map((b) => ({ value: b.id, label: b.code ?? "" }))]} />
            </F>
          </div>
          <F label="Người phụ trách">
            <SimpleSelect value={f.responsibleId} onValueChange={(v) => set("responsibleId", v ?? "")} options={[{ value: "", label: "—" }, ...users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))]} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.firstDate || f.count < 1}
            onClick={() =>
              start(async () => {
                const res = await generateRecurringShootsAction({
                  firstDate: f.firstDate,
                  count: f.count,
                  intervalDays: f.intervalDays,
                  sbuId: f.sbuId || null,
                  brandId: f.brandId || null,
                  purpose: f.purpose || null,
                  responsibleId: f.responsibleId || null,
                });
                if (res.ok) {
                  toast.success(`Đã tạo ${res.data.count} đợt quay.`);
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

function AddDeliverableDialog({
  shootId,
  onOpenChange,
  users,
  onDone,
}: {
  shootId: string | null;
  onOpenChange: (o: boolean) => void;
  users: Lite[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ deliverableType: "", channel: "", editorId: "", dueDate: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Dialog open={!!shootId} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm deliverable</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Loại (video ngắn, ảnh, reel...)">
            <Input value={f.deliverableType} onChange={(e) => set("deliverableType", e.target.value)} />
          </F>
          <F label="Kênh">
            <Input value={f.channel} onChange={(e) => set("channel", e.target.value)} />
          </F>
          <F label="Người dựng">
            <SimpleSelect value={f.editorId} onValueChange={(v) => set("editorId", v ?? "")} options={[{ value: "", label: "—" }, ...users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))]} />
          </F>
          <F label="Hạn">
            <DateInput value={f.dueDate} onChange={(v) => set("dueDate", v)} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !shootId || !f.deliverableType.trim()}
            onClick={() =>
              start(async () => {
                if (!shootId) return;
                const res = await addMediaDeliverableAction({
                  shootId,
                  deliverableType: f.deliverableType.trim(),
                  channel: f.channel || null,
                  editorId: f.editorId || null,
                  dueDate: f.dueDate || null,
                });
                if (res.ok) {
                  toast.success("Đã thêm deliverable + task hậu kỳ.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Thêm
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
