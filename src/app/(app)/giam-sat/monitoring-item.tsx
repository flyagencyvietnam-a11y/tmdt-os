"use client";

import { CalendarCheck, ExternalLink, History, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/format";
import { todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import { deleteMonitoringItemAction, listMonitoringChecksAction, markMonitoringRefreshedAction, updateMonitoringItemAction } from "./actions";
import { ALERT_LABELS, KIND_LABELS, STATE_PLACEHOLDER, type Alert, type MonitoringRow } from "./monitoring-shared";
import { PhotoStrip } from "./photo-strip";

const ALERT_TAG: Record<Alert, TagColor> = { overdue: "red", due_soon: "amber", ok: "emerald", no_data: "gray" };
const ALERT_ROW: Record<Alert, string> = {
  overdue: "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10",
  due_soon: "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10",
  ok: "bg-card",
  no_data: "bg-card",
};

/** 1 hạng mục giám sát: tên, hiện trạng, ảnh thực tế, ngày rà soát/chu kỳ và cảnh báo — sửa ngay tại chỗ. */
export function MonitoringItem({ item, canEdit, canManage }: { item: MonitoringRow; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [checkOpen, setCheckOpen] = React.useState(false);
  const isMaps = item.kind === "google_maps";

  const save = (patch: Parameters<typeof updateMonitoringItemAction>[1], ok?: string) =>
    start(async () => {
      const res = await updateMonitoringItemAction(item.id, patch);
      if (res.ok) {
        if (ok) toast.success(ok);
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className={cn("grid gap-3 rounded-xl border p-3 shadow-xs lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)]", ALERT_ROW[item.alert], pending && "opacity-70")}>
      {/* Cột 1: tên + cảnh báo + lịch rà soát */}
      <div className="min-w-0 space-y-2">
        <div className="flex items-start gap-2">
          <InlineText
            value={item.title}
            disabled={!canEdit}
            className="min-w-0 flex-1 text-sm font-semibold"
            onSave={(v) => v.trim() && v.trim() !== item.title && save({ title: v.trim() })}
          />
          <Tag color={ALERT_TAG[item.alert]}>{ALERT_LABELS[item.alert]}</Tag>
          {canEdit && <ItemMenu item={item} canManage={canManage} onSave={save} />}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">{isMaps ? "Rà review gần nhất" : "Cập nhật gần nhất"}</dt>
          <dd className="tabular-nums">{item.lastUpdatedDate ? fmtDate(item.lastUpdatedDate) : <span className="text-muted-foreground">Chưa có</span>}</dd>
          <dt className="text-muted-foreground">Chu kỳ</dt>
          <dd>{item.cycleMonths} tháng</dd>
          <dt className="text-muted-foreground">Hạn kế tiếp</dt>
          <dd className={cn("tabular-nums", item.alert === "overdue" && "font-semibold text-red-700 dark:text-red-300")}>{item.nextDue ? fmtDate(item.nextDue) : "—"}</dd>
        </dl>
        {isMaps && (
          <div className="flex items-center gap-1.5">
            <Input
              key={item.photoUrl ?? ""}
              disabled={!canEdit}
              defaultValue={item.photoUrl ?? ""}
              placeholder="Link Google Maps của điểm (https://maps.app.goo.gl/…)"
              className="h-7 text-xs"
              onBlur={(e) => e.target.value.trim() !== (item.photoUrl ?? "") && save({ photoUrl: e.target.value.trim() || null }, "Đã lưu link.")}
            />
            {item.photoUrl && (
              <a href={item.photoUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border hover:bg-muted" title="Mở Google Maps">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && (
            <Button size="sm" variant={item.alert === "overdue" || item.alert === "due_soon" ? "default" : "outline"} className="h-7" onClick={() => setCheckOpen(true)}>
              <CalendarCheck className="mr-1 h-3.5 w-3.5" /> {isMaps ? "Đã rà review" : "Đã kiểm tra / thay mới"}
            </Button>
          )}
          <ChecksHistory itemId={item.id} count={item.checkCount} />
        </div>
      </div>

      {/* Cột 2: hiện trạng */}
      <div className="min-w-0 space-y-1">
        <Label className="text-xs text-muted-foreground">Hiện trạng đang hiển thị</Label>
        <Textarea
          key={item.currentStateNote ?? ""}
          rows={4}
          disabled={!canEdit}
          defaultValue={item.currentStateNote ?? ""}
          placeholder={STATE_PLACEHOLDER[item.kind] ?? STATE_PLACEHOLDER.other}
          className="min-h-24 resize-y bg-background/70 text-sm"
          onBlur={(e) => e.target.value.trim() !== (item.currentStateNote ?? "") && save({ currentStateNote: e.target.value.trim() || null }, "Đã lưu hiện trạng.")}
        />
      </div>

      {/* Cột 3: ảnh thực tế */}
      <div className="min-w-0 space-y-1">
        <Label className="text-xs text-muted-foreground">
          Ảnh thực tế {item.photos.length > 0 && <span className="tabular-nums">({item.photos.length})</span>}
        </Label>
        <PhotoStrip itemId={item.id} photos={item.photos} canEdit={canEdit} label={item.title} />
      </div>

      <CheckDialog item={item} open={checkOpen} onOpenChange={setCheckOpen} />
    </div>
  );
}

/** Chữ bấm vào là sửa (Enter/rời ô = lưu, Esc = huỷ). */
function InlineText({ value, onSave, disabled, className }: { value: string; onSave: (v: string) => void; disabled?: boolean; className?: string }) {
  const [editing, setEditing] = React.useState(false);
  if (editing && !disabled) {
    return (
      <Input
        autoFocus
        defaultValue={value}
        className={cn("h-7", className)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          setEditing(false);
          onSave(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={() => setEditing(true)} className={cn("truncate rounded px-0.5 text-left hover:bg-background/70 disabled:cursor-default", className)} title={disabled ? value : "Bấm để đổi tên"}>
      {value}
    </button>
  );
}

function ItemMenu({ item, canManage, onSave }: { item: MonitoringRow; canManage: boolean; onSave: (patch: Parameters<typeof updateMonitoringItemAction>[1], ok?: string) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Popover>
      <PopoverTrigger render={<button type="button" aria-label="Tuỳ chọn hạng mục" className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" />}>
        <MoreHorizontal className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Loại hạng mục</Label>
            <SimpleSelect value={item.kind} onValueChange={(v) => v && v !== item.kind && onSave({ kind: v as never }, "Đã đổi loại.")} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Chu kỳ rà soát/thay mới (tháng)</Label>
            <Input type="number" min={1} defaultValue={item.cycleMonths} onBlur={(e) => Number(e.target.value) >= 1 && Number(e.target.value) !== item.cycleMonths && onSave({ cycleMonths: Number(e.target.value) }, "Đã đổi chu kỳ.")} />
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-600"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Xoá hạng mục “${item.title}” cùng ${item.photos.length} ảnh và lịch sử rà soát?`)) return;
                start(async () => {
                  const res = await deleteMonitoringItemAction(item.id);
                  if (res.ok) {
                    toast.success("Đã xoá hạng mục.");
                    router.refresh();
                  } else toast.error(res.error);
                });
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Xoá hạng mục
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CheckDialog({ item, open, onOpenChange }: { item: MonitoringRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item.kind === "google_maps" ? "Ghi nhận rà review" : "Ghi nhận kiểm tra / thay mới"}: {item.title}
          </DialogTitle>
        </DialogHeader>
        {/* Form mount lại mỗi lần mở → ngày/ghi chú luôn bắt đầu mới */}
        <CheckForm item={item} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CheckForm({ item, onDone }: { item: MonitoringRow; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [date, setDate] = React.useState(todayVnDayStr());
  const [note, setNote] = React.useState("");
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Ngày thực hiện</Label>
        <DateInput value={date} onChange={setDate} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hiện trạng / ghi chú (sẽ thay “Hiện trạng đang hiển thị”)</Label>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={item.currentStateNote ?? "Để trống = giữ hiện trạng cũ"} />
      </div>
      <p className="text-xs text-muted-foreground">Chụp ảnh thực tế thì thêm ở ô “Ảnh thực tế” của hạng mục. Ghi nhận xong, hạn kế tiếp tính lại = ngày này + {item.cycleMonths} tháng và task cảnh báo (nếu có) tự đóng.</p>
      <Button
        className="w-full"
        disabled={pending || !date}
        onClick={() =>
          start(async () => {
            const res = await markMonitoringRefreshedAction(item.id, { lastUpdatedDate: date, note: note.trim() || null });
            if (res.ok) {
              toast.success("Đã ghi nhận.");
              onDone();
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        Lưu
      </Button>
    </div>
  );
}

function ChecksHistory({ itemId, count }: { itemId: string; count: number }) {
  const [rows, setRows] = React.useState<{ id: string; checkedOn: string; note: string | null }[] | null>(null);
  if (count === 0) return null;
  return (
    <Popover onOpenChange={(o) => o && listMonitoringChecksAction(itemId).then((r) => r.ok && setRows(r.data))}>
      <PopoverTrigger render={<button type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground" />}>
        <History className="h-3.5 w-3.5" /> Lịch sử ({count})
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {rows == null && <p className="text-xs text-muted-foreground">Đang tải…</p>}
          {rows?.map((r) => (
            <div key={r.id} className="border-b pb-1.5 last:border-0">
              <div className="font-medium tabular-nums">{fmtDate(r.checkedOn)}</div>
              {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
