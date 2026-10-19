"use client";

import { Coins, MessageCircle, Percent, Target, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line as RLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeltaBadge, StatCard } from "@/components/stat-card";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";
import { InlineNum, useMetricSaver, type NumField } from "./ads-inline";
import { axisProps, ChartCard, ChartTooltip, gridProps, heatStyle, Sparkline } from "./charts";
import { isDerivedField, isSynthetic } from "./month-derive";
import { change, fmt, fmtMoney, fmtPct, type MetricRow, type PeriodType } from "./shared";
import { bucketRows, indexRows, rowsOfUnit, totalFunnel, unitFunnel, type AdsUnit, type Funnel } from "./units";

/**
 * KHUNG BÁO CÁO CHUNG cho Báo cáo TUẦN / THÁNG / QUÝ (SPEC Phụ lục D mục 26). Ma trận: mỗi SBU là một khối, mỗi chỉ số một dòng,
 * mỗi kỳ một cột (format B2C cũ) — Hệ thống, 10 trung tâm, Ecom, VMP, VMT cùng một danh sách, có dòng Tổng cộng.
 * Ba báo cáo chỉ khác nhau ở: loại kỳ đọc từ DB (tuần/tháng), tập chỉ số, và có cho sửa ô hay không (quý = cộng 3 tháng, chỉ xem).
 */

export interface Bucket {
  key: string;
  /** Nhãn đầy đủ (đầu cột, tooltip). */
  label: string;
  /** Nhãn ngắn (trục biểu đồ). */
  short: string;
  /** Các kỳ gốc (tuần/tháng) cộng lại thành cột này. */
  periods: string[];
  /** Kỳ gốc để ghi số khi sửa ô; vắng = chỉ xem (quý). */
  editPeriod?: string;
  /** Ghi chú nhỏ dưới tiêu đề cột (vd. "2/3 tháng"). */
  note?: string;
}

export type MetricKey = "spend" | "messages" | "costPerMess" | "leads" | "hvm" | "cpl" | "cac" | "cvr" | "revenue" | "roas";

interface MetricDef {
  chip: string;
  kind: "money" | "count" | "pct" | "x";
  badWhenHigh?: boolean;
  value: (f: Funnel) => number | null;
  /** Chỉ hiện cho đơn vị này (vd. Doanh thu chỉ Ecom). */
  only?: (u: AdsUnit) => boolean;
  /** Có ở dòng Tổng cộng. */
  inTotal: boolean;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  spend: { chip: "Ngân sách", kind: "money", value: (f) => f.spend, inTotal: true },
  messages: { chip: "Mess", kind: "count", value: (f) => f.messages, inTotal: true },
  costPerMess: { chip: "CP/Mess", kind: "money", badWhenHigh: true, value: (f) => f.costPerMess, inTotal: true },
  leads: { chip: "Lead", kind: "count", value: (f) => f.leads, inTotal: true },
  hvm: { chip: "HVM", kind: "count", value: (f) => f.hvm, inTotal: true },
  cpl: { chip: "CPL", kind: "money", badWhenHigh: true, value: (f) => f.cpl, inTotal: true },
  cac: { chip: "CAC", kind: "money", badWhenHigh: true, value: (f) => f.cac, inTotal: true },
  cvr: { chip: "CVR", kind: "pct", value: (f) => f.cvr, inTotal: true },
  revenue: { chip: "Doanh thu (Ecom)", kind: "money", value: (f) => f.revenue, only: (u) => u.line === "ecom", inTotal: false },
  roas: { chip: "ROAS (Ecom)", kind: "x", value: (f) => f.roas, only: (u) => u.line === "ecom", inTotal: false },
};

