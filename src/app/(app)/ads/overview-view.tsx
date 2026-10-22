"use client";

import { AlertOctagon, AlertTriangle, ChevronRight, Coins, Info, Target, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeltaBadge, StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import type { AdsAlert } from "./alerts";
import { PlanOverview } from "./plan-overview";
import { axisProps, ChartCard, ChartTooltip, gridProps, Sparkline } from "./charts";
import { quarterKey, quarterLabel, quarterMonths } from "./rollups";
import { change, fmt, fmtMoney, fmtPct, monthLabel, type MetricRow, type PlanRow } from "./shared";
import { bucketRows, indexRows, totalFunnel, unitFunnel, type AdsUnit, type Funnel } from "./units";

/** Khoảng thời gian đang xem ở Tổng quan: 1 tháng hoặc 1 quý (= cộng 3 dòng THÁNG; số tháng thiếu đã tự cộng từ tuần). */
export interface OverviewRange {
  kind: "month" | "quarter";
  key: string;
  label: string;
  months: string[];
  /** Kỳ liền trước để tính Δ. */
  prevLabel: string;
  prevMonths: string[];
  /** Quý còn dang dở: số tháng đã có số liệu / 3. */
  filledMonths: number;
}

/**
 * Tổng quan: số của TẤT CẢ SBU (Hệ thống, trung tâm, Ecom, VMP, VMT chung một danh sách) trong 1 tháng hoặc 1 quý.
 * Chi tiết theo nhiều kỳ nằm ở các tab Báo cáo tuần / tháng / quý.
 */
export function OverviewView({
  metrics,
  units,
  months,
  range,
  alerts,
  alertsMonthLabel,
  onOpenAlert,
  plans,
  onOpenPlan,
}: {
  metrics: MetricRow[];
  units: AdsUnit[];
  /** Mọi tháng đã có số liệu. */
  months: string[];
  range: OverviewRange;
  alerts: AdsAlert[];
  alertsMonthLabel: string;
  onOpenAlert: (alert: AdsAlert) => void;
  plans: PlanRow[];
  onOpenPlan: () => void;
}) {
  const isQuarter = range.kind === "quarter";
  const idx = React.useMemo(() => indexRows(metrics), [metrics]);
  const rowsIn = React.useCallback((ms: string[]) => bucketRows(idx, "month", ms), [idx]);
  const cur = totalFunnel(rowsIn(range.months));
  const old = totalFunnel(rowsIn(range.prevMonths));

  // Các "cột" của biểu đồ/xu hướng: tháng, hoặc quý khi xem theo quý.
  const buckets = React.useMemo(() => {
    const sorted = [...new Set([...months, ...range.months])].sort();
    if (!isQuarter) return sorted.map((p) => ({ key: p, label: monthLabel(p, true), months: [p] }));
    const qs = [...new Set(sorted.map(quarterKey))].sort();
    return qs.map((q) => ({ key: q, label: `${quarterLabel(q, true)}/${q.slice(2, 4)}`, months: quarterMonths(q) }));
  }, [months, range.months, isQuarter]);

  const trend = buckets.map((b) => ({ period: b.key, label: b.label, spend: totalFunnel(rowsIn(b.months)).spend }));

  const curRows = rowsIn(range.months);
  const shares = units
    .map((u) => ({ u, spend: unitFunnel(curRows, u).spend ?? 0 }))
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.spend - a.spend);
  const shareTotal = shares.reduce((s, x) => s + x.spend, 0);

  const crit = alerts.filter((a) => a.level === "crit").length;
  const warn = alerts.filter((a) => a.level === "warn").length;

  const sparkBuckets = buckets.slice(isQuarter ? -4 : -6);
  const vs = `vs ${range.prevLabel}`;
  // Tháng đang chạy / chưa đủ tuần: số tự cộng từ các tuần là LŨY KẾ — nhắc để không đọc % thay đổi như cả tháng.
  const partial = [...new Set(curRows.filter((r) => r.derivedWeeks).map((r) => r.derivedWeeks!))].filter((w) => {
    const [a, b] = w.split("/").map(Number);
    return a < b;
  });
  const prevRows = rowsIn(range.prevMonths);

  return (
    <div className="space-y-4">
      {isQuarter && range.filledMonths < 3 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {range.label} mới có số liệu {range.filledMonths}/3 tháng — tổng và % thay đổi so với {range.prevLabel} chưa phản ánh đủ quý.
        </div>
      )}

      {partial.length > 0 && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-300">
          {range.label} có số <b>tạm tính lũy kế từ các tuần</b> (đã có {partial.join(", ")} tuần của tháng) — chưa phản ánh đủ tháng, nên % thay đổi so với {range.prevLabel} chưa so sánh được ngang bằng.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label={`Tổng chi ${range.label}`} value={fmtMoney(cur.spend)} icon={Coins} tone="brand" delta={change(cur.spend, old.spend)} deltaGoodWhen="down" hint={vs} />
        <StatCard label="Lead / Data" value={fmt(cur.leads)} icon={Users} tone="info" delta={change(cur.leads, old.leads)} hint={vs} />
        <StatCard label="Học viên mới" value={fmt(cur.hvm)} icon={UserPlus} tone="ok" delta={change(cur.hvm, old.hvm)} hint={vs} />
        <StatCard label="CPL bình quân" value={fmtMoney(cur.cpl)} icon={Target} delta={change(cur.cpl, old.cpl)} deltaGoodWhen="down" hint="Tổng chi ÷ tổng lead" />
        <StatCard
          label="Cảnh báo"
          value={alerts.length}
          icon={AlertTriangle}
          tone={crit ? "crit" : warn ? "warn" : "ok"}
          hint={alerts.length ? `${crit} nghiêm trọng · ${warn} cần xem` : "Mọi chỉ số ổn"}
        />
      </div>

      <PlanOverview units={units} metrics={metrics} plans={plans} range={range} onOpenPlan={onOpenPlan} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartCard title={isQuarter ? "Tổng chi theo quý" : "Tổng chi theo tháng"} description={`Tổng chi digital mọi SBU mỗi ${isQuarter ? "quý" : "tháng"}. Chi tiết từng SBU ở tab Báo cáo ${isQuarter ? "quý" : "tháng"}.`}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={56} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} />} />
                <Bar dataKey="spend" name="Tổng chi" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={`Cơ cấu chi ${range.label}`} description={`Tổng ${fmtMoney(shareTotal)}`}>
          {shares.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Chưa có số liệu {isQuarter ? "quý" : "tháng"} này.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {shares.map((s) => (
                  <li key={s.u.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium" title={s.u.label}>
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.u.color }} />
                        {s.u.code}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtMoney(s.spend)} · <b className="text-foreground">{Math.round((s.spend / shareTotal) * 100)}%</b>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${(s.spend / shares[0].spend) * 100}%`, background: s.u.color }} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm font-semibold">
                <span>Tổng cộng</span>
                <span className="tabular-nums">{fmtMoney(shareTotal)} · 100%</span>
              </div>
            </>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <header className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">So sánh các SBU — {range.label}</h3>
            <p className="text-xs text-muted-foreground">
              Δ so với {range.prevLabel}. Chi phí tăng tô đỏ, giảm tô xanh. Dòng Hệ thống mang Lead/HVM tổng cả B2C (CPL/CAC chia tổng ngân sách B2C); Lead/HVM của từng trung tâm là phần quy riêng cho ads trung tâm. Ecom: MQL tính là lead. Cột cuối: xu hướng chi {isQuarter ? "4 quý" : "6 tháng"}.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">SBU</th>
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
                {units.map((u) => {
                  const d = unitFunnel(curRows, u);
                  const p = unitFunnel(prevRows, u);
                  const spark = sparkBuckets.map((b) => unitFunnel(rowsIn(b.months), u).spend);
                  return <AggRow key={u.key} label={u.code} title={u.label} color={u.color} d={d} p={p} spark={spark} />;
                })}
              </tbody>
              <tfoot className="border-t-2 bg-muted/40 font-semibold">
                <AggRow label="Tổng cộng" d={cur} p={old} spark={sparkBuckets.map((b) => totalFunnel(rowsIn(b.months)).spend)} total />
              </tfoot>
            </table>
          </div>
        </section>

        <AlertsPanel alerts={alerts} onOpenTab={onOpenAlert} subtitle={`Rà theo ${alertsMonthLabel}: ngưỡng hiệu quả, biến động chi phí, giải ngân.`} />
      </div>
    </div>
  );
}

function AggRow({ label, title, color, d, p, spark, total }: { label: string; title?: string; color?: string; d: Funnel; p: Funnel; spark: (number | null)[]; total?: boolean }) {
  return (
    <tr className={cn(!total && "hover:bg-muted/30")}>
      <td className="px-3 py-2" title={title}>
        <span className="flex items-center gap-2 font-medium">
          {color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />}
          {label}
        </span>
      </td>
      <Num value={fmtMoney(d.spend)} delta={change(d.spend, p.spend)} good="down" />
      <Num value={fmt(d.leads)} delta={change(d.leads, p.leads)} good="up" />
      <Num value={fmt(d.hvm)} delta={change(d.hvm, p.hvm)} good="up" />
      <Num value={fmtMoney(d.cpl)} delta={change(d.cpl, p.cpl)} good="down" />
      <Num value={fmtMoney(d.cac)} delta={change(d.cac, p.cac)} good="down" />
      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(d.cvr)}</td>
      <td className="px-3 py-2">
        <Sparkline values={spark} color={color ?? "var(--foreground)"} />
      </td>
    </tr>
  );
}

function Num({ value, delta, good, muted }: { value: string; delta: number | null; good: "up" | "down"; muted?: boolean }) {
  return (
    <td className={cn("px-3 py-2 text-right", muted && "py-1.5 text-xs")}>
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

export function AlertsPanel({ alerts, onOpenTab, className, subtitle }: { alerts: AdsAlert[]; onOpenTab?: (alert: AdsAlert) => void; className?: string; subtitle?: string }) {
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? alerts : alerts.slice(0, 8);
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Cảnh báo tự động</h3>
          <p className="text-xs text-muted-foreground">{subtitle ?? "Rà theo ngưỡng hiệu quả, biến động chi phí, giải ngân."}</p>
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
                <button type="button" onClick={() => onOpenTab?.(a)} className="group flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
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
