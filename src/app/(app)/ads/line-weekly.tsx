"use client";

import { Coins, Target } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeltaBadge, StatCard } from "@/components/stat-card";
import { funnelDef, type AdsGroupConfig, type FunnelField } from "@/lib/ads-lines";
import { cn } from "@/lib/utils";
import { InlineNum, useMetricSaver } from "./ads-inline";
import { axisProps, ChartCard, ChartTooltip, gridProps, Sparkline } from "./charts";
import { AddWeekButton, useWeekRange } from "./weekly-view";
import { change, fmt, fmtMoney, nextWeek, num, weekLabel, weekShort, type MetricRow } from "./shared";

type RowKey = "budget" | FunnelField;

/**
 * Báo cáo TUẦN của 1 mảng KHÔNG phải B2C (B2C có bản chi tiết theo trung tâm riêng ở weekly-view). Cùng quy tắc chung:
 * tuần = Thứ 7 → hết Thứ 6; mỗi mảng nhập Ngân sách + các chỉ số tuần khai báo trong cấu hình mảng (lib/ads-lines.ts).
 * Mảng chưa báo tuần thì bảng để trống, không coi là lỗi. Số tuần và số tháng nhập riêng, không cộng dồn lẫn nhau.
 */
export function LineWeeklyView({ group, metrics, canManage }: { group: AdsGroupConfig; metrics: MetricRow[]; canManage: boolean }) {
  const saveMetric = useMetricSaver();
  const line = group.primaryLine;
  const [extraWeeks, setExtraWeeks] = React.useState<string[]>([]);

  const rows = React.useMemo(() => metrics.filter((m) => m.periodType === "week" && m.line === line), [metrics, line]);
  const dataWeeks = React.useMemo(() => [...new Set(rows.map((r) => r.period))].sort(), [rows]);
  const { options: allWeeks, shown, prevShown, rangeLabel, rangeHint, latest, picker } = useWeekRange(group.key, dataWeeks, extraWeeks);
  const rowOf = (w: string) => rows.find((r) => r.period === w) ?? null;

  const lead = group.leadField === "mql" ? "mql" : group.weeklyFields.includes("leads") ? "leads" : group.weeklyFields[0];
  const leadDef = funnelDef(group, lead);
  const fields: { key: RowKey; label: string; money: boolean }[] = [
    { key: "budget", label: "Ngân sách", money: true },
    ...group.weeklyFields.map((f) => {
      const d = funnelDef(group, f);
      return { key: f as RowKey, label: d?.label ?? f, money: d?.kind === "money" };
    }),
  ];

  const val = (w: string, k: RowKey): number | null => {
    const r = rowOf(w);
    return r ? num(r[k]) : null;
  };
  const costPerLead = (w: string) => {
    const b = val(w, "budget");
    const l = val(w, lead);
    return b != null && l ? Math.round(b / l) : null;
  };
  // Thẻ KPI = tổng cả khoảng tuần đang chọn; CP/lead = tổng chi ÷ tổng lead của khoảng (không lấy trung bình các tuần).
  const sumOver = (ws: string[], k: RowKey): number | null => ws.reduce<number | null>((acc, w) => {
    const v = val(w, k);
    return v == null ? acc : (acc ?? 0) + v;
  }, null);
  const costOver = (ws: string[]) => {
    const b = sumOver(ws, "budget");
    const l = sumOver(ws, lead);
    return b != null && l ? Math.round(b / l) : null;
  };

  if (allWeeks.length === 0 || !latest) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        {group.label} chưa có số liệu tuần nào. Báo cáo tuần áp dụng cho mọi mảng — {canManage ? "bấm “Thêm tuần” để bắt đầu nhập (tuần tính từ Thứ 7 đến hết Thứ 6)." : "chưa có ai nhập."}
        {canManage && (
          <div className="mt-3 flex justify-center">
            <AddWeekButton onAdd={(w) => setExtraWeeks((p) => [...p, w])} suggested={undefined} />
          </div>
        )}
      </div>
    );
  }

  const chartData = shown.map((w) => ({ week: w, label: weekShort(w), spend: val(w, "budget"), lead: val(w, lead) }));
  const hasPrev = prevShown.length > 0;
  const curSpend = sumOver(shown, "budget");
  const prevSpend = hasPrev ? sumOver(prevShown, "budget") : null;
  const curLead = sumOver(shown, lead);
  const prevLead = hasPrev ? sumOver(prevShown, lead) : null;
  const curCost = costOver(shown);
  const prevCost = hasPrev ? costOver(prevShown) : null;

  return (
    <div className="space-y-4">
      {picker}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={`Tổng chi ${rangeLabel}`} value={fmtMoney(curSpend)} icon={Coins} tone="brand" delta={change(curSpend, prevSpend)} deltaGoodWhen="down" hint={rangeHint} />
        <StatCard label={leadDef?.label ?? "Đầu phễu"} value={fmt(curLead)} icon={Target} tone="info" delta={change(curLead, prevLead)} hint={rangeHint} />
        <StatCard label={group.leadField === "mql" ? "CP / MQL" : "CP / Lead"} value={fmtMoney(curCost)} icon={Target} delta={change(curCost, prevCost)} deltaGoodWhen="down" hint={rangeHint} />
      </div>

      <ChartCard title="Chi tiêu theo tuần" description={`${group.label} — mỗi cột là 1 tuần (Thứ 7 → Thứ 6).`}>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} fmtLabel={(l) => `Tuần ${weekLabel(chartData.find((c) => c.label === l)?.week ?? "")}`} />} />
              <Bar dataKey="spend" name="Chi tiêu" fill={group.color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="mr-auto">
            <h3 className="text-sm font-semibold">Bảng theo dõi tuần — {group.label}</h3>
            <p className="text-xs text-muted-foreground">{canManage ? "Bấm vào ô để nhập/sửa số ngay trên bảng (Enter xuống dòng, Tab sang tuần kế)." : "Số tuần do nhân sự Marketing nhập."}</p>
          </div>
          {canManage && <AddWeekButton suggested={allWeeks.length ? nextWeek(allWeeks[allWeeks.length - 1]) : undefined} onAdd={(w) => setExtraWeeks((p) => [...p, w])} />}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 min-w-40 bg-muted px-3 py-2 text-left font-medium">Chỉ số</th>
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
              {fields.map((fd) => {
                const vals = shown.map((w) => val(w, fd.key));
                const last = vals[vals.length - 1];
                const before = vals[vals.length - 2];
                return (
                  <tr key={fd.key} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium">{fd.label}</td>
                    {shown.map((w, i) => {
                      const v = vals[i];
                      const display = v == null ? <span className="text-muted-foreground/50">{canManage ? "＋" : "—"}</span> : fd.money ? fmtMoney(v) : fmt(v);
                      return (
                        <td key={w} className={cn("whitespace-nowrap px-2 py-1.5 text-right tabular-nums")}>
                          {canManage ? (
                            <InlineNum
                              value={rowOf(w)?.[fd.key]}
                              display={display}
                              title={`Sửa ${fd.label} — tuần ${weekLabel(w)}`}
                              onSave={(val2) => saveMetric(rowOf(w), { line, periodType: "week", period: w, sbuId: null }, fd.key, val2)}
                            />
                          ) : (
                            display
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right">{change(last, before) != null ? <DeltaBadge delta={change(last, before)!} goodWhen={fd.key === "budget" ? "down" : "up"} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-1.5">
                      <Sparkline values={vals} color={group.color} width={72} />
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 text-muted-foreground">
                <td className="sticky left-0 z-10 bg-muted px-3 py-1.5 font-medium">{group.leadField === "mql" ? "CP / MQL" : "CP / Lead"}</td>
                {shown.map((w) => (
                  <td key={w} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {fmtMoney(costPerLead(w))}
                  </td>
                ))}
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
