"use client";

import { CalendarPlus, Coins, MessageCircle, Pencil, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line as RLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { DeltaBadge, StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { upsertAdsMetricAction } from "./actions";
import { axisProps, ChartCard, ChartTooltip, gridProps, heatStyle, Sparkline } from "./charts";
import { aggregate, change, derive, fmt, fmtMoney, nextWeek, num, spendOf, weekLabel, weekShort, type MetricRow, type SbuLite } from "./shared";

type WeekMetric = "spend" | "messages" | "costPerMess";
const METRIC_LABEL: Record<WeekMetric, string> = { spend: "Ngân sách", messages: "Mess", costPerMess: "Chi phí / Mess" };
const RANGES = [4, 8, 12, 0] as const;

interface RowDef {
  key: string;
  label: string;
  /** null = dòng tổng hợp (không sửa được). */
  target: { sbuId: string | null } | null;
  pick: (rows: MetricRow[]) => MetricRow[];
  level: 0 | 1;
  strong?: boolean;
}

/**
 * Report TUẦN (sheet "Tracking Tuần") — chu kỳ Thứ 7 → hết Thứ 6, chỉ Mục 1
 * (B2C Hệ thống) + Mục 2 (B2C Trung tâm), chỉ Ngân sách + Mess (đúng phạm vi
 * dữ liệu thật, không suy ra Lead/HVM theo tuần). Xem NHIỀU tuần cùng lúc
 * để thấy xu hướng, không phải chọn từng tuần.
 */
export function WeeklyView({ metrics, sbus, canManage, weeks }: { metrics: MetricRow[]; sbus: SbuLite[]; canManage: boolean; weeks: string[] }) {
  const router = useRouter();
  const [range, setRange] = React.useState<(typeof RANGES)[number]>(8);
  const [metric, setMetric] = React.useState<WeekMetric>("spend");
  const [extraWeeks, setExtraWeeks] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<{ row: MetricRow | null; sbuId: string | null; label: string; week: string } | null>(null);

  const weekly = metrics.filter((m) => m.periodType === "week");
  const allWeeks = [...new Set([...weeks, ...extraWeeks])].sort();
  const shown = range === 0 ? allWeeks : allWeeks.slice(-range);
  const latest = allWeeks[allWeeks.length - 1];
  const prevW = allWeeks[allWeeks.length - 2];

  const inWeek = (w: string) => weekly.filter((m) => m.period === w);
  const sys = (rows: MetricRow[]) => rows.filter((m) => m.line === "b2c_system" && !m.sbuId);
  const center = (rows: MetricRow[]) => rows.filter((m) => m.line === "b2c_center");
  const d = (rows: MetricRow[]) => derive(aggregate(rows), "b2c_system");

  const rowDefs: RowDef[] = [
    { key: "total", label: "Tổng Mục 1 + Mục 2", target: null, pick: (r) => [...sys(r), ...center(r)], level: 0, strong: true },
    { key: "sys", label: "Mục 1 — B2C Hệ thống", target: { sbuId: null }, pick: sys, level: 0 },
    { key: "center", label: "Mục 2 — B2C Trung tâm", target: null, pick: center, level: 0 },
    ...sbus.map<RowDef>((s) => ({ key: s.id, label: s.code, target: { sbuId: s.id }, pick: (r) => center(r).filter((m) => m.sbuId === s.id), level: 1 })),
  ];

  const value = (rows: MetricRow[]): number | null => {
    const x = d(rows);
    return metric === "spend" ? x.spend : metric === "messages" ? x.messages : x.costPerMess;
  };

  const cur = latest ? d([...sys(inWeek(latest)), ...center(inWeek(latest))]) : null;
  const prv = prevW ? d([...sys(inWeek(prevW)), ...center(inWeek(prevW))]) : null;
  const curSys = latest ? d(sys(inWeek(latest))) : null;
  const curCenter = latest ? d(center(inWeek(latest))) : null;

  const chartData = shown.map((w) => {
    const all = d([...sys(inWeek(w)), ...center(inWeek(w))]);
    return { week: w, label: weekShort(w), m1: d(sys(inWeek(w))).spend, m2: d(center(inWeek(w))).spend, messages: all.messages, cpm: all.costPerMess };
  });

  if (allWeeks.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Chưa có số liệu tuần nào.
        {canManage && (
          <div className="mt-3">
            <AddWeekButton onAdd={(w) => setExtraWeeks((p) => [...p, w])} suggested={undefined} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Tổng chi tuần ${weekLabel(latest)}`} value={fmtMoney(cur?.spend)} icon={Coins} tone="brand" delta={change(cur?.spend, prv?.spend)} deltaGoodWhen="down" hint="vs tuần trước" />
        <StatCard label="Mess" value={fmt(cur?.messages)} icon={MessageCircle} tone="info" delta={change(cur?.messages, prv?.messages)} hint="vs tuần trước" />
        <StatCard label="Chi phí / Mess" value={fmtMoney(cur?.costPerMess)} icon={Target} delta={change(cur?.costPerMess, prv?.costPerMess)} deltaGoodWhen="down" hint="vs tuần trước" />
        <StatCard
          label="Mục 1 / Mục 2"
          value={
            <span className="text-xl">
              {fmtMoney(curSys?.spend)} <span className="text-muted-foreground">/</span> {fmtMoney(curCenter?.spend)}
            </span>
          }
          icon={Coins}
          hint={cur?.spend ? `Trung tâm chiếm ${Math.round(((curCenter?.spend ?? 0) / cur.spend) * 100)}%` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-1"
          title="Chi tiêu theo tuần"
          description="Cột chồng: Mục 1 (Hệ thống) + Mục 2 (Trung tâm)."
          legend={[
            { label: "Mục 1 — Hệ thống", color: "var(--series-1)" },
            { label: "Mục 2 — Trung tâm", color: "var(--series-2)" },
          ]}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} fmtLabel={(l) => `Tuần ${weekLabel(chartData.find((c) => c.label === l)?.week ?? "")}`} />} />
                <Bar dataKey="m1" name="Mục 1" stackId="s" fill="var(--series-1)" stroke="var(--card)" strokeWidth={1} />
                <Bar dataKey="m2" name="Mục 2" stackId="s" fill="var(--series-2)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Số mess theo tuần" description="Tổng Mục 1 + Mục 2.">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={40} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtLabel={(l) => `Tuần bắt đầu ${l}`} />} />
                <Bar dataKey="messages" name="Mess" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Chi phí trên mỗi mess" description="Càng thấp càng tốt.">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip content={<ChartTooltip fmtValue={(v) => `${fmtMoney(v)}/mess`} fmtLabel={(l) => `Tuần bắt đầu ${l}`} />} />
                <RLine type="monotone" dataKey="cpm" name="Chi phí/mess" stroke="var(--series-7)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} activeDot={{ r: 5 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="mr-auto">
            <h3 className="text-sm font-semibold">Bảng theo dõi tuần — {METRIC_LABEL[metric]}</h3>
            <p className="text-xs text-muted-foreground">
              Ô càng đậm = càng cao trong hàng{metric === "costPerMess" ? " (đỏ: chi phí cao là xấu)" : ""}. {canManage ? "Bấm vào ô để sửa số." : ""}
            </p>
          </div>
          <Segmented value={metric} onChange={setMetric} options={(Object.keys(METRIC_LABEL) as WeekMetric[]).map((k) => ({ value: k, label: METRIC_LABEL[k] }))} />
          <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r ? `${r} tuần` : "Tất cả" }))} />
          {canManage && <AddWeekButton suggested={latest ? nextWeek(latest) : undefined} onAdd={(w) => setExtraWeeks((p) => [...p, w])} />}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 min-w-48 bg-muted px-3 py-2 text-left font-medium">Mảng / SBU</th>
                {shown.map((w) => (
                  <th key={w} className="whitespace-nowrap px-2 py-2 text-right font-medium" title={weekLabel(w)}>
                    {weekLabel(w)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Δ tuần cuối</th>
                <th className="px-3 py-2 text-left font-medium">Xu hướng</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rowDefs.map((rd) => {
                const vals = shown.map((w) => value(rd.pick(inWeek(w))));
                const present = vals.filter((v): v is number => v != null);
                const min = Math.min(...present);
                const max = Math.max(...present);
                const last = vals[vals.length - 1];
                const before = vals[vals.length - 2];
                return (
                  <tr key={rd.key} className={cn("hover:bg-muted/20", rd.strong && "bg-muted/30 font-semibold")}>
                    <td className={cn("sticky left-0 z-10 bg-card px-3 py-1.5", rd.level === 1 && "pl-7 text-muted-foreground", rd.strong && "bg-muted")}>{rd.label}</td>
                    {shown.map((w, i) => {
                      const v = vals[i];
                      const editable = canManage && rd.target;
                      const src = rd.target ? rd.pick(inWeek(w))[0] ?? null : null;
                      return (
                        <td
                          key={w}
                          style={rd.strong ? undefined : heatStyle(v, min, max, metric === "costPerMess")}
                          className={cn("group whitespace-nowrap px-2 py-1.5 text-right tabular-nums", editable && "cursor-pointer hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-brand/50")}
                          onClick={() => editable && setEditing({ row: src, sbuId: rd.target!.sbuId, label: rd.label, week: w })}
                          title={src && spendOf(src) != null ? `Ngân sách ${fmt(spendOf(src))} · ${fmt(src.messages)} mess` : undefined}
                        >
                          {v == null ? (
                            <span className="text-muted-foreground/50">{editable ? <Pencil className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-60" /> : "—"}</span>
                          ) : metric === "messages" ? (
                            fmt(v)
                          ) : (
                            fmtMoney(v)
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right">{change(last, before) != null ? <DeltaBadge delta={change(last, before)!} goodWhen={metric === "messages" ? "up" : "down"} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-1.5">
                      <Sparkline values={vals} color={rd.level === 1 ? "var(--series-2)" : "var(--series-1)"} width={72} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <WeeklyEditDialog
          target={editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("whitespace-nowrap rounded-md px-2.5 py-1 transition-colors", o.value === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AddWeekButton({ suggested, onAdd }: { suggested?: string; onAdd: (week: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(suggested ?? "");
  const isSaturday = val && new Date(`${val}T00:00:00Z`).getUTCDay() === 6;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => (setVal(suggested ?? ""), setOpen(true))}>
        <CalendarPlus className="mr-1 h-4 w-4" /> Thêm tuần
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm tuần báo cáo</DialogTitle>
            <DialogDescription>Tuần tính từ Thứ 7 đến hết Thứ 6. Chọn ngày Thứ 7 bắt đầu tuần.</DialogDescription>
          </DialogHeader>
          <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} />
          {val && !isSaturday && <p className="text-xs text-red-600">Ngày này không phải Thứ 7.</p>}
          {isSaturday && <p className="text-xs text-muted-foreground">Tuần {weekLabel(val)}</p>}
          <Button
            disabled={!isSaturday}
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

function WeeklyEditDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: { row: MetricRow | null; sbuId: string | null; label: string; week: string };
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const isSystem = !target.sbuId;
  const [budget, setBudget] = React.useState(isSystem ? (target.row?.budget ?? "") : (target.row?.centerOrderBudget ?? ""));
  const [messages, setMessages] = React.useState(target.row?.messages ?? "");
  const [impressions, setImpressions] = React.useState(target.row?.impressions ?? "");
  const cpm = num(budget) != null && num(messages) ? Math.round(num(budget)! / num(messages)!) : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target.label}</DialogTitle>
          <DialogDescription>Tuần {weekLabel(target.week)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{isSystem ? "Ngân sách (VND)" : "Ngân sách trung tâm order (VND)"}</Label>
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
          {cpm != null && <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">Chi phí / mess: <b>{fmt(cpm)} đ</b></p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await upsertAdsMetricAction({
                    id: target.row?.id,
                    line: isSystem ? "b2c_system" : "b2c_center",
                    periodType: "week",
                    period: target.week,
                    sbuId: target.sbuId,
                    budget: isSystem ? budget || null : null,
                    centerOrderBudget: isSystem ? null : budget || null,
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
