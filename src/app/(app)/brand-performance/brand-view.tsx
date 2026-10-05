"use client";

import { Eye, Heart, Link2, Megaphone, Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { ExportMenu } from "@/components/report/export-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/simple-select";
import { appliesTo, CHANNELS, CHANNEL_SHORT, clickRate, engagementRate, followerGrowth, METRICS, periodLabel, prevPeriod, sumValues, valuesOf, type BrandPerfRow, type MetricKey, type MetricValues } from "@/lib/brand-perf";
import { SERIES_COLORS } from "@/lib/reports/types";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";
import { InlineNum } from "../ads/ads-inline";
import { MonthPicker } from "../ads/ads-ui";
import { axisProps, ChartCard, ChartTooltip, gridProps } from "../ads/charts";
import { change, fmt } from "../ads/shared";
import { addBrandChannelAction, removeBrandChannelAction, setBrandPerfValueAction } from "./actions";

interface Brand {
  id: string;
  code: string;
  name: string;
}
interface Channel {
  id: string;
  sbuId: string;
  channel: string;
  label: string | null;
  url: string | null;
}

const pct = (v: number | null, d = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
const compact = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}K` : String(Math.round(v)));

export function BrandPerformanceView({ brands, channels, metrics, canEdit, currentMonth }: { brands: Brand[]; channels: Channel[]; metrics: BrandPerfRow[]; canEdit: boolean; currentMonth: string }) {
  const router = useRouter();
  const months = React.useMemo(() => [...new Set(metrics.map((m) => m.period))].sort(), [metrics]);
  const [period, setPeriod] = useSessionState<string>("brandperf:period", months.at(-1) ?? currentMonth);
  const prev = prevPeriod(period);

  const chOf = React.useCallback((sbuId: string) => channels.filter((c) => c.sbuId === sbuId), [channels]);
  const valsOf = React.useCallback(
    (sbuId: string, channel: string | null, p: string): MetricValues =>
      sumValues(metrics.filter((m) => m.sbuId === sbuId && m.period === p && (channel == null || m.channel === channel)).map((r) => valuesOf(r))),
    [metrics],
  );
  const brandTotal = React.useCallback((sbuId: string, p: string) => sumValues(chOf(sbuId).map((c) => valsOf(sbuId, c.channel, p))), [chOf, valsOf]);
  const grand = React.useCallback((p: string) => sumValues(brands.map((b) => brandTotal(b.id, p))), [brands, brandTotal]);
  const cur = grand(period);
  const old = grand(prev);

  const saveCell = React.useCallback(
    async (sbuId: string, channel: string, metric: MetricKey, value: string | null) => {
      const res = await setBrandPerfValueAction({ sbuId, channel, period, metric, value: value == null ? null : Number(value) });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [period, router],
  );

  // Biểu đồ xu hướng: tối đa 6 tháng kết thúc ở tháng đang xem.
  const trendMonths = React.useMemo(() => [...new Set([...months, period])].filter((p) => p <= period).sort().slice(-6), [months, period]);
  const activeBrands = brands.filter((b) => chOf(b.id).length > 0);
  const imprTrend = trendMonths.map((p) => {
    const row: Record<string, number | string | null> = { label: periodLabel(p) };
    for (const b of activeBrands) row[b.code] = brandTotal(b.id, p).impressions ?? null;
    return row;
  });
  const folTrend = trendMonths.map((p) => {
    const row: Record<string, number | string | null> = { label: periodLabel(p) };
    for (const b of activeBrands) row[b.code] = brandTotal(b.id, p).followers ?? null;
    return row;
  });
  const legend = activeBrands.map((b, i) => ({ label: b.name, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  const vs = `vs ${periodLabel(prev)}`;

  const noChannels = channels.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <span className="px-1 text-sm text-muted-foreground">Tháng báo cáo</span>
        <MonthPicker months={months} value={period} onChange={setPeriod} />
        <span className="text-xs text-muted-foreground">Số liệu nhập hằng tháng từ công cụ của từng kênh (Meta Business Suite, TikTok Studio, YouTube Studio, GA…).</span>
        <div className="ml-auto">
          <ExportMenu kind="brand" period={period} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Impression" value={fmt(cur.impressions)} icon={Eye} tone="brand" delta={change(cur.impressions, old.impressions)} hint={vs} />
        <StatCard label="Engagement" value={fmt(cur.engagements)} icon={Heart} tone="info" delta={change(cur.engagements, old.engagements)} hint={`ER ${pct(engagementRate(cur))} · ${vs}`} />
        <StatCard label="Follower (cộng các kênh)" value={fmt(cur.followers)} icon={UserPlus} tone="ok" delta={change(cur.followers, old.followers)} hint={`+${fmt(cur.newFollowers)} trong tháng`} />
        <StatCard label="Bài đăng" value={fmt(cur.posts)} icon={Megaphone} delta={change(cur.posts, old.posts)} hint={vs} />
      </div>

      {noChannels && (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa brand nào có kênh. Bấm <b>“+ Thêm kênh”</b> ở từng brand bên dưới để khai báo hệ thống kênh riêng của brand (Meta, TikTok, YouTube, Website, Zalo…), rồi nhập số liệu tháng.
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Ma trận Brand × Kênh — {periodLabel(period)}</h3>
          <p className="text-xs text-muted-foreground">
            Ô “–” = chỉ số không áp dụng cho kênh. {canEdit ? "Bấm vào ô để nhập (Enter xuống dòng, Tab sang ô kế). " : ""}ER = Engagement ÷ Impression · Follower là số cuối tháng.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 min-w-56 bg-muted px-3 py-2 text-left font-medium">Brand / kênh</th>
                {METRICS.slice(0, 3).map((m) => (
                  <th key={m.key} className="px-2 py-2 text-right font-medium" title={m.hint}>
                    {m.short}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium" title="Engagement ÷ Impression">
                  ER
                </th>
                {METRICS.slice(3).map((m) => (
                  <th key={m.key} className="px-2 py-2 text-right font-medium" title={m.hint}>
                    {m.short}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium" title="Impression so với tháng trước">
                  Δ Impr.
                </th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b, bi) => {
                const chs = chOf(b.id);
                const t = brandTotal(b.id, period);
                const tp = brandTotal(b.id, prev);
                const free = CHANNELS.filter((c) => !chs.some((x) => x.channel === c.key));
                return (
                  <React.Fragment key={b.id}>
                    <tr className="border-t-2 bg-muted/30">
                      <td className="sticky left-0 z-10 bg-muted/60 px-3 py-2 font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-1 rounded-full" style={{ background: SERIES_COLORS[bi % SERIES_COLORS.length] }} />
                          {b.name}
                          {canEdit && <AddChannel sbuId={b.id} free={free.map((c) => ({ value: c.key, label: c.label }))} />}
                        </span>
                      </td>
                      {chs.length === 0 ? (
                        <td colSpan={METRICS.length + 2} className="px-3 py-2 text-xs font-normal text-muted-foreground">
                          Chưa khai báo kênh cho brand này.
                        </td>
                      ) : (
                        <TotalCells v={t} p={tp} />
                      )}
                    </tr>
                    {chs.map((c) => {
                      const v = valsOf(b.id, c.channel, period);
                      const p = valsOf(b.id, c.channel, prev);
                      const meta = CHANNELS.find((x) => x.key === c.channel);
                      return (
                        <tr key={c.id} className="border-t hover:bg-muted/20">
                          <td className="sticky left-0 z-10 bg-card px-3 py-1.5 pl-8">
                            <span className="group inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: meta?.color ?? "#64748b" }} />
                              <span className="font-medium">{CHANNEL_SHORT[c.channel] ?? c.channel}</span>
                              {c.label && <span className="text-xs text-muted-foreground">{c.label}</span>}
                              {c.url && (
                                <a href={c.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Mở kênh">
                                  <Link2 className="h-3 w-3" />
                                </a>
                              )}
                              {canEdit && <RemoveChannel id={c.id} name={`${b.name} · ${CHANNEL_SHORT[c.channel] ?? c.channel}`} />}
                            </span>
                          </td>
                          {METRICS.slice(0, 3).map((m) => (
                            <MetricCell key={m.key} channel={c.channel} metric={m.key} value={v[m.key]} canEdit={canEdit} onSave={(val) => saveCell(b.id, c.channel, m.key, val)} />
                          ))}
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(engagementRate(v))}</td>
                          {METRICS.slice(3).map((m) => (
                            <MetricCell key={m.key} channel={c.channel} metric={m.key} value={v[m.key]} canEdit={canEdit} onSave={(val) => saveCell(b.id, c.channel, m.key, val)} />
                          ))}
                          <Delta cur={v.impressions} prev={p.impressions} />
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            {!noChannels && (
              <tfoot className="border-t-2 bg-muted/40 font-semibold">
                <tr>
                  <td className="sticky left-0 z-10 bg-muted px-3 py-2">Toàn hệ thống</td>
                  <TotalCells v={cur} p={old} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {activeBrands.length > 0 && months.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Impression theo tháng" description="Cột chồng: tổng Impression mỗi tháng, tách theo brand." legend={legend}>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={imprTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={46} tickFormatter={compact} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmt(v)} />} />
                  {activeBrands.map((b, i) => (
                    <Bar key={b.id} dataKey={b.code} name={b.name} stackId="i" fill={SERIES_COLORS[i % SERIES_COLORS.length]} stroke="var(--card)" strokeWidth={1} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard title="Follower cuối tháng" description="Tổng follower các kênh của từng brand." legend={legend}>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={folTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={46} tickFormatter={compact} />
                  <Tooltip content={<ChartTooltip fmtValue={(v) => fmt(v)} />} />
                  {activeBrands.map((b, i) => (
                    <Line key={b.id} type="monotone" dataKey={b.code} name={b.name} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function MetricCell({ channel, metric, value, canEdit, onSave }: { channel: string; metric: MetricKey; value: number | null | undefined; canEdit: boolean; onSave: (v: string | null) => Promise<unknown> }) {
  if (!appliesTo(channel, metric)) return <td className="px-2 py-1.5 text-right text-muted-foreground/30">–</td>;
  return (
    <td className="px-2 py-1.5 text-right tabular-nums">
      <InlineNum disabled={!canEdit} value={value} display={value == null ? <span className="text-muted-foreground/50">{canEdit ? "＋" : "—"}</span> : fmt(value)} onSave={onSave} title={`Nhập ${METRICS.find((m) => m.key === metric)?.label}`} />
    </td>
  );
}

function Delta({ cur, prev }: { cur: number | null | undefined; prev: number | null | undefined }) {
  const d = change(cur ?? null, prev ?? null);
  return <td className={cn("px-2 py-1.5 text-right text-xs tabular-nums", d == null ? "text-muted-foreground/40" : d >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{d == null ? "—" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}</td>;
}

function TotalCells({ v, p }: { v: MetricValues; p: MetricValues }) {
  const cell = (x: number | null | undefined) => <td className="px-2 py-2 text-right tabular-nums">{x == null ? <span className="text-muted-foreground/40">—</span> : fmt(x)}</td>;
  return (
    <>
      {METRICS.slice(0, 3).map((m) => (
        <React.Fragment key={m.key}>{cell(v[m.key])}</React.Fragment>
      ))}
      <td className="px-2 py-2 text-right tabular-nums">{pct(engagementRate(v))}</td>
      {METRICS.slice(3).map((m) => (
        <React.Fragment key={m.key}>{cell(v[m.key])}</React.Fragment>
      ))}
      <Delta cur={v.impressions} prev={p.impressions} />
    </>
  );
}

function AddChannel({ sbuId, free }: { sbuId: string; free: { value: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [pending, start] = React.useTransition();
  if (free.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground" />}>
        <Plus className="h-3 w-3" /> Thêm kênh
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="space-y-2 font-normal">
          <div className="space-y-1">
            <Label className="text-xs">Kênh</Label>
            <SimpleSelect value={channel} onValueChange={(v) => setChannel(v ?? "")} placeholder="Chọn kênh" options={free} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tên hiển thị (tuỳ chọn)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="vd. Fanpage VMG IELTS" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Link kênh (tuỳ chọn)</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8" />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={pending || !channel}
            onClick={() =>
              start(async () => {
                const res = await addBrandChannelAction({ sbuId, channel, label: label || null, url: url || null });
                if (res.ok) {
                  toast.success("Đã thêm kênh.");
                  setOpen(false);
                  setChannel("");
                  setLabel("");
                  setUrl("");
                  router.refresh();
                } else toast.error(res.error);
              })
            }
          >
            Thêm kênh
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RemoveChannel({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Bỏ kênh khỏi ma trận (số liệu đã nhập được giữ lại)"
      className="rounded p-0.5 text-muted-foreground/0 hover:text-red-600 group-hover:text-muted-foreground"
      onClick={() => {
        if (!window.confirm(`Bỏ kênh “${name}” khỏi ma trận?\n\nSố liệu các tháng đã nhập được giữ lại — thêm lại kênh sẽ thấy lại.`)) return;
        start(async () => {
          const res = await removeBrandChannelAction(id);
          if (res.ok) router.refresh();
          else toast.error(res.error);
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// Giữ tham chiếu cho các hàm suy ra dùng ở báo cáo/tooltip sau này.
void clickRate;
void followerGrowth;
