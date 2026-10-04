"use client";

import { Coins, Megaphone, Pencil, Percent, Plus, Target, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line as RLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { cn } from "@/lib/utils";
import { upsertAdsMetricAction } from "./actions";
import { CampaignsDialog } from "./campaigns-dialog";
import { axisProps, ChartCard, ChartTooltip, gridProps, heatStyle } from "./charts";
import {
  aggregate,
  change,
  conversionLabel,
  derive,
  EFFECTIVENESS_TONE,
  fmt,
  fmtMoney,
  fmtPct,
  LINE_COLORS,
  LINE_LABELS,
  LINES,
  monthLabel,
  prevMonth,
  type AggDerived,
  type CampaignRow,
  type Line,
  type MetricRow,
  type SbuLite,
} from "./shared";
import { Segmented } from "./weekly-view";

type PivotMetric = "spend" | "leads" | "newStudents" | "cpl" | "cac" | "effectivenessScore";
const PIVOT_LABEL: Record<PivotMetric, string> = { spend: "Tổng NS", leads: "Lead", newStudents: "HVM", cpl: "CPL", cac: "CAC", effectivenessScore: "Điểm HQ" };
/** Chỉ số mà giá trị CAO là XẤU (tô đỏ). */
const BAD_WHEN_HIGH: PivotMetric[] = ["spend", "cpl", "cac"];

/**
 * Report THÁNG — đủ 6 mảng, đủ CPL/CAC/CVR/điểm hiệu quả. Xem 1 tháng chi tiết
 * nhưng LUÔN kèm xu hướng nhiều tháng (biểu đồ + bảng nhiệt) để so sánh.
 */
export function MonthlyView({
  metrics,
  sbus,
  campaigns,
  canManage,
  months,
  month,
  onMonthChange,
  rubric,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  canManage: boolean;
  months: string[];
  month: string;
  onMonthChange: (m: string) => void;
  rubric: EffectivenessRubric;
}) {
  const router = useRouter();
  const [line, setLine] = React.useState<Line>("b2c_center");
  const [editing, setEditing] = React.useState<{ row: MetricRow | null; sbuId: string | null; label: string } | null>(null);
  const [campaignsFor, setCampaignsFor] = React.useState<{ sbuId: string; period: string } | null>(null);

  const monthly = metrics.filter((m) => m.periodType === "month" && m.line === line);
  const of = (p: string, sbuId?: string) => monthly.filter((m) => m.period === p && (sbuId === undefined || m.sbuId === sbuId));
  const der = (rows: MetricRow[]) => derive(aggregate(rows), line, rubric);
  const lineMonths = [...new Set([...monthly.map((m) => m.period), month])].sort();
  const cur = der(of(month));
  const prv = der(of(prevMonth(month)));
  const conv = conversionLabel(line);

  const trend = lineMonths.map((p) => {
    const x = der(of(p));
    return { period: p, label: monthLabel(p, true), spend: x.spend, leads: x.leads, newStudents: x.newStudents, cpl: x.cpl, cac: x.cac };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <div className="flex flex-wrap gap-1">
          {LINES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLine(l)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                l === line ? "bg-foreground/[0.06] font-medium text-foreground ring-1 ring-foreground/10" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LINE_COLORS[l] }} />
              {LINE_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <MonthPicker months={months} value={month} onChange={onMonthChange} />
          {canManage && line !== "b2c_center" && (
            <Button size="sm" onClick={() => setEditing({ row: of(month)[0] ?? null, sbuId: null, label: LINE_LABELS[line] })}>
              {of(month)[0] ? <Pencil className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
              {of(month)[0] ? "Sửa số liệu" : "Nhập số liệu"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={`Chi tiêu ${monthLabel(month)}`} value={fmtMoney(cur.spend)} icon={Coins} tone="brand" delta={change(cur.spend, prv.spend)} deltaGoodWhen="down" />
        <StatCard label="Lead / Data" value={fmt(cur.leads)} icon={Users} tone="info" delta={change(cur.leads, prv.leads)} />
        <StatCard label={conv} value={fmt(cur.newStudents)} icon={UserPlus} tone="ok" delta={change(cur.newStudents, prv.newStudents)} />
        <StatCard label="CPL" value={fmtMoney(cur.cpl)} icon={Target} delta={change(cur.cpl, prv.cpl)} deltaGoodWhen="down" />
        <StatCard label="CAC" value={fmtMoney(cur.cac)} icon={Target} delta={change(cur.cac, prv.cac)} deltaGoodWhen="down" />
        <StatCard label={`CVR Lead → ${conv}`} value={fmtPct(cur.cvr)} icon={Percent} hint={<EffBadge label={cur.effectivenessLabel} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Chi tiêu theo tháng" description={LINE_LABELS[line]}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} />} />
                <Bar dataKey="spend" name="Chi tiêu" fill={LINE_COLORS[line]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title={`Lead & ${conv}`}
          description="Số lượng mỗi tháng."
          legend={[
            { label: "Lead", color: "var(--series-1)" },
            { label: conv, color: "var(--series-3)" },
          ]}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={36} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip />} />
                <Bar dataKey="leads" name="Lead" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="newStudents" name={conv} fill="var(--series-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="CPL & CAC"
          description="Càng thấp càng tốt. Nét đứt = CAC."
          legend={[
            { label: "CPL", color: "var(--series-7)" },
            { label: "CAC", color: "var(--series-8)", dashed: true },
          ]}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} />} />
                <RLine type="monotone" dataKey="cpl" name="CPL" stroke="var(--series-7)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
                <RLine type="monotone" dataKey="cac" name="CAC" stroke="var(--series-8)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {line === "b2c_center" ? (
        <>
          <CenterDetailTable
            sbus={sbus}
            month={month}
            rows={(id) => of(month, id)}
            prevRows={(id) => of(prevMonth(month), id)}
            der={der}
            canManage={canManage}
            onEdit={(sbu) => setEditing({ row: of(month, sbu.id)[0] ?? null, sbuId: sbu.id, label: sbu.code })}
            onCampaigns={(sbuId) => setCampaignsFor({ sbuId, period: month })}
          />
          <CenterPivot sbus={sbus} months={lineMonths} rows={of} der={der} onPickMonth={onMonthChange} activeMonth={month} />
        </>
      ) : (
        <LineMonthTable months={lineMonths} rows={of} der={der} line={line} activeMonth={month} onPickMonth={onMonthChange} canManage={canManage} onEdit={(p) => (onMonthChange(p), setEditing({ row: of(p)[0] ?? null, sbuId: null, label: LINE_LABELS[line] }))} />
      )}

      {editing && (
        <MetricEditDialog
          key={`${editing.sbuId}-${month}-${line}`}
          target={editing}
          line={line}
          period={month}
          rubric={rubric}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {campaignsFor && (
        <CampaignsDialog
          sbuId={campaignsFor.sbuId}
          sbuCode={sbus.find((s) => s.id === campaignsFor.sbuId)?.code ?? ""}
          period={campaignsFor.period}
          campaigns={campaigns.filter((c) => c.sbuId === campaignsFor.sbuId && c.period === campaignsFor.period)}
          canManage={canManage}
          onOpenChange={(o) => !o && setCampaignsFor(null)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

export function MonthPicker({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  const sorted = [...new Set([...months, value])].sort().reverse();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border bg-background px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-label="Chọn tháng"
    >
      {sorted.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  );
}

export function EffBadge({ label }: { label: string }) {
  const tone = EFFECTIVENESS_TONE[label] ?? EFFECTIVENESS_TONE["Chưa đủ dữ liệu"];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {label}
    </span>
  );
}

function CenterDetailTable({
  sbus,
  month,
  rows,
  prevRows,
  der,
  canManage,
  onEdit,
  onCampaigns,
}: {
  sbus: SbuLite[];
  month: string;
  rows: (sbuId: string) => MetricRow[];
  prevRows: (sbuId: string) => MetricRow[];
  der: (r: MetricRow[]) => AggDerived;
  canManage: boolean;
  onEdit: (s: SbuLite) => void;
  onCampaigns: (sbuId: string) => void;
}) {
  const data = sbus.map((s) => {
    const r = rows(s.id);
    return { s, r: r[0] ?? null, d: der(r), p: der(prevRows(s.id)) };
  });
  const maxSpend = Math.max(1, ...data.map((x) => x.d.spend ?? 0));
  const total = der(sbus.flatMap((s) => rows(s.id)));

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Chi tiết từng trung tâm — {monthLabel(month)}</h3>
        <p className="text-xs text-muted-foreground">Thanh ngang = tỷ trọng ngân sách. Điểm hiệu quả tính theo ngưỡng CPL/CAC ở Cài đặt.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">SBU</th>
              <th className="px-3 py-2 text-right font-medium">NS TT order</th>
              <th className="px-3 py-2 text-right font-medium">NS P.MKT thêm</th>
              <th className="min-w-40 px-3 py-2 text-left font-medium">Tổng NS</th>
              <th className="px-3 py-2 text-right font-medium">Lead</th>
              <th className="px-3 py-2 text-right font-medium">HVM</th>
              <th className="px-3 py-2 text-right font-medium">CPL</th>
              <th className="px-3 py-2 text-right font-medium">CAC</th>
              <th className="px-3 py-2 text-right font-medium">CVR</th>
              <th className="px-3 py-2 text-left font-medium">Hiệu quả</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map(({ s, r, d, p }) => {
              const cplUp = change(d.cpl, p.cpl);
              return (
                <tr key={s.id} className={cn("hover:bg-muted/30", (d.effectivenessLabel === "Kém hiệu quả" || (d.spend && d.newStudents === 0)) && "bg-red-500/[0.04]")}>
                  <td className="px-3 py-2 font-medium" title={s.name}>
                    {s.code}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r?.centerOrderBudget)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r?.hoTopupBudget)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-[var(--series-2)]" style={{ width: `${((d.spend ?? 0) / maxSpend) * 100}%` }} />
                      </div>
                      <span className="font-medium tabular-nums">{fmtMoney(d.spend)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(d.leads)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", d.spend && d.newStudents === 0 && "font-semibold text-red-600 dark:text-red-400")}>{fmt(d.newStudents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(d.cpl)}
                    {cplUp != null && cplUp > 0.25 && <span className="ml-1 text-[11px] font-semibold text-red-600 dark:text-red-400" title="CPL tăng mạnh so với tháng trước">▲{Math.round(cplUp * 100)}%</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.cac)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(d.cvr)}</td>
                  <td className="px-3 py-2">
                    <EffBadge label={d.effectivenessLabel} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {canManage && (
                        <Button size="icon-sm" variant="ghost" title="Sửa số liệu" onClick={() => onEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" title="Chiến dịch Facebook của trung tâm" onClick={() => onCampaigns(s.id)}>
                        <Megaphone className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 bg-muted/40 font-semibold">
            <tr>
              <td className="px-3 py-2">Tổng</td>
              <td colSpan={2} />
              <td className="px-3 py-2 tabular-nums">{fmtMoney(total.spend)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total.leads)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total.newStudents)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.cpl)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.cac)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtPct(total.cvr)}</td>
              <td className="px-3 py-2">
                <EffBadge label={total.effectivenessLabel} />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** Bảng nhiệt SBU × tháng cho 1 chỉ số — thấy ngay trung tâm nào đang tốt/xấu dần. */
function CenterPivot({
  sbus,
  months,
  rows,
  der,
  onPickMonth,
  activeMonth,
}: {
  sbus: SbuLite[];
  months: string[];
  rows: (p: string, sbuId?: string) => MetricRow[];
  der: (r: MetricRow[]) => AggDerived;
  onPickMonth: (m: string) => void;
  activeMonth: string;
}) {
  const [metric, setMetric] = React.useState<PivotMetric>("cac");
  const val = (p: string, sbuId: string) => {
    const r = rows(p, sbuId);
    if (!r.length) return null;
    return der(r)[metric] as number | null;
  };
  const all = sbus.flatMap((s) => months.map((m) => val(m, s.id))).filter((v): v is number => v != null);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const fmtV = (v: number | null) => (v == null ? "—" : metric === "leads" || metric === "newStudents" ? fmt(v) : metric === "effectivenessScore" ? v.toFixed(1) : fmtMoney(v));

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold">Xu hướng theo trung tâm — {PIVOT_LABEL[metric]}</h3>
          <p className="text-xs text-muted-foreground">
            {BAD_WHEN_HIGH.includes(metric) ? "Đỏ đậm = cao (chi phí cao là xấu)." : "Xanh đậm = cao."} Bấm tiêu đề tháng để xem chi tiết tháng đó.
          </p>
        </div>
        <Segmented value={metric} onChange={setMetric} options={(Object.keys(PIVOT_LABEL) as PivotMetric[]).map((k) => ({ value: k, label: PIVOT_LABEL[k] }))} />
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">SBU</th>
              {months.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => onPickMonth(m)} className={cn("rounded px-1 hover:bg-muted hover:text-foreground", m === activeMonth && "bg-brand/10 text-brand")}>
                    {monthLabel(m, true)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sbus.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-1.5 font-medium">{s.code}</td>
                {months.map((m) => {
                  const v = val(m, s.id);
                  const style =
                    metric === "effectivenessScore"
                      ? heatStyle(v == null ? null : 5 - v, 0, 4, true)
                      : heatStyle(v, min, max, BAD_WHEN_HIGH.includes(metric));
                  return (
                    <td key={m} style={style} className={cn("whitespace-nowrap px-2 py-1.5 text-right tabular-nums", m === activeMonth && "outline outline-1 -outline-offset-1 outline-brand/30", v == null && "text-muted-foreground/50")}>
                      {fmtV(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Mảng 1 dòng/tháng (Hệ thống/Ecom/B2B/OSIR/VMP): bảng các tháng, mới nhất trên cùng. */
function LineMonthTable({
  months,
  rows,
  der,
  line,
  activeMonth,
  onPickMonth,
  canManage,
  onEdit,
}: {
  months: string[];
  rows: (p: string) => MetricRow[];
  der: (r: MetricRow[]) => AggDerived;
  line: Line;
  activeMonth: string;
  onPickMonth: (m: string) => void;
  canManage: boolean;
  onEdit: (p: string) => void;
}) {
  const desc = [...months].reverse();
  const extra = line === "ecom" ? (["MQL", "Doanh thu", "ROAS"] as const) : line === "b2b" ? (["Mess", "Deal chốt"] as const) : ([] as const);
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{LINE_LABELS[line]} — số liệu từng tháng</h3>
        <p className="text-xs text-muted-foreground">Bấm 1 dòng để chọn tháng đó làm tháng đang xem.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tháng</th>
              <th className="px-3 py-2 text-right font-medium">Chi tiêu</th>
              <th className="px-3 py-2 text-right font-medium">Lead</th>
              <th className="px-3 py-2 text-right font-medium">{conversionLabel(line)}</th>
              <th className="px-3 py-2 text-right font-medium">CPL</th>
              <th className="px-3 py-2 text-right font-medium">CAC</th>
              <th className="px-3 py-2 text-right font-medium">CVR</th>
              {extra.map((e) => (
                <th key={e} className="px-3 py-2 text-right font-medium">
                  {e}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Hiệu quả</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {desc.map((p) => {
              const r = rows(p);
              const d = der(r);
              const raw = r[0];
              return (
                <tr key={p} onClick={() => onPickMonth(p)} className={cn("cursor-pointer hover:bg-muted/30", p === activeMonth && "bg-brand/[0.05]")}>
                  <td className={cn("px-3 py-2 font-medium", p === activeMonth && "text-brand")}>{monthLabel(p)}</td>
                  {r.length === 0 ? (
                    <td colSpan={7 + extra.length} className="px-3 py-2 text-xs text-muted-foreground">
                      Chưa có số liệu
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(d.spend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(d.leads)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(d.newStudents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.cpl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.cac)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(d.cvr)}</td>
                      {line === "ecom" && (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(raw?.mql)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.revenue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.roas != null ? `${d.roas.toFixed(2)}x` : "—"}</td>
                        </>
                      )}
                      {line === "b2b" && (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(d.messages)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(d.deals)}</td>
                        </>
                      )}
                      <td className="px-3 py-2">
                        <EffBadge label={d.effectivenessLabel} />
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    {canManage && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Sửa số liệu"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(p);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricEditDialog({
  target,
  line,
  period,
  rubric,
  onOpenChange,
  onDone,
}: {
  target: { row: MetricRow | null; sbuId: string | null; label: string };
  line: Line;
  period: string;
  rubric: EffectivenessRubric;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const row = target.row;
  const [f, setF] = React.useState({
    budget: row?.budget ?? "",
    centerOrderBudget: row?.centerOrderBudget ?? "",
    hoTopupBudget: row?.hoTopupBudget ?? "",
    leads: row?.leads ?? "",
    newStudents: row?.newStudents ?? "",
    messages: row?.messages ?? "",
    revenue: row?.revenue ?? "",
    actualRevenue: row?.actualRevenue ?? "",
    mql: row?.mql ?? "",
    deals: row?.deals ?? "",
    centerFeedback: row?.centerFeedback ?? "",
    mktAssessment: row?.mktAssessment ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isCenter = line === "b2c_center";
  const preview = derive(
    aggregate([{ ...(row ?? ({} as MetricRow)), line, periodType: "month", period, sbuId: target.sbuId, budget: f.budget || null, centerOrderBudget: f.centerOrderBudget || null, hoTopupBudget: f.hoTopupBudget || null, leads: f.leads || null, newStudents: f.newStudents || null, messages: f.messages || null, revenue: f.revenue || null, mql: f.mql || null, deals: f.deals || null } as MetricRow]),
    line,
    rubric,
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.label}</DialogTitle>
          <DialogDescription>
            {LINE_LABELS[line]} · {monthLabel(period)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {isCenter ? (
              <>
                <F label="NS Trung tâm order">
                  <Input type="number" value={f.centerOrderBudget} onChange={(e) => set("centerOrderBudget", e.target.value)} />
                </F>
                <F label="NS P.MKT thêm">
                  <Input type="number" value={f.hoTopupBudget} onChange={(e) => set("hoTopupBudget", e.target.value)} />
                </F>
              </>
            ) : (
              <div className="col-span-2">
                <F label="Ngân sách chi (VND)">
                  <Input type="number" value={f.budget} onChange={(e) => set("budget", e.target.value)} />
                </F>
              </div>
            )}
            <F label="Lead / Data">
              <Input type="number" value={f.leads} onChange={(e) => set("leads", e.target.value)} />
            </F>
            <F label={conversionLabel(line)}>
              <Input type="number" value={f.newStudents} onChange={(e) => set("newStudents", e.target.value)} />
            </F>
            {line === "ecom" && (
              <>
                <F label="MQL">
                  <Input type="number" value={f.mql} onChange={(e) => set("mql", e.target.value)} />
                </F>
                <F label="Doanh thu">
                  <Input type="number" value={f.revenue} onChange={(e) => set("revenue", e.target.value)} />
                </F>
                <F label="Thực thu">
                  <Input type="number" value={f.actualRevenue} onChange={(e) => set("actualRevenue", e.target.value)} />
                </F>
              </>
            )}
            {line === "b2b" && (
              <>
                <F label="Mess">
                  <Input type="number" value={f.messages} onChange={(e) => set("messages", e.target.value)} />
                </F>
                <F label="Hợp đồng / Deal chốt">
                  <Input type="number" value={f.deals} onChange={(e) => set("deals", e.target.value)} />
                </F>
              </>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <Preview label="Tổng NS" value={fmtMoney(preview.spend)} />
            <Preview label="CPL" value={fmtMoney(preview.cpl)} />
            <Preview label="CAC" value={fmtMoney(preview.cac)} />
            <Preview label="Hiệu quả" value={<EffBadge label={preview.effectivenessLabel} />} />
          </div>

          {isCenter && (
            <>
              <F label="Feedback trung tâm">
                <Textarea rows={2} value={f.centerFeedback} onChange={(e) => set("centerFeedback", e.target.value)} />
              </F>
              <F label="MKT đánh giá">
                <Textarea rows={2} value={f.mktAssessment} onChange={(e) => set("mktAssessment", e.target.value)} />
              </F>
            </>
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
                    line,
                    periodType: "month",
                    period,
                    sbuId: target.sbuId,
                    budget: f.budget || null,
                    centerOrderBudget: f.centerOrderBudget || null,
                    hoTopupBudget: f.hoTopupBudget || null,
                    leads: f.leads || null,
                    newStudents: f.newStudents || null,
                    messages: f.messages || null,
                    revenue: f.revenue || null,
                    actualRevenue: f.actualRevenue || null,
                    mql: f.mql || null,
                    deals: f.deals || null,
                    centerFeedback: f.centerFeedback || null,
                    mktAssessment: f.mktAssessment || null,
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

function Preview({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
