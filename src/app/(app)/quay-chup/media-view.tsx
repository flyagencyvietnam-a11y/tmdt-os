"use client";

import { Plus, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import {
  addMediaDeliverableAction,
  createMediaShootAction,
  generateRecurringShootsAction,
  updateShootStatusAction,
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
  const [, start] = React.useTransition();

  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? "—";

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setRecurOpen(true)}>
          <Repeat className="mr-1 h-4 w-4" /> Tạo lịch quay định kỳ
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Đợt quay mới
        </Button>
      </div>

      <div className="space-y-3">
        {shoots.length === 0 && <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">Chưa có đợt quay nào.</p>}
        {shoots
          .slice()
          .sort((a, b) => a.shootDate.localeCompare(b.shootDate))
          .map((s) => {
            const myDeliverables = deliverables.filter((d) => d.shootId === s.id);
            return (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {s.code} — {fmtDate(s.shootDate)} {s.purpose ? `· ${s.purpose}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.location}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SimpleSelect
                      triggerClassName="h-7 w-32"
                      value={s.status}
                      onValueChange={(v) =>
                        v &&
                        start(async () => {
                          const res = await updateShootStatusAction(s.id, v);
                          if (res.ok) router.refresh();
                          else toast.error(res.error);
                        })
                      }
                      options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                    />
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setDeliverableForShoot(s.id)}>
                      <Plus className="mr-1 h-3 w-3" /> Deliverable
                    </Button>
                  </div>
                </div>
                {myDeliverables.length > 0 && (
                  <div className="mt-2 divide-y border-t text-sm">
                    {myDeliverables.map((d) => (
                      <div key={d.id} className="flex items-center justify-between py-1.5">
                        <span>
                          {d.deliverableType} {d.channel ? `(${d.channel})` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {userName(d.editorId)} · {d.dueDate ? fmtDate(d.dueDate) : "chưa có hạn"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

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
            <Input type="date" value={f.shootDate} onChange={(e) => set("shootDate", e.target.value)} />
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
          <p className="text-xs text-muted-foreground">SPEC Mục 7.3 — nhập ngày đợt 1 và số đợt, hệ thống tạo các đợt cách nhau 14 ngày (có thể đổi).</p>
          <div className="grid grid-cols-2 gap-2">
            <F label="Ngày đợt 1">
              <Input type="date" value={f.firstDate} onChange={(e) => set("firstDate", e.target.value)} />
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
            <Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
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
