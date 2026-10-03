"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { createContentWorkflowTemplateAction, deleteContentWorkflowTemplateAction } from "./actions";

const ROLE_LABELS: Record<string, string> = { owner: "Người phụ trách content", designer: "Thiết kế (mặc định: Trân)", approver: "Duyệt (mặc định: Trưởng phòng)", fixed: "Người cố định" };

interface Step {
  label: string;
  offsetWorkdaysBeforePublish: number;
  roleHint: "owner" | "designer" | "approver" | "fixed";
  assigneeId?: string;
}
interface WorkflowRow {
  id: string;
  brandId: string | null;
  channel: string | null;
  steps: Step[];
}

export function ContentWorkflowPanel({
  templates,
  brands,
  users,
}: {
  templates: WorkflowRow[];
  brands: { id: string; code: string }[];
  users: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  const brandCode = (id: string | null) => (id ? (brands.find((b) => b.id === id)?.code ?? id) : "Mọi brand");

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-lg border text-sm">
        {templates.map((w) => (
          <div key={w.id} className="px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {brandCode(w.brandId)} · {w.channel ?? "Mọi kênh"}
              </div>
              <button
                type="button"
                disabled={pending}
                className="text-muted-foreground hover:text-crit"
                onClick={() =>
                  start(async () => {
                    const res = await deleteContentWorkflowTemplateAction(w.id);
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
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
              {w.steps.map((s, i) => (
                <li key={i}>
                  {s.label} — hạn trước {s.offsetWorkdaysBeforePublish} ngày làm việc · {ROLE_LABELS[s.roleHint] ?? s.roleHint}
                </li>
              ))}
            </ol>
          </div>
        ))}
        {templates.length === 0 && <div className="px-3 py-4 text-center text-muted-foreground">Chưa có — dùng mặc định cho mọi content.</div>}
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Thêm quy trình
      </Button>
      <AddWorkflowDialog
        open={open}
        onOpenChange={setOpen}
        brands={brands}
        users={users}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

const DEFAULT_STEPS: Step[] = [
  { label: "Soạn nội dung", offsetWorkdaysBeforePublish: 3, roleHint: "owner" },
  { label: "Thiết kế", offsetWorkdaysBeforePublish: 2, roleHint: "designer" },
  { label: "Duyệt", offsetWorkdaysBeforePublish: 1, roleHint: "approver" },
  { label: "Đăng bài", offsetWorkdaysBeforePublish: 0, roleHint: "owner" },
];

function AddWorkflowDialog({
  open,
  onOpenChange,
  brands,
  users,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brands: { id: string; code: string }[];
  users: { id: string; fullName: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [brandId, setBrandId] = React.useState("");
  const [channel, setChannel] = React.useState("");
  const [steps, setSteps] = React.useState<Step[]>(DEFAULT_STEPS);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addStep() {
    setSteps((prev) => [...prev, { label: "", offsetWorkdaysBeforePublish: 0, roleHint: "owner" }]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Thêm quy trình content</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Để trống Brand/Kênh = áp dụng mặc định cho mọi content không khớp quy tắc cụ thể hơn.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Brand (tuỳ chọn)</Label>
              <SimpleSelect value={brandId} onValueChange={(v) => setBrandId(v ?? "")} options={[{ value: "", label: "— mọi brand —" }, ...brands.map((b) => ({ value: b.id, label: b.code }))]} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kênh (tuỳ chọn)</Label>
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Fanpage, TikTok..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Các bước (theo thứ tự)</Label>
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-md border p-1.5">
                <Input className="h-8 flex-1" value={s.label} onChange={(e) => updateStep(i, { label: e.target.value })} placeholder="Tên bước" />
                <Input className="h-8 w-16" type="number" min={0} value={s.offsetWorkdaysBeforePublish} onChange={(e) => updateStep(i, { offsetWorkdaysBeforePublish: Number(e.target.value) })} title="Số ngày làm việc trước ngày đăng" />
                <SimpleSelect triggerClassName="h-8 w-44" value={s.roleHint} onValueChange={(v) => v && updateStep(i, { roleHint: v as Step["roleHint"] })} options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
                {s.roleHint === "fixed" && (
                  <SimpleSelect triggerClassName="h-8 w-36" value={s.assigneeId ?? ""} onValueChange={(v) => updateStep(i, { assigneeId: v || undefined })} options={users.map((u) => ({ value: u.id, label: u.fullName }))} />
                )}
                <button type="button" onClick={() => removeStep(i)} className="text-muted-foreground hover:text-crit">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="mr-1 h-3 w-3" /> Thêm bước
            </Button>
          </div>

          <Button
            className="w-full"
            disabled={pending || steps.length === 0 || steps.some((s) => !s.label.trim())}
            onClick={() =>
              start(async () => {
                const res = await createContentWorkflowTemplateAction({ brandId: brandId || undefined, channel: channel || undefined, steps });
                if (res.ok) {
                  toast.success("Đã thêm quy trình.");
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
