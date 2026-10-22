"use client";

import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportWeekBounds, todayVnDayStr } from "@/lib/time";
import { upsertAdsMetricAction } from "./actions";
import { usePeriodRange } from "./period-range";
import { PeriodReport, type Bucket, type MetricKey } from "./period-report";
import { fmt, nextWeek, num, weekLabel, weekShort, type MetricRow } from "./shared";
import { rowsOfUnit, type AdsUnit } from "./units";

const WEEK_METRICS: MetricKey[] = ["spend", "messages", "costPerMess", "leads", "hvm", "cpl", "cac"];

const weekRangeText = (from: string, to: string, n: number) => (n <= 1 ? `tuần ${weekLabel(to)}` : `${weekLabel(from).split(" – ")[0]} – ${weekLabel(to).split(" – ")[1]} (${n} tuần)`);

/**
 * Báo cáo TUẦN (chu kỳ Thứ 2 → hết Chủ nhật) của MỌI SBU trong một bảng (SPEC Phụ lục D mục 26): Ngân sách · Mess · CP/Mess · Lead · HVM · CPL · CAC.
 * Lead của Ecom = MQL. Số liệu chưa có để trống. Xem NHIỀU tuần cùng lúc (Từ – Đến) để thấy xu hướng.
 */
export function WeeklyView({ metrics, units, canManage, weeks }: { metrics: MetricRow[]; units: AdsUnit[]; canManage: boolean; weeks: string[] }) {
  const router = useRouter();
  const [extraWeeks, setExtraWeeks] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<{ unit: AdsUnit; week: string } | null>(null);

  const range = usePeriodRange({
    storageKey: "week",
    dataKeys: weeks,
    extraKeys: extraWeeks,
    current: reportWeekBounds(todayVnDayStr())[0],
    next: nextWeek,
    label: weekLabel,
    rangeText: weekRangeText,
    unit: "tuần",
    presets: [4, 8, 12, 0],
    defaultCount: 8,
    footer: "tuần tính từ Thứ 2 đến hết Chủ nhật",
  });
  const toBucket = React.useCallback((w: string): Bucket => ({ key: w, label: weekLabel(w), short: weekShort(w), periods: [w], editPeriod: w }), []);
  const buckets = React.useMemo(() => range.shown.map(toBucket), [range.shown, toBucket]);
  const prevBuckets = React.useMemo(() => range.prevShown.map(toBucket), [range.prevShown, toBucket]);

  const addButton = canManage ? <AddWeekButton suggested={range.options.length ? nextWeek(range.options[range.options.length - 1]) : undefined} onAdd={(w) => setExtraWeeks((p) => [...p, w])} /> : null;

  if (range.options.length === 0 || !range.latest) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Chưa có số liệu tuần nào.
        {addButton && <div className="mt-3 flex justify-center">{addButton}</div>}
      </div>
    );
  }

  return (
    <>
      <PeriodReport
        kind="week"
        periodType="week"
        metrics={metrics}
        units={units}
        buckets={buckets}
        prevBuckets={prevBuckets}
        rangeLabel={range.rangeLabel}
        rangeHint={range.rangeHint}
        canManage={canManage}
        picker={range.picker}
        metricSet={WEEK_METRICS}
        defaultOn={WEEK_METRICS}
        persistKey="week"
        title="Bảng theo dõi tuần — mọi SBU"
        description={`Mỗi SBU một khối, mỗi chỉ số một dòng. Ô càng đậm = càng cao trong dòng (đỏ: chi phí cao là xấu). ${canManage ? "Bấm ô để sửa ngay trên bảng (Enter xuống dòng, Tab sang tuần kế); CP/Mess, CPL, CAC tự tính — bấm ô CP/Mess để sửa kèm impression." : ""}`}
        tableActions={addButton}
        detailMetrics={["costPerMess"]}
        onOpenDetail={(unit, b) => setEditing({ unit, week: b.editPeriod! })}
      />
      {editing && (
        <WeeklyEditDialog
          unit={editing.unit}
          week={editing.week}
          row={rowsOfUnit(metrics.filter((m) => m.periodType === "week" && m.period === editing.week), editing.unit)[0] ?? null}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export function AddWeekButton({ suggested, onAdd }: { suggested?: string; onAdd: (week: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(suggested ?? "");
  const isMonday = val && new Date(`${val}T00:00:00Z`).getUTCDay() === 1;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => (setVal(suggested ?? ""), setOpen(true))}>
        <CalendarPlus className="mr-1 h-4 w-4" /> Thêm tuần
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm tuần báo cáo</DialogTitle>
            <DialogDescription>Tuần tính từ Thứ 2 đến hết Chủ nhật. Chọn ngày Thứ 2 bắt đầu tuần.</DialogDescription>
          </DialogHeader>
          <DateInput value={val} onChange={setVal} />
          {val && !isMonday && <p className="text-xs text-red-600">Ngày này không phải Thứ 2.</p>}
          {isMonday && <p className="text-xs text-muted-foreground">Tuần {weekLabel(val)}</p>}
          <Button
            disabled={!isMonday}
            onClick={() => {
              onAdd(val);
              setOpen(false);
              toast.success("Đã thêm cột tuần — bấm vào ô để nhập số.");
            }}
          >
            Thêm cột
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Form đầy đủ của (SBU, tuần): ngân sách, mess, impression. Lead/HVM sửa thẳng trên ô của bảng. */
function WeeklyEditDialog({
  unit,
  week,
  row,
  onOpenChange,
  onDone,
}: {
  unit: AdsUnit;
  week: string;
  row: MetricRow | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const isCenter = unit.kind === "center";
  const [budget, setBudget] = React.useState(isCenter ? (row?.centerOrderBudget ?? "") : (row?.budget ?? ""));
  const [messages, setMessages] = React.useState(row?.messages ?? "");
  const [impressions, setImpressions] = React.useState(row?.impressions ?? "");
  const cpm = num(budget) != null && num(messages) ? Math.round(num(budget)! / num(messages)!) : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{unit.label}</DialogTitle>
          <DialogDescription>Tuần {weekLabel(week)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{isCenter ? "Ngân sách trung tâm order (VND)" : "Ngân sách (VND)"}</Label>
            <Input type="number" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} autoFocus />
            {num(budget) != null && <p className="text-xs text-muted-foreground">= {fmt(budget)} đ</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mess</Label>
              <Input type="number" inputMode="numeric" value={messages} onChange={(e) => setMessages(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Impression</Label>
              <Input type="number" inputMode="numeric" value={impressions} onChange={(e) => setImpressions(e.target.value)} />
            </div>
          </div>
          {cpm != null && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">
              Chi phí / mess: <b>{fmt(cpm)} đ</b>
            </p>
          )}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await upsertAdsMetricAction({
                    id: row?.id,
                    line: unit.line,
                    periodType: "week",
                    period: week,
                    sbuId: unit.sbuId,
                    ...(isCenter ? { centerOrderBudget: budget || null } : { budget: budget || null }),
                    messages: messages || null,
                    impressions: impressions || null,
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
