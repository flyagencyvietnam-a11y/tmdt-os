"use client";

import { Coins, Pencil, Percent, Plus, Target, UserPlus, Users } from "lucide-react";
import { useSessionState } from "@/lib/use-session-state";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line as RLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { cn } from "@/lib/utils";
import { EffBadge, MonthPicker } from "./ads-ui";
import { InlineNum, useMetricSaver } from "./ads-inline";
import { B2cView } from "./b2c-view";
import { axisProps, ChartCard, ChartTooltip, gridProps } from "./charts";
import { EcomProducts } from "./ecom-products";
import { MetricEditDialog } from "./metric-edit-dialog";
import type { EcomProductRow } from "./rollups";
import {
  aggregate,
  change,
  conversionLabel,
  derive,
  fmt,
  fmtMoney,
  fmtPct,
  LINE_COLORS,
  LINE_LABELS,
  monthLabel,
  prevMonth,
  type AggDerived,
  type CampaignRow,
  type Line,
  type MetricRow,
  type SbuLite,
} from "./shared";

export { EffBadge, MonthPicker };

/** Tab của report tháng: B2C gộp Hệ thống + Trung tâm (đúng sheet "Tổng hợp" mục 1+2) rồi 4 mảng còn lại. */
type Tab = "b2c" | "ecom" | "b2b" | "osir" | "vmp";
const TABS: Tab[] = ["b2c", "ecom", "b2b", "osir", "vmp"];
const TAB_LABEL: Record<Tab, string> = { b2c: "B2C Offline", ecom: LINE_LABELS.ecom, b2b: LINE_LABELS.b2b, osir: LINE_LABELS.osir, vmp: LINE_LABELS.vmp };
const TAB_COLOR: Record<Tab, string> = { b2c: LINE_COLORS.b2c_system, ecom: LINE_COLORS.ecom, b2b: LINE_COLORS.b2b, osir: LINE_COLORS.osir, vmp: LINE_COLORS.vmp };

/**
 * Report THÁNG — 5 mảng. Xem 1 tháng chi tiết nhưng LUÔN kèm xu hướng nhiều
 * tháng. Số liệu tháng nhập riêng, không phải tổng các tuần.
 */
