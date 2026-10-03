"use client";

import { History, ListPlus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import type { TagColor } from "@/components/data-grid/tag";
import { Tag } from "@/components/data-grid/tag";
import {
  createTaskFromFoundationCellAction,
  foundationHistoryAction,
  updateFoundationCellAction,
  upsertFoundationEntryAction,
} from "./actions";

type Status = "confirmed" | "needs_confirmation" | "proposed";

const STATUS_LABELS: Record<Status, string> = {
  confirmed: "Đã xác nhận",
  needs_confirmation: "Cần xác nhận",
  proposed: "Đề xuất",
};
const STATUS_COLORS: Record<Status, TagColor> = {
  confirmed: "emerald",
  needs_confirmation: "amber",
  proposed: "slate",
};

interface Entry {
  id: string;
  brandId: string;
  sectionCode: string;
  componentCode: string;
  componentLabel: string;
  content: string | null;
  status: Status;
  version: number;
}
interface BrandLite {
  id: string;
  code: string;
  name: string;
}

export function FoundationGrid({ brands, entries, canEdit }: { brands: BrandLite[]; entries: Entry[]; canEdit: boolean }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);

  // Nhóm theo componentCode (dòng), mỗi dòng có 1 ô cho mỗi brand (cột).
  const byComponent = new Map<string, { sectionCode: string; componentLabel: string; cells: Map<string, Entry> }>();
  for (const e of entries) {
    if (!byComponent.has(e.componentCode)) {
      byComponent.set(e.componentCode, { sectionCode: e.sectionCode, componentLabel: e.componentLabel, cells: new Map() });
    }
    byComponent.get(e.componentCode)!.cells.set(e.brandId, e);
  }
  const components = [...byComponent.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const needsConfirmationCount = (brandId: string) =>
    entries.filter((e) => e.brandId === brandId && e.status === "needs_confirmation").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2 text-xs">
          {brands.map((b) => (
            <Badge key={b.id} variant="outline">
              {b.code}: {needsConfirmationCount(b.id)} cần xác nhận
            </Badge>
          ))}
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Thêm ô
          </Button>
        )}
      </div>

      {components.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu Foundation. Thêm ô thủ công hoặc nạp bằng Import → T8.
        </p>
      ) : (
        <div className="overflow-auto rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                <th className="w-48 border-b px-3 py-2 text-xs font-semibold text-muted-foreground">Cấu phần</th>
                {brands.map((b) => (
                  <th key={b.id} className="min-w-48 border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
                    {b.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.map(([code, info]) => (
                <tr key={code} className="border-b align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{code}</div>
                    <div className="text-xs text-muted-foreground">
                      {info.sectionCode} · {info.componentLabel}
                    </div>
                  </td>
                  {brands.map((b) => {
                    const entry = info.cells.get(b.id);
                    return (
                      <td key={b.id} className="px-3 py-2">
                        {entry ? (
                          <Cell entry={entry} canEdit={canEdit} onChanged={() => router.refresh()} />
                        ) : canEdit ? (
                          <button
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => setAddOpen(true)}
                          >
                            + thêm nội dung
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddCellDialog open={addOpen} onOpenChange={setAddOpen} brands={brands} onDone={() => router.refresh()} />
    </div>
  );
}

function Cell({ entry, canEdit, onChanged }: { entry: Entry; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState(entry.content ?? "");
  const [status, setStatus] = React.useState<Status>(entry.status);
  const [pending, start] = React.useTransition();
  const [history, setHistory] = React.useState<{ version: number; content: string | null; status: string }[] | null>(null);

  if (editing) {
    return (
      <div className="space-y-1">
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} className="text-xs" />
        <SimpleSelect
          triggerClassName="h-7 w-full"
          value={status}
          onValueChange={(v) => v && setStatus(v as Status)}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-7"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await updateFoundationCellAction(entry.id, { content, status });
                if (res.ok) {
                  toast.success("Đã lưu.");
                  setEditing(false);
                  onChanged();
                } else toast.error(res.error);
              })
            }
          >
            Lưu
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Tag color={STATUS_COLORS[entry.status]}>{STATUS_LABELS[entry.status]}</Tag>
      <p className={canEdit ? "cursor-pointer whitespace-pre-wrap text-sm hover:bg-muted/40" : "whitespace-pre-wrap text-sm"} onClick={() => canEdit && setEditing(true)}>
        {entry.content || <span className="text-muted-foreground">(trống — bấm để sửa)</span>}
      </p>
      <div className="flex gap-2 text-xs text-muted-foreground">
        <Popover
          onOpenChange={(open) => {
            if (open && !history) foundationHistoryAction(entry.id).then((h) => setHistory(h.map((x) => ({ version: x.version, content: x.content, status: x.status }))));
          }}
        >
          <PopoverTrigger render={<button type="button" className="inline-flex items-center gap-1 hover:underline" />}>
            <>
              <History className="h-3 w-3" /> v{entry.version}
            </>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="max-h-60 space-y-2 overflow-auto text-xs">
              {!history && <p className="text-muted-foreground">Đang tải...</p>}
              {history?.length === 0 && <p className="text-muted-foreground">Chưa có lịch sử.</p>}
              {history?.map((h) => (
                <div key={h.version} className="border-b pb-1">
                  <div className="font-medium">v{h.version} — {STATUS_LABELS[h.status as Status] ?? h.status}</div>
                  <div className="whitespace-pre-wrap text-muted-foreground">{h.content || "(trống)"}</div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:underline"
          onClick={() =>
            start(async () => {
              const res = await createTaskFromFoundationCellAction(entry.id);
              if (res.ok) toast.success("Đã tạo task — xem ở Tất cả task.");
              else toast.error(res.error);
            })
          }
        >
          <ListPlus className="h-3 w-3" /> Tạo task
        </button>
      </div>
    </div>
  );
}

function AddCellDialog({
  open,
  onOpenChange,
  brands,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brands: BrandLite[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ brandId: brands[0]?.id ?? "", sectionCode: "", componentCode: "", componentLabel: "", content: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm ô Foundation</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Brand</Label>
            <SimpleSelect value={f.brandId} onValueChange={(v) => v && set("brandId", v)} options={brands.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mã phần (A..I)</Label>
              <Input value={f.sectionCode} onChange={(e) => set("sectionCode", e.target.value)} placeholder="A" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mã cấu phần</Label>
              <Input value={f.componentCode} onChange={(e) => set("componentCode", e.target.value)} placeholder="A1" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tên cấu phần</Label>
            <Input value={f.componentLabel} onChange={(e) => set("componentLabel", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nội dung</Label>
            <Textarea value={f.content} onChange={(e) => set("content", e.target.value)} rows={4} />
          </div>
          <Button
            className="w-full"
            disabled={pending || !f.brandId || !f.sectionCode.trim() || !f.componentCode.trim() || !f.componentLabel.trim()}
            onClick={() =>
              start(async () => {
                const res = await upsertFoundationEntryAction({
                  brandId: f.brandId,
                  sectionCode: f.sectionCode.trim(),
                  componentCode: f.componentCode.trim(),
                  componentLabel: f.componentLabel.trim(),
                  content: f.content || null,
                  status: "needs_confirmation",
                });
                if (res.ok) {
                  toast.success("Đã thêm.");
                  onOpenChange(false);
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
