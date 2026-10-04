"use client";

import { AlertOctagon, AlertTriangle, ChevronRight, Coins, Info, Target, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeltaBadge, StatCard } from "@/components/stat-card";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { cn } from "@/lib/utils";
import type { AdsAlert } from "./alerts";
import { axisProps, ChartCard, ChartTooltip, gridProps, Sparkline } from "./charts";
import {
  aggregate,
  change,
  derive,
  fmt,
  fmtMoney,
  fmtPct,
  LINE_COLORS,
  LINE_LABELS,
  LINES,
  monthLabel,
  prevMonth,
  type Line,
  type MetricRow,
} from "./shared";

export function OverviewView({
  metrics,
  months,
  month,
  rubric,
  alerts,
  onOpenTab,
}: {
  metrics: MetricRow[];
  months: string[];
  month: string;
  rubric: EffectivenessRubric;
  alerts: AdsAlert[];
  onOpenTab: (tab: AdsAlert["tab"]) => void;
}) {
  const monthly = metrics.filter((m) => m.periodType === "month");
  const prev = prevMonth(month);
  const of = (p: string, line?: Line) => monthly.filter((m) => m.period === p && (!line || m.line === line));

  // Tổng toàn phòng: CPL/CAC chỉ tính trên các mảng CÓ số lead/HVM (tránh chia chi phí mảng chưa nhập lead).
  const total = (p: string) => {
    const rows = of(p);
    const all = aggregate(rows);
    const withLeads = aggregate(rows.filter((r) => r.leads != null));
    const withHvm = aggregate(rows.filter((r) => r.newStudents != null));
    return {
      spend: all.spend,
      leads: all.leads,
      newStudents: all.newStudents,
      cpl: withLeads.spend != null && withLeads.leads ? withLeads.spend / withLeads.leads : null,
      cac: withHvm.spend != null && withHvm.newStudents ? withHvm.spend / withHvm.newStudents : null,
    };
  };
  const cur = total(month);
  const old = total(prev);

  const trend = months
    .slice()
    .sort()
    .map((p) => {
      const row: Record<string, number | string | null> = { period: p, label: monthLabel(p, true) };
      for (const l of LINES) row[l] = aggregate(of(p, l)).spend;
      return row;
    });

  const shares = LINES.map((l) => ({ line: l, label: LINE_LABELS[l], spend: aggregate(of(month, l)).spend ?? 0 }))
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.spend - a.spend);
  const shareTotal = shares.reduce((s, x) => s + x.spend, 0);

  const crit = alerts.filter((a) => a.level === "crit").length;
  const warn = alerts.filter((a) => a.level === "warn").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label={`Tổng chi ${monthLabel(month)}`} value={fmtMoney(cur.spend)} icon={Coins} tone="brand" delta={change(cur.spend, old.spend)} deltaGoodWhen="down" hint={`vs ${monthLabel(prev, true)}`} />
        <StatCard label="Lead / Data" value={fmt(cur.leads)} icon={Users} tone="info" delta={change(cur.leads, old.leads)} hint={`vs ${monthLabel(prev, true)}`} />
        <StatCard label="Học viên mới" value={fmt(cur.newStudents)} icon={UserPlus} tone="ok" delta={change(cur.newStudents, old.newStudents)} hint={`vs ${monthLabel(prev, true)}`} />
        <StatCard label="CPL bình quân" value={fmtMoney(cur.cpl)} icon={Target} delta={change(cur.cpl, old.cpl)} deltaGoodWhen="down" hint="chỉ mảng có số lead" />
        <StatCard
          label="Cảnh báo"
          value={alerts.length}
          icon={AlertTriangle}
          tone={crit ? "crit" : warn ? "warn" : "ok"}
          hint={alerts.length ? `${crit} nghiêm trọng · ${warn} cần xem` : "Mọi chỉ số ổn"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard
          title="Chi tiêu theo tháng, tách theo mảng"
          description="Cột chồng = tổng chi digital mỗi tháng. Rê chuột để xem từng mảng."
          legend={LINES.map((l) => ({ label: LINE_LABELS[l], color: LINE_COLORS[l] }))}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={56} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} fmtLabel={(l) => `Tháng ${l.slice(1)}`} />} />
                {LINES.map((l, i) => (
                  <Bar key={l} dataKey={l} name={LINE_LABELS[l]} stackId="spend" fill={LINE_COLORS[l]} stroke="var(--card)" strokeWidth={1} radius={i === LINES.length - 1 ? [4, 4, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={`Cơ cấu chi ${monthLabel(month)}`} description={`Tổng ${fmtMoney(shareTotal)}`}>
          {shares.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Chưa có số liệu tháng này.</p>
          ) : (
            <ul className="space-y-3">
              {shares.map((s) => (
                <li key={s.line}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LINE_COLORS[s.line] }} />
                      {s.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtMoney(s.spend)} · <b className="text-foreground">{Math.round((s.spend / shareTotal) * 100)}%</b>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(s.spend / shares[0].spend) * 100}%`, background: LINE_COLORS[s.line] }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <header className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">So sánh các mảng — {monthLabel(month)}</h3>
            <p className="text-xs text-muted-foreground">Δ so với {monthLabel(prev)}. Chi phí tăng tô đỏ, giảm tô xanh. Cột cuối: xu hướng chi 6 tháng.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mảng</th>
                  <th className="px-3 py-2 text-right font-medium">Chi tiêu</th>
                  <th className="px-3 py-2 text-right font-medium">Lead</th>
                  <th className="px-3 py-2 text-right font-medium">HVM</th>
                  <th className="px-3 py-2 text-right font-medium">CPL</th>
                  <th className="px-3 py-2 text-right font-medium">CAC</th>
                  <th className="px-3 py-2 text-right font-medium">CVR</th>
                  <th className="px-3 py-2 text-left font-medium">Xu hướng chi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {LINES.map((l) => {
                  const d = derive(aggregate(of(month, l)), l, rubric);
                  const p = derive(aggregate(of(prev, l)), l, rubric);
                  const spark = months.slice().sort().slice(-6).map((m) => aggregate(of(m, l)).spend);
                  return (
                    <tr key={l} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LINE_COLORS[l] }} />
                          {LINE_LABELS[l]}
                        </span>
                      </td>
                      <Num value={fmtMoney(d.spend)} delta={change(d.spend, p.spend)} good="down" />
                      <Num value={fmt(d.leads)} delta={change(d.leads, p.leads)} good="up" />
                      <Num value={fmt(d.newStudents)} delta={change(d.newStudents, p.newStudents)} good="up" />
                      <Num value={fmtMoney(d.cpl)} delta={change(d.cpl, p.cpl)} good="down" />
                      <Num value={fmtMoney(d.cac)} delta={change(d.cac, p.cac)} good="down" />
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(d.cvr)}</td>
                      <td className="px-3 py-2">
                        <Sparkline values={spark} color={LINE_COLORS[l]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <AlertsPanel alerts={alerts} onOpenTab={onOpenTab} />
      </div>
    </div>
  );
}

function Num({ value, delta, good }: { value: string; delta: number | null; good: "up" | "down" }) {
  return (
    <td className="px-3 py-2 text-right">
      <div className="tabular-nums">{value}</div>
      {delta != null && <DeltaBadge delta={delta} goodWhen={good} className="mt-0.5" />}
    </td>
  );
}

const ALERT_STYLE = {
  crit: { icon: AlertOctagon, cls: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Nghiêm trọng" },
  warn: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", label: "Cần xem" },
  info: { icon: Info, cls: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10", label: "Thiếu dữ liệu" },
} as const;

export function AlertsPanel({ alerts, onOpenTab, className }: { alerts: AdsAlert[]; onOpenTab?: (tab: AdsAlert["tab"]) => void; className?: string }) {
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? alerts : alerts.slice(0, 8);
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Cảnh báo tự động</h3>
          <p className="text-xs text-muted-foreground">Rà theo ngưỡng hiệu quả, biến động chi phí, giải ngân.</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{alerts.length}</span>
      </header>
      {alerts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Không có cảnh báo nào. 👍</p>
      ) : (
        <ul className="max-h-[420px] flex-1 divide-y overflow-y-auto">
          {shown.map((a, i) => {
            const st = ALERT_STYLE[a.level];
            const Icon = st.icon;
            return (
              <li key={i}>
                <button type="button" onClick={() => onOpenTab?.(a.tab)} className="group flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
                  <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", st.bg, st.cls)} title={st.label}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">{a.detail}</span>
                  </span>
                  {onOpenTab && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {alerts.length > 8 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="border-t px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          {showAll ? "Thu gọn" : `Xem thêm ${alerts.length - 8} cảnh báo`}
        </button>
      )}
    </section>
  );
}