/** Nhãn dòng chỉ số theo đơn vị. Dòng Hệ thống mang số TỔNG B2C nên ghi rõ. */
function metricLabel(m: MetricKey, u?: AdsUnit): string {
  const ho = u?.kind === "ho";
  switch (m) {
    case "spend":
      return "Ngân sách";
    case "messages":
      return "Mess";
    case "costPerMess":
      return "CP / Mess";
    case "leads":
      return ho ? "Lead · tổng B2C" : u?.leadField === "mql" ? "Lead (MQL)" : "Lead";
    case "hvm":
      return ho ? "HVM · tổng B2C" : "HVM";
    case "cpl":
      return ho ? "CPL · tổng B2C" : u?.leadField === "mql" ? "CPL (CP/MQL)" : "CPL";
    case "cac":
      return ho ? "CAC · tổng B2C" : "CAC";
    case "cvr":
      return "CVR";
    case "revenue":
      return "Doanh thu";
    case "roas":
      return "ROAS";
  }
}

/** Các cột thô tạo nên mỗi chỉ số — để biết ô có dùng số tạm tính từ tuần hay không (month-derive.ts). */
const METRIC_FIELDS: Record<MetricKey, string[]> = {
  spend: ["budget", "centerOrderBudget", "hoTopupBudget"],
  messages: ["messages"],
  costPerMess: ["budget", "centerOrderBudget", "hoTopupBudget", "messages"],
  leads: ["leads", "mql"],
  hvm: ["newStudents"],
  cpl: ["budget", "centerOrderBudget", "hoTopupBudget", "leads", "mql"],
  cac: ["budget", "centerOrderBudget", "hoTopupBudget", "newStudents"],
  cvr: ["leads", "mql", "newStudents"],
  revenue: ["revenue"],
  roas: ["revenue", "budget"],
};

function derivedCell(rows: MetricRow[], u: AdsUnit | null, m: MetricKey): boolean {
  const fields = METRIC_FIELDS[m];
  return (u ? rowsOfUnit(rows, u) : rows).some((r) => fields.some((f) => isDerivedField(r, f)));
}
const rowsDerived = (rows: MetricRow[]) => rows.some((r) => isSynthetic(r) || !!r.derivedFields?.length);

/** Trường thô sửa được ngay trên ô cho (chỉ số, đơn vị); null = chỉ số suy ra, không sửa trực tiếp. */
function editField(m: MetricKey, u: AdsUnit): NumField | null {
  switch (m) {
    case "spend":
      // Trung tâm: ô này sửa phần NS Trung tâm order; phần P.MKT chạy thêm sửa ở form đầy đủ (báo cáo tháng).
      return u.kind === "center" ? "centerOrderBudget" : "budget";
    case "messages":
      return "messages";
    case "leads":
      return u.leadField;
    case "hvm":
      return "newStudents";
    case "revenue":
      return "revenue";
    default:
      return null;
  }
}

function show(kind: MetricDef["kind"], v: number): string {
  return kind === "money" ? fmtMoney(v) : kind === "pct" ? fmtPct(v) : kind === "x" ? `${v.toFixed(2)}x` : fmt(v);
}

const unitName = (u: AdsUnit) => (u.kind === "ho" ? "Hệ thống (HO)" : u.code);

