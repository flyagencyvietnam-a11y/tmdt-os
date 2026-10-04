"use client";

import { Coins, Megaphone, Pencil, Percent, Target, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line as RLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { cn } from "@/lib/utils";
import { upsertAdsMetricAction } from "./actions";
import { CampaignsDialog } from "./campaigns-dialog";
import { EffBadge, F, Preview } from "./ads-ui";
import { MetricEditDialog } from "./metric-edit-dialog";
import { axisProps, ChartCard, ChartTooltip, gridProps } from "./charts";
import { CenterTrendTable } from "./center-trend";
import { b2cSummary, type B2cSummary } from "./rollups";
import {
  aggregate,
  change,
  derive,
  fmt,
  fmtMoney,
  fmtPct,
  monthLabel,
  prevMonth,
  type AggDerived,
  type CampaignRow,
  type MetricRow,
  type SbuLite,
} from "./shared";

/**
 * B2C Offline = Mục 1 (Hệ thống, P.MKT chạy chung) + Mục 2 (Trung tâm, ngân sách
 * riêng từng TT). Hiểu đúng theo file Digital Tracker + báo cáo ads Q3:
 *  1. Lead/HVM là số TỔNG của cả hai mục cộng lại — nhập 1 lần/tháng ở dòng "Tổng B2C".
 *  2. Từ T7/2026 có thêm số quy RIÊNG cho ads ngân sách từng TT (campaign chạy riêng)
 *     để đo chất lượng — là tập con của số tổng, KHÔNG cộng thêm vào số tổng.
 *  3. Số tháng nhập riêng, không phải tổng các tuần.
 */
export function B2cView({
  metrics,
  sbus,
  campaigns,
  canManage,
  month,
  onMonthChange,
  rubric,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  canManage: boolean;
  month: string;
  onMonthChange: (m: string) => void;
  rubric: EffectivenessRubric;
}) {
  const router = useRouter();
  const [editingTotals, setEditingTotals] = React.useState<string | null>(null);
  const [editingCenter, setEditingCenter] = React.useState<{ row: MetricRow | null; sbu: SbuLite } | null>(null);
  const [campaignsFor, setCampaignsFor] = React.useState<{ sbuId: string; period: string } | null>(null);

  const monthly = metrics.filter((m) => m.periodType === "month" && (m.line === "b2c_system" || m.line === "b2c_center"));
  const b2cMonths = [...new Set([...monthly.map((m) => m.period), month])].sort();
  const centerOf = (p: string, sbuId?: string) => monthly.filter((m) => m.line === "b2c_center" && m.period === p && (sbuId === undefined || m.sbuId === sbuId));
  const der = (rows: MetricRow[]) => derive(aggregate(rows), "b2c_center", rubric);

  const cur = b2cSummary(metrics, [month]);
  const prv = b2cSummary(metrics, [prevMonth(month)]);
  const trend = b2cMonths.map((p) => {
    const s = b2cSummary(metrics, [p]);
    return { period: p, label: monthLabel(p, true), system: s.systemSpend, center: s.centerSpend, leads: s.leads, newStudents: s.newStudents, cpl: s.cpl, cac: s.cac };
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground shadow-xs">
        <b className="text-foreground">Cách tính B2C Offline:</b> ngân sách = <b>Hệ thống</b> (P.MKT chạy chung) + <b>Trung tâm</b> (TT order + P.MKT chạy thêm). <b>Lead và HVM là số tổng của cả hai mục</b>, không tách. Từ T7/2026, ads ngân sách riêng từng TT được đếm kết quả riêng (mục “Hiệu quả ads ngân sách riêng từng trung tâm” bên dưới) — đó là{" "}
        <b>một phần của số tổng</b>, không cộng thêm. Số liệu tháng nhập riêng, không phải cộng từ các tuần.
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={`Tổng NS ${monthLabel(month)}`}
          value={fmtMoney(cur.totalSpend)}
          icon={Coins}
          tone="brand"
          delta={change(cur.totalSpend, prv.totalSpend)}
          deltaGoodWhen="down"
          hint={`HT ${fmtMoney(cur.systemSpend)} · TT ${fmtMoney(cur.centerSpend)}`}
        />
        <StatCard label="Lead tổng (HT + TT)" value={fmt(cur.leads)} icon={Users} tone="info" delta={change(cur.leads, prv.leads)} />
        <StatCard label="HVM tổng (HT + TT)" value={fmt(cur.newStudents)} icon={UserPlus} tone="ok" delta={change(cur.newStudents, prv.newStudents)} />
        <StatCard label="CPL tổng" value={fmtMoney(cur.cpl)} icon={Target} delta={change(cur.cpl, prv.cpl)} deltaGoodWhen="down" hint="Tổng NS ÷ Lead tổng" />
        <StatCard label="CAC tổng" value={fmtMoney(cur.cac)} icon={Target} delta={change(cur.cac, prv.cac)} deltaGoodWhen="down" hint="Tổng NS ÷ HVM tổng" />
        <StatCard label="CVR Lead → HVM" value={fmtPct(cur.cvr)} icon={Percent} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Ngân sách theo tháng"
          description="Cột chồng = Hệ thống + Trung tâm."
          legend={[
            { label: "Hệ thống (HO)", color: "var(--series-1)" },
            { label: "Trung tâm", color: "var(--series-2)" },
          ]}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} />} />
                <Bar dataKey="system" name="Hệ thống (HO)" stackId="s" fill="var(--series-1)" stroke="var(--card)" strokeWidth={1} />
                <Bar dataKey="center" name="Trung tâm" stackId="s" fill="var(--series-2)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Lead & HVM tổng"
          description="Số tổng của cả Hệ thống + Trung tâm."
          legend={[
            { label: "Lead", color: "var(--series-1)" },
            { label: "HVM", color: "var(--series-3)" },
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
                <Bar dataKey="newStudents" name="HVM" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="CPL & CAC tổng"
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

      <TotalsTable months={b2cMonths} metrics={metrics} activeMonth={month} onPickMonth={onMonthChange} canManage={canManage} onEdit={(p) => (onMonthChange(p), setEditingTotals(p))} />

      <section className="space-y-3">
        <div className="px-1">
          <h3 className="text-sm font-semibold">Hiệu quả ads ngân sách riêng từng trung tâm — {monthLabel(month)}</h3>
          <p className="text-xs text-muted-foreground">Chỉ đếm kết quả của các chiến dịch chạy bằng ngân sách riêng của từng TT (có từ T7/2026) để biết chất lượng từng nguồn.</p>
        </div>
        <SplitTable s={cur} month={month} />
        <CenterDetailTable
          sbus={sbus}
          month={month}
          rows={(id) => centerOf(month, id)}
          prevRows={(id) => centerOf(prevMonth(month), id)}
          der={der}
          canManage={canManage}
          onEdit={(sbu) => setEditingCenter({ row: centerOf(month, sbu.id)[0] ?? null, sbu })}
          onCampaigns={(sbuId) => setCampaignsFor({ sbuId, period: month })}
        />
        <CenterTrendTable sbus={sbus} months={b2cMonths} rows={centerOf} der={der} rubric={rubric} onPickMonth={onMonthChange} activeMonth={month} />
      </section>

      {editingTotals && (
        <TotalsDialog
          key={editingTotals}
          period={editingTotals}
          row={monthly.find((m) => m.line === "b2c_system" && m.period === editingTotals) ?? null}
          centerSpend={b2cSummary(metrics, [editingTotals]).centerSpend}
          onOpenChange={(o) => !o && setEditingTotals(null)}
          onDone={() => {
            setEditingTotals(null);
            router.refresh();
          }}
        />
      )}
      {editingCenter && (
        <MetricEditDialog
          key={`${editingCenter.sbu.id}-${month}`}
          target={{ row: editingCenter.row, sbuId: editingCenter.sbu.id, label: editingCenter.sbu.code }}
          line="b2c_center"
          period={month}
          rubric={rubric}
          onOpenChange={(o) => !o && setEditingCenter(null)}
          onDone={() => {
            setEditingCenter(null);
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

/** Bảng B2C tổng theo tháng — mirror sheet "Tổng hợp" mục 1+2 + dòng Tổng cộng. */
function TotalsTable({
  months,
  metrics,
  activeMonth,
  onPickMonth,
  canManage,
  onEdit,
}: {
  months: string[];
  metrics: MetricRow[];
  activeMonth: string;
  onPickMonth: (m: string) => void;
  canManage: boolean;
  onEdit: (p: string) => void;
}) {
  const desc = [...months].reverse();
  const total = b2cSummary(metrics, months);
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">B2C Offline tổng hợp theo tháng (Hệ thống + Trung tâm)</h3>
        <p className="text-xs text-muted-foreground">Lead/HVM là số tổng của cả hai mục. CPL/CAC = Tổng NS ÷ Lead/HVM tổng. Bấm 1 dòng để chọn tháng đó.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tháng</th>
              <th className="px-3 py-2 text-right font-medium">NS Hệ thống</th>
              <th className="px-3 py-2 text-right font-medium">NS Trung tâm</th>
              <th className="px-3 py-2 text-right font-medium">Tổng NS</th>
              <th className="px-3 py-2 text-right font-medium">Lead tổng</th>
              <th className="px-3 py-2 text-right font-medium">HVM tổng</th>
              <th className="px-3 py-2 text-right font-medium">CPL</th>
              <th className="px-3 py-2 text-right font-medium">CAC</th>
              <th className="px-3 py-2 text-right font-medium">CVR</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {desc.map((p) => {
              const s = b2cSummary(metrics, [p]);
              const empty = s.totalSpend == null && s.leads == null;
              return (
                <tr key={p} onClick={() => onPickMonth(p)} className={cn("cursor-pointer hover:bg-muted/30", p === activeMonth && "bg-brand/[0.05]")}>
                  <td className={cn("px-3 py-2 font-medium", p === activeMonth && "text-brand")}>{monthLabel(p)}</td>
                  {empty ? (
                    <td colSpan={8} className="px-3 py-2 text-xs text-muted-foreground">
                      Chưa có số liệu
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(s.systemSpend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(s.centerSpend)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(s.totalSpend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(s.leads)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(s.newStudents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(s.cpl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(s.cac)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(s.cvr)}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    {canManage && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Sửa số liệu tổng"
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
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.systemSpend)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.centerSpend)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.totalSpend)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total.leads)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total.newStudents)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.cpl)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total.cac)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtPct(total.cvr)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** So sánh nguồn: ads riêng TT vs phần còn lại (suy ra) vs tổng — trả lời "ads ngân sách TT có tốt hơn không?". */
function SplitTable({ s, month }: { s: B2cSummary; month: string }) {
  if (s.attributedMonths === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-4 py-4 text-sm text-muted-foreground">
        {monthLabel(month)} chưa có số Lead/HVM quy riêng cho ads từng trung tâm (báo cáo này bắt đầu từ T7/2026). Số tổng B2C vẫn hiển thị ở bảng phía trên.
      </div>
    );
  }
  const rows: { key: string; label: string; note: string; d: { spend: number | null; leads: number | null; newStudents: number | null; cpl: number | null; cac: number | null; cvr: number | null }; strong?: boolean }[] = [
    { key: "center", label: "Ads ngân sách riêng từng TT", note: "NS TT order + P.MKT chạy thêm; Lead/HVM quy theo campaign của TT", d: s.center },
    { key: "rest", label: "Phần còn lại (Hệ thống + nguồn khác)", note: "Suy ra: Lead/HVM = tổng − TT; NS = NS Hệ thống. Chỉ tham khảo", d: s.rest },
    { key: "all", label: "Tổng B2C Offline", note: "Số báo cáo chung (Hệ thống + Trung tâm)", d: { spend: s.totalSpend, leads: s.leads, newStudents: s.newStudents, cpl: s.cpl, cac: s.cac, cvr: s.cvr }, strong: true },
  ];
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      {s.inconsistentMonths.length > 0 && (
        <div className="border-b bg-red-500/10 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-400">
          Số quy riêng cho TT đang LỚN HƠN số tổng B2C ở {s.inconsistentMonths.map((m) => monthLabel(m, true)).join(", ")} — kiểm tra lại Lead/HVM tổng hoặc số của trung tâm.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nguồn</th>
              <th className="px-3 py-2 text-right font-medium">Ngân sách</th>
              <th className="px-3 py-2 text-right font-medium">Lead</th>
              <th className="px-3 py-2 text-right font-medium">HVM</th>
              <th className="px-3 py-2 text-right font-medium">CPL</th>
              <th className="px-3 py-2 text-right font-medium">CAC</th>
              <th className="px-3 py-2 text-right font-medium">CVR</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key} className={cn(r.strong && "bg-muted/40 font-semibold")}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">{r.note}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.d.spend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.d.leads)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.d.newStudents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.d.cpl)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.d.cac)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.d.cvr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TotalsDialog({
  period,
  row,
  centerSpend,
  onOpenChange,
  onDone,
}: {
  period: string;
  row: MetricRow | null;
  centerSpend: number | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ budget: row?.budget ?? "", leads: row?.leads ?? "", newStudents: row?.newStudents ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const sys = f.budget === "" ? null : Number(f.budget);
  const total = sys == null && centerSpend == null ? null : (sys ?? 0) + (centerSpend ?? 0);
  const leads = f.leads === "" ? null : Number(f.leads);
  const hvm = f.newStudents === "" ? null : Number(f.newStudents);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tổng B2C Offline — {monthLabel(period)}</DialogTitle>
          <DialogDescription>Ngân sách Hệ thống + Lead/HVM tính chung cho cả Hệ thống và Trung tâm (không tách theo mục).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <F label="Ngân sách Hệ thống (HO chạy chung)" hint="Ngân sách Trung tâm lấy tự động từ các dòng từng TT bên dưới.">
            <Input type="number" value={f.budget} onChange={(e) => set("budget", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Lead / Data tổng">
              <Input type="number" value={f.leads} onChange={(e) => set("leads", e.target.value)} />
            </F>
            <F label="HVM tổng (từ CRM/DotB)">
              <Input type="number" value={f.newStudents} onChange={(e) => set("newStudents", e.target.value)} />
            </F>
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <Preview label="NS TT" value={fmtMoney(centerSpend)} />
            <Preview label="Tổng NS" value={fmtMoney(total)} />
            <Preview label="CPL" value={fmtMoney(total != null && leads ? total / leads : null)} />
            <Preview label="CAC" value={fmtMoney(total != null && hvm ? total / hvm : null)} />
          </div>
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
                    line: "b2c_system",
                    periodType: "month",
                    period,
                    budget: f.budget || null,
                    leads: f.leads || null,
                    newStudents: f.newStudents || null,
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
              <th className="px-3 py-2 text-right font-medium">Lead (ads TT)</th>
              <th className="px-3 py-2 text-right font-medium">HVM (ads TT)</th>
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
