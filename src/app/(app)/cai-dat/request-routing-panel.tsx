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
import { createRequestRoutingAction, deleteRequestRoutingAction } from "./actions";

const REQUEST_TYPE_LABELS: Record<string, string> = {
  design: "Thiết kế",
  ads: "Ads",
  content: "Content",
  media: "Quay chụp",
  posm: "POSM",
  event: "Sự kiện",
  consulting: "Tư vấn",
  other: "Khác",
};

interface RoutingRow {
  id: string;
  requestType: string;
  sbuId: string | null;
  assigneeId: string;
  defaultSlaDays: string | null;
}

export function RequestRoutingPanel({
  routing,
  sbus,
  users,
}: {
  routing: RoutingRow[];
  sbus: { id: string; code: string }[];
  users: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  const sbuCode = (id: string | null) => (id ? (sbus.find((s) => s.id === id)?.code ?? id) : "(mọi SBU)");
  const userName = (id: string) => users.find((u) => u.id === id)?.fullName ?? id;

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-lg border text-sm">
        {routing.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType} · {sbuCode(r.sbuId)}
              {r.defaultSlaDays && <span className="text-muted-foreground"> · SLA {r.defaultSlaDays} ngày</span>}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{userName(r.assigneeId)}</span>
              <button
                type="button"
                disabled={pending}
                className="text-muted-foreground hover:text-crit"
                onClick={() =>
                  start(async () => {
                    const res = await deleteRequestRoutingAction(r.id);
                    if (res.ok) {
                      toast.success("Đã xoá.");
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {routing.length === 0 && <div className="px-3 py-4 text-center text-muted-foreground">Chưa cấu hình — request mới sẽ giao cho người xác nhận request.</div>}
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Thêm định tuyến
      </Button>
      <AddRoutingDialog
        open={open}
        onOpenChange={setOpen}
        sbus={sbus}
        users={users}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function AddRoutingDialog({
  open,
  onOpenChange,
  sbus,
  users,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sbus: { id: string; code: string }[];
  users: { id: string; fullName: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ requestType: "design", sbuId: "", assigneeId: users[0]?.id ?? "", defaultSlaDays: "" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm định tuyến request</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Loại request</Label>
            <SimpleSelect value={f.requestType} onValueChange={(v) => v && setF((p) => ({ ...p, requestType: v }))} options={Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SBU (để trống = áp dụng mọi SBU)</Label>
            <SimpleSelect value={f.sbuId} onValueChange={(v) => setF((p) => ({ ...p, sbuId: v ?? "" }))} options={[{ value: "", label: "— mọi SBU —" }, ...sbus.map((s) => ({ value: s.id, label: s.code }))]} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Người tiếp nhận</Label>
            <SimpleSelect value={f.assigneeId} onValueChange={(v) => v && setF((p) => ({ ...p, assigneeId: v }))} options={users.map((u) => ({ value: u.id, label: u.fullName }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SLA mặc định (số ngày, tuỳ chọn)</Label>
            <Input value={f.defaultSlaDays} onChange={(e) => setF((p) => ({ ...p, defaultSlaDays: e.target.value }))} />
          </div>
          <Button
            className="w-full"
            disabled={pending || !f.assigneeId}
            onClick={() =>
              start(async () => {
                const res = await createRequestRoutingAction(f as never);
                if (res.ok) {
                  toast.success("Đã thêm.");
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