export function MonthlyView({
  metrics,
  sbus,
  campaigns,
  ecomProducts,
  canManage,
  months,
  month,
  onMonthChange,
  rubric,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  ecomProducts: EcomProductRow[];
  canManage: boolean;
  months: string[];
  month: string;
  onMonthChange: (m: string) => void;
  rubric: EffectivenessRubric;
}) {
  const router = useRouter();
  const [tab, setTab] = useSessionState<Tab>("ads:month:tab", "b2c");
  const [editing, setEditing] = React.useState<{ row: MetricRow | null; period: string } | null>(null);

  const hasRow = (t: Tab, p: string) => metrics.some((m) => m.periodType === "month" && m.line === t && m.period === p);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              t === tab ? "bg-foreground/[0.06] font-medium text-foreground ring-1 ring-foreground/10" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: TAB_COLOR[t] }} />
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <MonthPicker months={months} value={month} onChange={onMonthChange} />
        {canManage && tab !== "b2c" && (
          <Button size="sm" onClick={() => setEditing({ row: metrics.find((m) => m.periodType === "month" && m.line === tab && m.period === month) ?? null, period: month })}>
            {hasRow(tab, month) ? <Pencil className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {hasRow(tab, month) ? "Sửa số liệu" : "Nhập số liệu"}
          </Button>
        )}
      </div>
    </div>
  );

  if (tab === "b2c") {
    return (
      <div className="space-y-4">
        {toolbar}
        <B2cView metrics={metrics} sbus={sbus} campaigns={campaigns} canManage={canManage} month={month} onMonthChange={onMonthChange} rubric={rubric} />
      </div>
    );
  }

  const line: Line = tab;
  const monthly = metrics.filter((m) => m.periodType === "month" && m.line === line);
  const of = (p: string) => monthly.filter((m) => m.period === p);
  const der = (rows: MetricRow[]) => derive(aggregate(rows), line, rubric);
  const lineMonths = [...new Set([...monthly.map((m) => m.period), month])].sort();
  const cur = der(of(month));
  const prv = der(of(prevMonth(month)));
  const conv = conversionLabel(line);
  const isEcom = line === "ecom";
  const leadOf = (d: AggDerived) => (isEcom ? d.mql : d.leads);
  const cpOf = (d: AggDerived) => (isEcom ? (d.spend != null && d.mql ? d.spend / d.mql : null) : d.cpl);

  const trend = lineMonths.map((p) => {
    const x = der(of(p));
    return { period: p, label: monthLabel(p, true), spend: x.spend, leads: leadOf(x), newStudents: x.newStudents, cpl: cpOf(x), cac: x.cac };
  });
  const leadName = isEcom ? "MQL" : "Lead";
  const cpName = isEcom ? "CP/MQL" : "CPL";

  return (
    <div className="space-y-4">
      {toolbar}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={`Chi tiêu ${monthLabel(month)}`} value={fmtMoney(cur.spend)} icon={Coins} tone="brand" delta={change(cur.spend, prv.spend)} deltaGoodWhen="down" />
        <StatCard label={isEcom ? "MQL" : "Lead / Data"} value={fmt(leadOf(cur))} icon={Users} tone="info" delta={change(leadOf(cur), leadOf(prv))} />
        <StatCard label={conv} value={fmt(cur.newStudents)} icon={UserPlus} tone="ok" delta={change(cur.newStudents, prv.newStudents)} />
        <StatCard label={isEcom ? "CP / MQL" : "CPL"} value={fmtMoney(cpOf(cur))} icon={Target} delta={change(cpOf(cur), cpOf(prv))} deltaGoodWhen="down" />
        <StatCard label="CAC" value={fmtMoney(cur.cac)} icon={Target} delta={change(cur.cac, prv.cac)} deltaGoodWhen="down" />
        <StatCard
          label={isEcom ? "ROAS" : `CVR Lead → ${conv}`}
          value={isEcom ? (cur.roas != null ? `${cur.roas.toFixed(2)}x` : "—") : fmtPct(cur.cvr)}
          icon={Percent}
          hint={isEcom ? undefined : <EffBadge label={cur.effectivenessLabel} />}
        />
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
          title={`${leadName} & ${conv}`}
          description="Số lượng mỗi tháng."
          legend={[
            { label: leadName, color: "var(--series-1)" },
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
                <Bar dataKey="leads" name={leadName} fill="var(--series-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="newStudents" name={conv} fill="var(--series-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title={`${cpName} & CAC`}
          description="Càng thấp càng tốt. Nét đứt = CAC."
          legend={[
            { label: cpName, color: "var(--series-7)" },
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
                <RLine type="monotone" dataKey="cpl" name={cpName} stroke="var(--series-7)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
                <RLine type="monotone" dataKey="cac" name="CAC" stroke="var(--series-8)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <LineMonthTable months={lineMonths} rows={of} der={der} line={line} activeMonth={month} onPickMonth={onMonthChange} canManage={canManage} onEdit={(p) => (onMonthChange(p), setEditing({ row: of(p)[0] ?? null, period: p }))} />

      {isEcom && <EcomProducts metrics={metrics} products={ecomProducts} canManage={canManage} month={month} />}

      {editing && (
        <MetricEditDialog
          key={`${editing.period}-${line}`}
          target={{ row: editing.row, sbuId: null, label: LINE_LABELS[line] }}
          line={line}
          period={editing.period}
          rubric={rubric}
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

/** Mảng 1 dòng/tháng (Hệ thống/Ecom/B2B/OSIR/VMP): bảng các tháng, mới nhất trên cùng. */
export function LineMonthTable({
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
  const total = der(months.flatMap((p) => rows(p)));
  const saveMetric = useMetricSaver();
  const isEcom = line === "ecom";
  const isB2b = line === "b2b";

  // Mỗi mảng 1 bộ cột: Ecom dùng MQL (không có "Lead" thường) + Doanh thu/ROAS; B2B thêm Mess/Deal.
  type Col = { label: string; cell: (d: AggDerived) => React.ReactNode; strong?: boolean; /** Trường nhập được ngay trên bảng (cột suy ra thì không có). */ field?: "budget" | "leads" | "newStudents" | "messages" | "revenue" | "mql" | "deals" };
  const cols: Col[] = isEcom
    ? [
        { label: "Chi tiêu", cell: (d) => fmtMoney(d.spend), strong: true, field: "budget" },
        { label: "MQL", cell: (d) => fmt(d.mql), field: "mql" },
        { label: conversionLabel(line), cell: (d) => fmt(d.newStudents), field: "newStudents" },
        { label: "CP/MQL", cell: (d) => fmtMoney(d.spend != null && d.mql ? d.spend / d.mql : null) },
        { label: "CAC", cell: (d) => fmtMoney(d.cac) },
        { label: "CVR MQL→HVM", cell: (d) => fmtPct(d.mql && d.newStudents != null ? d.newStudents / d.mql : null) },
        { label: "Doanh thu", cell: (d) => fmtMoney(d.revenue), field: "revenue" },
        { label: "ROAS", cell: (d) => (d.roas != null ? `${d.roas.toFixed(2)}x` : "—") },
      ]
    : [
        { label: "Chi tiêu", cell: (d) => fmtMoney(d.spend), strong: true, field: "budget" },
        { label: "Lead", cell: (d) => fmt(d.leads), field: "leads" },
        { label: conversionLabel(line), cell: (d) => fmt(d.newStudents), field: "newStudents" },
        { label: "CPL", cell: (d) => fmtMoney(d.cpl) },
        { label: "CAC", cell: (d) => fmtMoney(d.cac) },
        { label: "CVR", cell: (d) => fmtPct(d.cvr) },
        ...(isB2b ? [{ label: "Mess", cell: (d: AggDerived) => fmt(d.messages), field: "messages" as const }, { label: "Deal chốt", cell: (d: AggDerived) => fmt(d.deals), field: "deals" as const }] : []),
      ];

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{LINE_LABELS[line]} — số liệu từng tháng</h3>
        <p className="text-xs text-muted-foreground">Bấm 1 dòng để chọn tháng đó làm tháng đang xem. Số tháng nhập riêng, không cộng từ các tuần.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tháng</th>
              {cols.map((c) => (
                <th key={c.label} className="px-3 py-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
              {!isEcom && <th className="px-3 py-2 text-left font-medium">Hiệu quả</th>}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {desc.map((p) => {
              const r = rows(p);
              const d = der(r);
              return (
                <tr key={p} onClick={() => onPickMonth(p)} className={cn("cursor-pointer hover:bg-muted/30", p === activeMonth && "bg-brand/[0.05]")}>
                  <td className={cn("px-3 py-2 font-medium", p === activeMonth && "text-brand")}>{monthLabel(p)}</td>
                  {r.length === 0 && !canManage ? (
                    <td colSpan={cols.length + (isEcom ? 0 : 1)} className="px-3 py-2 text-xs text-muted-foreground">
                      Chưa có số liệu
                    </td>
                  ) : (
                    <>
                      {cols.map((c) => (
                        <td key={c.label} className={cn("px-3 py-2 text-right tabular-nums", c.strong && "font-medium")}>
                          {canManage && c.field ? (
                            <InlineNum
                              value={r[0]?.[c.field]}
                              display={r.length === 0 ? <span className="text-muted-foreground/50">＋</span> : c.cell(d)}
                              title={`Sửa ${c.label} — ${monthLabel(p)}`}
                              onSave={(val) => saveMetric(r[0] ?? null, { line, periodType: "month", period: p, sbuId: null }, c.field!, val)}
                            />
                          ) : r.length === 0 ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            c.cell(d)
                          )}
                        </td>
                      ))}
                      {!isEcom && <td className="px-3 py-2">{r.length > 0 && <EffBadge label={d.effectivenessLabel} />}</td>}
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
          <tfoot className="border-t-2 bg-muted/40 font-semibold">
            <tr>
              <td className="px-3 py-2">Tổng cộng ({months.length} tháng)</td>
              {cols.map((c) => (
                <td key={c.label} className="px-3 py-2 text-right tabular-nums">
                  {c.cell(total)}
                </td>
              ))}
              {!isEcom && <td className="px-3 py-2" />}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