export function PeriodReport({
  kind,
  periodType,
  metrics,
  units,
  buckets,
  prevBuckets,
  rangeLabel,
  rangeHint,
  canManage,
  picker,
  metricSet,
  defaultOn,
  persistKey,
  title,
  description,
  tableActions,
  detailMetrics,
  onOpenDetail,
  below,
}: {
  kind: "week" | "month" | "quarter";
  /** Loại kỳ đọc từ DB: tuần hoặc tháng (quý đọc tháng). */
  periodType: PeriodType;
  metrics: MetricRow[];
  units: AdsUnit[];
  buckets: Bucket[];
  prevBuckets: Bucket[];
  rangeLabel: string;
  rangeHint?: string;
  canManage: boolean;
  picker: React.ReactNode;
  metricSet: MetricKey[];
  defaultOn: MetricKey[];
  persistKey: string;
  title: string;
  description: React.ReactNode;
  tableActions?: React.ReactNode;
  /** Các chỉ số suy ra mà bấm vào ô sẽ mở form đầy đủ của (SBU, kỳ). */
  detailMetrics?: MetricKey[];
  onOpenDetail?: (u: AdsUnit, bucket: Bucket) => void;
  /** Khối riêng của từng báo cáo, đặt dưới bảng. */
  below?: React.ReactNode;
}) {
  const saveMetric = useMetricSaver();
  const [on, setOn] = useSessionState<MetricKey[]>(`ads:metrics:${persistKey}`, defaultOn);
  const [hideEmpty, setHideEmpty] = useSessionState<boolean>(`ads:hideempty:${persistKey}`, false);
  const active = metricSet.filter((m) => on.includes(m));

  const idx = React.useMemo(() => indexRows(metrics), [metrics]);
  const data = React.useMemo(
    () =>
      buckets.map((bucket) => {
        const rows = bucketRows(idx, periodType, bucket.periods);
        return { bucket, rows, total: totalFunnel(rows), byUnit: new Map(units.map((u) => [u.key, unitFunnel(rows, u)])) };
      }),
    [idx, buckets, units, periodType],
  );

  // Thẻ KPI = TỔNG cả khoảng đã chọn, so với khoảng liền trước có cùng số kỳ.
  const cur = React.useMemo(() => totalFunnel(bucketRows(idx, periodType, buckets.flatMap((b) => b.periods))), [idx, buckets, periodType]);
  const prv = React.useMemo(() => (prevBuckets.length ? totalFunnel(bucketRows(idx, periodType, prevBuckets.flatMap((b) => b.periods))) : null), [idx, prevBuckets, periodType]);
  const d = (a: number | null | undefined, b: number | null | undefined) => (prv ? change(a, b) : null);

  const chartData = data.map((x) => ({ key: x.bucket.key, label: x.bucket.short, full: x.bucket.label, spend: x.total.spend, leads: x.total.leads, hvm: x.total.hvm, cpl: x.total.cpl, cac: x.total.cac, messages: x.total.messages }));
  const fullOf = (l: string) => chartData.find((c) => c.label === l)?.full ?? l;
  const unitWord = kind === "week" ? "tuần" : kind === "month" ? "tháng" : "quý";

  const visibleUnits = hideEmpty
    ? units.filter((u) => data.some((x) => {
        const f = x.byUnit.get(u.key)!;
        return f.spend != null || f.leads != null || f.hvm != null || f.messages != null;
      }))
    : units;

  const sourceNote =
    kind === "quarter"
      ? "Quý = cộng 3 dòng THÁNG (không nhập trực tiếp ở đây — sửa số ở Báo cáo tháng)."
      : kind === "month"
        ? "Số tháng ưu tiên số nhập chính thức; ô còn trống tự cộng từ các tuần (tuần tính vào tháng chiếm nhiều ngày nhất) và hiển thị nghiêng."
        : "Mỗi tuần được tính nguyên vẹn vào tháng chiếm nhiều ngày nhất của tuần.";

  return (
    <div className="space-y-4">
      {picker}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={`Tổng chi ${rangeLabel}`} value={fmtMoney(cur.spend)} icon={Coins} tone="brand" delta={d(cur.spend, prv?.spend)} deltaGoodWhen="down" hint={rangeHint} />
        <StatCard label="Lead / Data" value={fmt(cur.leads)} icon={Users} tone="info" delta={d(cur.leads, prv?.leads)} hint="Ecom tính MQL" />
        <StatCard label="HVM" value={fmt(cur.hvm)} icon={UserPlus} tone="ok" delta={d(cur.hvm, prv?.hvm)} hint="Học viên mới" />
        <StatCard label="CPL" value={fmtMoney(cur.cpl)} icon={Target} delta={d(cur.cpl, prv?.cpl)} deltaGoodWhen="down" hint="Chi của SBU đã có Lead ÷ Lead" />
        <StatCard label="CAC" value={fmtMoney(cur.cac)} icon={Target} delta={d(cur.cac, prv?.cac)} deltaGoodWhen="down" hint="Chi của SBU đã có HVM ÷ HVM" />
        {kind === "week" ? (
          <StatCard label="Mess" value={fmt(cur.messages)} icon={MessageCircle} tone="info" delta={d(cur.messages, prv?.messages)} hint={cur.costPerMess != null ? `${fmtMoney(cur.costPerMess)} / mess` : undefined} />
        ) : (
          <StatCard label="CVR Lead → HVM" value={fmtPct(cur.cvr)} icon={Percent} delta={d(cur.cvr, prv?.cvr)} />
        )}
      </div>

      <div className={cn("grid gap-4", kind === "week" ? "md:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-3")}>
        <ChartCard title={`Chi tiêu theo ${unitWord}`} description="Tổng mọi SBU.">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} fmtLabel={fullOf} />} />
                <Bar dataKey="spend" name="Chi tiêu" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Lead & HVM"
          description="Số tổng (B2C lấy theo dòng Hệ thống)."
          legend={[
            { label: "Lead", color: "var(--series-1)" },
            { label: "HVM", color: "var(--series-3)" },
          ]}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={36} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtLabel={fullOf} />} />
                <Bar dataKey="leads" name="Lead" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="hvm" name="HVM" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
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
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} fmtLabel={fullOf} />} />
                <RLine type="monotone" dataKey="cpl" name="CPL" stroke="var(--series-7)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
                <RLine type="monotone" dataKey="cac" name="CAC" stroke="var(--series-8)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        {kind === "week" && (
          <ChartCard title="Số mess theo tuần" description="Tổng mọi SBU.">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={40} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtLabel={fullOf} />} />
                  <Bar dataKey="messages" name="Mess" fill="var(--series-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="mr-auto min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {description} {sourceNote}
            </p>
          </div>
          {tableActions}
        </header>

        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-4 py-2 text-xs">
          <span className="mr-1 font-medium text-muted-foreground">Chỉ số hiển thị</span>
          {metricSet.map((m) => {
            const isOn = on.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={isOn}
                onClick={() => setOn(isOn ? on.filter((x) => x !== m) : [...on, m])}
                className={cn("rounded-full border px-2.5 py-0.5 transition-colors", isOn ? "border-brand/40 bg-brand/10 font-medium text-brand" : "bg-background text-muted-foreground hover:text-foreground")}
              >
                {METRICS[m].chip}
              </button>
            );
          })}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="accent-brand" />
            Ẩn SBU chưa có số trong khoảng này
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 w-44 min-w-44 bg-muted px-3 py-2 text-left font-medium">SBU</th>
                <th className="sticky left-44 z-10 min-w-32 bg-muted px-2 py-2 text-left font-medium">Chỉ số</th>
                {data.map(({ bucket, rows }) => (
                  <th key={bucket.key} className="whitespace-nowrap px-2 py-2 text-right font-medium" title={bucket.label}>
                    {bucket.label}
                    {bucket.note && <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">{bucket.note}</div>}
                    {rowsDerived(rows) && <div className="text-[10px] font-normal text-sky-600 dark:text-sky-400">~ gồm số tạm tính từ tuần</div>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Δ {unitWord} cuối</th>
                <th className="px-3 py-2 text-left font-medium">Xu hướng</th>
              </tr>
            </thead>
            <tbody>
              {[{ u: null as AdsUnit | null }, ...visibleUnits.map((u) => ({ u }))].flatMap(({ u }) => {
                const defs = active.filter((m) => (u ? !METRICS[m].only || METRICS[m].only!(u) : METRICS[m].inTotal));
                return defs.map((m, mi) => {
                  const def = METRICS[m];
                  const vals = data.map((x) => def.value(u ? x.byUnit.get(u.key)! : x.total));
                  const present = vals.filter((v): v is number => v != null);
                  const min = Math.min(...present);
                  const max = Math.max(...present);
                  const last = vals[vals.length - 1];
                  const before = vals[vals.length - 2];
                  const first = mi === 0;
                  const total = u == null;
                  const stickyBg = total ? "bg-muted" : "bg-card";
                  const field = u ? editField(m, u) : null;
                  const clickable = !!u && !!onOpenDetail && !!detailMetrics?.includes(m);
                  return (
                    <tr key={`${u?.key ?? "total"}:${m}`} className={cn("hover:bg-muted/20", first ? "border-t-2 border-border" : "border-t border-border/50", total && "bg-muted/30 font-semibold")}>
                      <td className={cn("sticky left-0 z-10 whitespace-nowrap px-3 py-1", stickyBg)} title={u?.label}>
                        {first ? (total ? "Tổng cộng" : unitName(u!)) : ""}
                      </td>
                      <td className={cn("sticky left-44 z-10 whitespace-nowrap px-2 py-1 text-xs font-normal text-muted-foreground", stickyBg)} title={m === "hvm" && u ? u.conversionLabel : undefined}>
                        {metricLabel(m, u ?? undefined)}
                      </td>
                      {data.map((x, i) => {
                        const v = vals[i];
                        const row = u ? (rowsOfUnit(x.rows, u)[0] ?? null) : null;
                        const editable = canManage && !!x.bucket.editPeriod && !!field;
                        const fromWeeks = v != null && derivedCell(x.rows, u, m);
                        const display =
                          v == null ? (
                            <span className="text-muted-foreground/50">{editable ? "＋" : "—"}</span>
                          ) : fromWeeks ? (
                            <span className="italic text-sky-700 dark:text-sky-400">{show(def.kind, v)}</span>
                          ) : (
                            show(def.kind, v)
                          );
                        const openable = canManage && !!x.bucket.editPeriod && clickable;
                        return (
                          <td
                            key={x.bucket.key}
                            style={total ? undefined : heatStyle(v, min, max, def.badWhenHigh)}
                            className={cn("whitespace-nowrap px-2 py-1 text-right tabular-nums", openable && "cursor-pointer hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-brand/50")}
                            onClick={openable ? () => onOpenDetail!(u!, x.bucket) : undefined}
                            title={fromWeeks ? "Tạm tính từ các tuần của tháng (chưa có số chính thức)" : openable ? "Bấm để mở form đầy đủ của SBU và kỳ này" : undefined}
                          >
                            {editable ? (
                              <InlineNum
                                value={row && !isDerivedField(row, field!) ? row[field!] : null}
                                display={display}
                                title={`Sửa ${metricLabel(m, u!)} — ${unitName(u!)}, ${x.bucket.label}${m === "spend" && u!.kind === "center" ? " (phần NS Trung tâm order)" : ""}`}
                                onSave={(val) => saveMetric(row && !isSynthetic(row) ? row : null, { line: u!.line, periodType, period: x.bucket.editPeriod!, sbuId: u!.sbuId }, field!, val)}
                              />
                            ) : (
                              display
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1 text-right">{change(last, before) != null ? <DeltaBadge delta={change(last, before)!} goodWhen={def.badWhenHigh || m === "spend" ? "down" : "up"} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-1">
                        <Sparkline values={vals} color={u?.color ?? "var(--foreground)"} width={72} />
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Dòng <b>Hệ thống</b> mang Lead/HVM <b>tổng cả B2C</b> (CPL/CAC chia tổng ngân sách Hệ thống + trung tâm); số Lead/HVM của từng trung tâm là phần quy riêng cho ads ngân sách trung tâm — một phần của số tổng, không cộng thêm. Dòng Tổng cộng lấy số tổng B2C
          (nếu dòng Hệ thống chưa nhập thì tạm cộng từ các trung tâm) + Ecom (MQL) + VMP + VMT. Ô trống = chưa có số.
        </p>
      </section>

      {below}
    </div>
  );
}
