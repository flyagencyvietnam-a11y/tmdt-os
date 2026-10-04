"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ECOM_PRODUCTS, ECOM_PRODUCT_LABELS } from "@/lib/ads-metrics";
import { cn } from "@/lib/utils";
import { deleteEcomProductPeriodAction, saveEcomProductPeriodAction } from "./actions";
import { F } from "./ads-ui";
import { axisProps, ChartCard, ChartTooltip, gridProps, heatStyle } from "./charts";
import { ecomAggregate, ecomMonthlyTotal, ecomPeriods, makeEcomPeriod, type EcomAgg, type EcomPeriod, type EcomProductRow } from "./rollups";
import { fmt, fmtMoney, fmtPct, num, type MetricRow } from "./shared";
import { Segmented } from "./weekly-view";

type Metric = "spend" | "mql" | "newStudents" | "revenue" | "cac" | "roas";
const METRIC_LABEL: Record<Metric, string> = { spend: "Spend", mql: "MQL", newStudents: "HV", revenue: "Doanh thu", cac: "CAC", roas: "ROAS" };
const BAD_WHEN_HIGH: Metric[] = ["cac"];

const fmtRoas = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}x`);
const ALL = "all";

/**
 * Ecom (TMĐT) chia nhỏ theo SẢN PHẨM — theo báo cáo "TMĐT theo sản phẩm theo tháng".
 * Spend lấy từ Campaign Monitor/Ads tracker, MQL/HV/Doanh thu từ Lead Sheet (tháng
 * tính theo ngày tiếp nhận lead). Giai đoạn Test T6-T7 chỉ có số gộp.
 */
export function EcomProducts({ metrics, products, canManage, month }: { metrics: MetricRow[]; products: EcomProductRow[]; canManage: boolean; month: string }) {
  const periods = React.useMemo(() => ecomPeriods(products), [products]);
  const defaultKey = () => periods.find((p) => p.months.includes(month))?.key ?? periods[periods.length - 1]?.key ?? ALL;
  const [sel, setSel] = React.useState<string>(defaultKey);
  const [editing, setEditing] = React.useState<{ period: EcomPeriod | null } | null>(null);
  const [metric, setMetric] = React.useState<Metric>("spend");

  // Theo dõi tháng đang xem: khi đổi tháng thì nhảy sang kỳ chứa tháng đó (nếu có).
  const [seenMonth, setSeenMonth] = React.useState(month);
  if (seenMonth !== month) {
    setSeenMonth(month);
    const hit = periods.find((p) => p.months.includes(month));
    if (hit) setSel(hit.key);
  }

  const selected = sel === ALL ? null : (periods.find((p) => p.key === sel) ?? null);
  const inSel = (r: EcomProductRow) => sel === ALL || r.period === sel;
  const selMonths = selected ? selected.months : [...new Set(periods.flatMap((p) => p.months))];
  const selLabel = selected ? selected.label : "Tất cả kỳ";

  const productKeys = ECOM_PRODUCTS.map((p) => p.key as string).filter((k) => products.some((r) => r.product === k));
  const rowsOf = (key: string) => products.filter((r) => r.product === key && inSel(r));
  const perProduct = productKeys.map((k) => ({ key: k, label: ECOM_PRODUCT_LABELS[k] ?? k, agg: ecomAggregate(rowsOf(k)), has: rowsOf(k).length > 0 })).filter((x) => x.has);
  const sum = ecomAggregate(products.filter(inSel));
  const ecomTotal = ecomMonthlyTotal(metrics, selMonths);
  const unallocated = ecomTotal.spend != null && sum.spend != null ? ecomTotal.spend - sum.spend : null;
  const maxSpend = Math.max(1, ...perProduct.map((x) => x.agg.spend ?? 0));

  if (periods.length === 0) {
    return (
      <section className="rounded-xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        Chưa có số liệu Ecom theo sản phẩm.
        {canManage && (
          <div className="mt-3">
            <Button size="sm" onClick={() => setEditing({ period: null })}>
              <Plus className="mr-1 h-4 w-4" /> Nhập số theo sản phẩm
            </Button>
          </div>
        )}
        {editing && <PeriodDialog existing={products} period={editing.period} defaultMonth={month} onOpenChange={(o) => !o && setEditing(null)} />}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="mr-auto min-w-0">
            <h3 className="text-sm font-semibold">Ecom theo sản phẩm — {selLabel}</h3>
            <p className="text-xs text-muted-foreground">Spend từ Campaign Monitor / Ads tracker; MQL, HV, Doanh thu từ Lead Sheet theo tháng tiếp nhận lead. CAC = Spend ÷ HV; ROAS = Doanh thu ÷ Spend.</p>
          </div>
          <Segmented value={sel} onChange={setSel} options={[...periods.map((p) => ({ value: p.key, label: p.label })), { value: ALL, label: "Tất cả kỳ" }]} />
          {canManage && (
            <>
              {selected && (
                <Button size="sm" variant="outline" onClick={() => setEditing({ period: selected })}>
                  <Pencil className="mr-1 h-4 w-4" /> Sửa kỳ này
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing({ period: null })}>
                <Plus className="mr-1 h-4 w-4" /> Thêm kỳ
              </Button>
            </>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
                <th className="min-w-40 px-3 py-2 text-left font-medium">Spend ads</th>
                <th className="px-3 py-2 text-right font-medium">MQL</th>
                <th className="px-3 py-2 text-right font-medium">HV chốt</th>
                <th className="px-3 py-2 text-right font-medium">Doanh thu</th>
                <th className="px-3 py-2 text-right font-medium">CP/MQL</th>
                <th className="px-3 py-2 text-right font-medium">CAC</th>
                <th className="px-3 py-2 text-right font-medium">CVR MQL→HV</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {perProduct.map(({ key, label, agg }) => (
                <tr key={key} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-[var(--series-3)]" style={{ width: `${((agg.spend ?? 0) / maxSpend) * 100}%` }} />
                      </div>
                      <span className="font-medium tabular-nums">{fmtMoney(agg.spend)}</span>
                      {sum.spend ? <span className="text-[11px] text-muted-foreground">{Math.round(((agg.spend ?? 0) / sum.spend) * 100)}%</span> : null}
                    </div>
                  </td>
                  <Cells a={agg} />
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-semibold">
              <tr className="bg-muted/40">
                <td className="px-3 py-2">Tổng các sản phẩm</td>
                <td className="px-3 py-2 tabular-nums">{fmtMoney(sum.spend)}</td>
                <Cells a={sum} />
              </tr>
              {unallocated != null && Math.abs(unallocated) >= 1 && (
                <tr className="font-normal text-muted-foreground">
                  <td className="px-3 py-1.5" title="Chênh giữa tổng chi Ecom (bảng tháng) và tổng spend gom được theo campaign">
                    Spend chưa phân bổ theo sản phẩm
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{fmtMoney(unallocated)}</td>
                  <td colSpan={7} />
                </tr>
              )}
              <tr className="bg-muted/40">
                <td className="px-3 py-2">Tổng Ecom (bảng tháng)</td>
                <td className="px-3 py-2 tabular-nums">{fmtMoney(ecomTotal.spend)}</td>
                <Cells a={ecomTotal} />
              </tr>
              <tr className="font-normal text-muted-foreground">
                <td className="px-3 py-1.5" title="Số theo sản phẩm (Lead Sheet) khác bảng tháng vì HV/doanh thu ghi nhận theo tháng khác nhau">
                  Chênh lệch (SP − bảng tháng)
                </td>
                <td className="px-3 py-1.5 tabular-nums">{fmtDiff(sum.spend, ecomTotal.spend, true)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtDiff(sum.mql, ecomTotal.mql)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtDiff(sum.newStudents, ecomTotal.newStudents)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtDiff(sum.revenue, ecomTotal.revenue, true)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ChartCard
          title="Spend vs Doanh thu theo sản phẩm"
          description={selLabel}
          legend={[
            { label: "Spend", color: "var(--series-3)" },
            { label: "Doanh thu", color: "var(--series-1)" },
          ]}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perProduct.map((x) => ({ label: shortLabel(x.label), spend: x.agg.spend, revenue: x.agg.revenue }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={0} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} />} />
                <Bar dataKey="spend" name="Spend" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Doanh thu" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <PeriodMatrix products={products} periods={periods} productKeys={productKeys} metric={metric} onMetric={setMetric} activeKey={sel} onPick={setSel} />
      </div>

      {editing && <PeriodDialog existing={products} period={editing.period} defaultMonth={month} onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}

const SHORT: Record<string, string> = { tesol_epath: "TESOL", ft15: "FT15", chinese: "T.Trung", flextrack: "FlexTrack", ielts: "IELTS", giao_tiep: "Giao tiếp", other: "Khác" };
const SHORT_BY_LABEL: Record<string, string> = Object.fromEntries(ECOM_PRODUCTS.map((p) => [p.label, SHORT[p.key]]));
function shortLabel(l: string): string {
  return SHORT_BY_LABEL[l] ?? l;
}

function fmtDiff(a: number | null, b: number | null, money = false): string {
  if (a == null || b == null) return "—";
  const d = a - b;
  if (Math.abs(d) < 0.5) return "0";
  const s = money ? fmtMoney(Math.abs(d)) : Math.round(Math.abs(d)).toLocaleString("vi-VN");
  return `${d > 0 ? "+" : "−"}${s}`;
}

function Cells({ a }: { a: EcomAgg }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(a.mql)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(a.newStudents)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.revenue)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.cpmql)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.cac)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(a.cvr)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtRoas(a.roas)}</td>
    </>
  );
}

/** Bảng nhiệt sản phẩm × kỳ cho 1 chỉ số + cột/hàng Tổng. */
function PeriodMatrix({
  products,
  periods,
  productKeys,
  metric,
  onMetric,
  activeKey,
  onPick,
}: {
  products: EcomProductRow[];
  periods: EcomPeriod[];
  productKeys: string[];
  metric: Metric;
  onMetric: (m: Metric) => void;
  activeKey: string;
  onPick: (k: string) => void;
}) {
  const val = (rows: EcomProductRow[]): number | null => (rows.length ? ((ecomAggregate(rows) as unknown as Record<string, number | null>)[metric] ?? null) : null);
  const cell = (key: string | null, p: EcomPeriod | null) => val(products.filter((r) => (key == null || r.product === key) && (p == null || r.period === p.key)));
  const all = productKeys.flatMap((k) => periods.map((p) => cell(k, p))).filter((v): v is number => v != null);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const f = (v: number | null) => (v == null ? "—" : metric === "mql" || metric === "newStudents" ? fmt(v) : metric === "roas" ? fmtRoas(v) : fmtMoney(v));
  const bad = BAD_WHEN_HIGH.includes(metric);
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold">Sản phẩm × kỳ — {METRIC_LABEL[metric]}</h3>
          <p className="text-xs text-muted-foreground">{bad ? "Đỏ đậm = cao (chi phí cao là xấu)." : "Xanh đậm = cao."} Bấm tiêu đề kỳ để xem chi tiết kỳ đó.</p>
        </div>
        <Segmented value={metric} onChange={onMetric} options={(Object.keys(METRIC_LABEL) as Metric[]).map((k) => ({ value: k, label: METRIC_LABEL[k] }))} />
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
              {periods.map((p) => (
                <th key={p.key} className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => onPick(p.key)} className={cn("whitespace-nowrap rounded px-1 hover:bg-muted hover:text-foreground", p.key === activeKey && "bg-brand/10 text-brand")}>
                    {p.label.replace(" (gộp)", "")}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Tổng</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {productKeys.map((k) => (
              <tr key={k}>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{shortLabel(ECOM_PRODUCT_LABELS[k] ?? k)}</td>
                {periods.map((p) => {
                  const v = cell(k, p);
                  return (
                    <td key={p.key} style={heatStyle(v, min, max, bad)} className={cn("whitespace-nowrap px-2 py-1.5 text-right tabular-nums", v == null && "text-muted-foreground/50")}>
                      {f(v)}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">{f(cell(k, null))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/40 font-semibold">
            <tr>
              <td className="px-3 py-1.5">Tổng cộng</td>
              {periods.map((p) => (
                <td key={p.key} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {f(cell(null, p))}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{f(cell(null, null))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

type Draft = Record<string, { spend: string; mql: string; newStudents: string; revenue: string }>;

/** Thêm kỳ mới / sửa 1 kỳ: lưới sản phẩm × (Spend, MQL, HV, Doanh thu). Dòng để trống hoàn toàn sẽ bị bỏ. */
function PeriodDialog({ existing, period, defaultMonth, onOpenChange }: { existing: EcomProductRow[]; period: EcomPeriod | null; defaultMonth: string; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [from, setFrom] = React.useState(period?.key ?? defaultMonth);
  const [to, setTo] = React.useState(period?.periodEnd ?? "");
  const rowsFor = (key: string) => existing.filter((r) => r.period === key);
  const [draft, setDraft] = React.useState<Draft>(() => {
    const d: Draft = {};
    for (const p of ECOM_PRODUCTS) {
      const r = period ? rowsFor(period.key).find((x) => x.product === p.key) : undefined;
      d[p.key] = { spend: r?.spend ?? "", mql: r?.mql ?? "", newStudents: r?.newStudents ?? "", revenue: r?.revenue ?? "" };
    }
    return d;
  });
  const set = (k: string, f: keyof Draft[string], v: string) => setDraft((p) => ({ ...p, [k]: { ...p[k], [f]: v } }));
  const preview = makeEcomPeriod(from, to || null);
  const totals = ECOM_PRODUCTS.reduce((s, p) => s + (num(draft[p.key].spend) ?? 0), 0);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{period ? `Sửa số theo sản phẩm — ${period.label}` : "Thêm kỳ số liệu theo sản phẩm"}</DialogTitle>
          <DialogDescription>Mỗi dòng 1 sản phẩm. Để trống cả 4 ô nếu sản phẩm không chạy trong kỳ. Giai đoạn chỉ có số gộp nhiều tháng (vd. T6–T7) thì chọn thêm “đến tháng”.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!period && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Từ tháng">
                <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
              </F>
              <F label="Đến tháng (chỉ khi số gộp nhiều tháng)">
                <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
              </F>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Sản phẩm</th>
                  <th className="px-2 py-2 text-left font-medium">Spend (VND)</th>
                  <th className="px-2 py-2 text-left font-medium">MQL</th>
                  <th className="px-2 py-2 text-left font-medium">HV chốt</th>
                  <th className="px-2 py-2 text-left font-medium">Doanh thu (VND)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ECOM_PRODUCTS.map((p) => (
                  <tr key={p.key}>
                    <td className="px-3 py-1.5 font-medium">{p.label}</td>
                    {(["spend", "mql", "newStudents", "revenue"] as const).map((f) => (
                      <td key={f} className="px-1.5 py-1">
                        <Input type="number" className="h-8" value={draft[p.key][f]} onChange={(e) => set(p.key, f, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Kỳ: <b className="text-foreground">{preview.label}</b> · tổng spend các sản phẩm: <b className="text-foreground">{fmtMoney(totals)}</b>
          </p>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            {period ? (
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-600"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Xoá toàn bộ số theo sản phẩm của kỳ ${period.label}?`)) return;
                  start(async () => {
                    const res = await deleteEcomProductPeriodAction(period.key);
                    if (res.ok) {
                      toast.success("Đã xoá kỳ.");
                      onOpenChange(false);
                      router.refresh();
                    } else toast.error(res.error);
                  });
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Xoá kỳ
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button
                disabled={pending || !/^\d{4}-\d{2}$/.test(from)}
                onClick={() =>
                  start(async () => {
                    const res = await saveEcomProductPeriodAction({
                      period: period?.key ?? from,
                      periodEnd: period ? period.periodEnd : to || null,
                      rows: ECOM_PRODUCTS.map((p) => ({ product: p.key, spend: draft[p.key].spend || null, mql: draft[p.key].mql || null, newStudents: draft[p.key].newStudents || null, revenue: draft[p.key].revenue || null })),
                    });
                    if (res.ok) {
                      toast.success("Đã lưu.");
                      onOpenChange(false);
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                Lưu
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
