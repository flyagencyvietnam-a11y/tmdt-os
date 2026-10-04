"use client";

import * as React from "react";
import { tierScore, type EffectivenessRubric } from "@/lib/ads-metrics";
import { cn } from "@/lib/utils";
import { EffBadge } from "./ads-ui";
import { heatStyle } from "./charts";
import { fmt, fmtMoney, fmtPct, monthLabel, type AggDerived, type MetricRow, type SbuLite } from "./shared";
import { Segmented } from "./weekly-view";

/** Màu đèn giao thông theo mức 1-5 — LUÔN đi kèm chữ/số trong ô nên không phụ thuộc riêng màu. */
export const TIER_CLASS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300",
  4: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  3: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  2: "bg-orange-500/25 text-orange-800 dark:text-orange-300",
  1: "bg-red-500/25 text-red-800 dark:text-red-300",
};
const TIER_NAME: Record<1 | 2 | 3 | 4 | 5, string> = { 5: "Rất hiệu quả", 4: "Hiệu quả", 3: "Chấp nhận được", 2: "Cần tối ưu", 1: "Kém hiệu quả" };

const clampTier = (n: number): 1 | 2 | 3 | 4 | 5 => Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;

type Shown = "result" | "all";

interface Cell {
  sbu: SbuLite;
  period: string;
  d: AggDerived;
}

/**
 * Bảng tổng hợp MỌI chỉ số của ads ngân sách riêng từng trung tâm (trung tâm × tháng) trong 1 bảng.
 * Heatmap có luật cố định (không tô theo min–max tương đối):
 *  - CPL / CAC / Điểm HQ: 5 mức theo thang ở Cài đặt (rubric) — xanh lục = rất tốt → đỏ = kém.
 *  - HVM = 0 khi đã chi tiền: đỏ (chi mà chưa ra học viên).
 *  - Ngân sách / Lead / HVM / CVR: xanh dương đậm dần theo độ lớn trong cột (chỉ để so sánh quy mô).
 */
export function CenterTrendTable({
  sbus,
  months,
  rows,
  der,
  rubric,
  activeMonth,
  onPickMonth,
}: {
  sbus: SbuLite[];
  months: string[];
  rows: (p: string, sbuId: string) => MetricRow[];
  der: (r: MetricRow[]) => AggDerived;
  rubric: EffectivenessRubric;
  activeMonth: string;
  onPickMonth: (m: string) => void;
}) {
  const [shown, setShown] = React.useState<Shown>("result");

  const groups = sbus
    .map((sbu) => {
      const cells: Cell[] = months
        .map((period) => ({ sbu, period, raw: rows(period, sbu.id) }))
        .filter((c) => c.raw.length > 0)
        .map((c) => ({ sbu, period: c.period, d: der(c.raw) }))
        // Bỏ dòng rỗng hoàn toàn (0 chi, 0 lead, 0 HVM) — không có thông tin.
        .filter((c) => (c.d.spend ?? 0) > 0 || (c.d.leads ?? 0) > 0 || (c.d.newStudents ?? 0) > 0)
        .filter((c) => shown === "all" || c.d.leads != null || c.d.newStudents != null);
      return { sbu, cells, total: der(cells.flatMap((c) => rows(c.period, sbu.id))) };
    })
    .filter((g) => g.cells.length > 0);

  const allCells = groups.flatMap((g) => g.cells);
  const grand = der(allCells.flatMap((c) => rows(c.period, c.sbu.id)));
  const range = (pick: (d: AggDerived) => number | null) => {
    const v = allCells.map((c) => pick(c.d)).filter((x): x is number => x != null);
    return { min: Math.min(...v), max: Math.max(...v) };
  };
  const rSpend = range((d) => d.spend);
  const rLead = range((d) => d.leads);
  const rHvm = range((d) => d.newStudents);
  const rCvr = range((d) => d.cvr);

  const tier = (cls: 1 | 2 | 3 | 4 | 5 | null) => (cls ? TIER_CLASS[cls] : undefined);
  const cplTier = (d: AggDerived) => (d.cpl != null ? tierScore(d.cpl, rubric.cplTiers) : null);
  const cacTier = (d: AggDerived) => (d.cac != null ? tierScore(d.cac, rubric.cacTiers) : null);
  const scoreTier = (d: AggDerived) => (d.effectivenessScore != null ? clampTier(d.effectivenessScore) : null);
  const hvmTier = (d: AggDerived) => (d.spend && d.newStudents === 0 ? (1 as const) : null);

  const cells = (d: AggDerived, total = false) => (
    <>
      <td style={total ? undefined : heatStyle(d.spend, rSpend.min, rSpend.max)} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
        {fmtMoney(d.spend)}
      </td>
      <td style={total ? undefined : heatStyle(d.leads, rLead.min, rLead.max)} className="px-2 py-1.5 text-right tabular-nums">
        {fmt(d.leads)}
      </td>
      <td
        style={total || hvmTier(d) ? undefined : heatStyle(d.newStudents, rHvm.min, rHvm.max)}
        className={cn("px-2 py-1.5 text-right tabular-nums", !total && tier(hvmTier(d)), hvmTier(d) && "font-semibold")}
      >
        {fmt(d.newStudents)}
      </td>
      <td className={cn("whitespace-nowrap px-2 py-1.5 text-right tabular-nums", !total && tier(cplTier(d)))}>{fmtMoney(d.cpl)}</td>
      <td className={cn("whitespace-nowrap px-2 py-1.5 text-right tabular-nums", !total && tier(cacTier(d)))}>{fmtMoney(d.cac)}</td>
      <td style={total ? undefined : heatStyle(d.cvr, rCvr.min, rCvr.max)} className="px-2 py-1.5 text-right tabular-nums">
        {fmtPct(d.cvr)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", !total && tier(scoreTier(d)))}>{d.effectivenessScore != null ? d.effectivenessScore.toFixed(1) : "—"}</td>
      <td className="px-2 py-1.5">
        <EffBadge label={d.effectivenessLabel} />
      </td>
    </>
  );

  const k = (n: number) => `${Math.round(n / 1000).toLocaleString("vi-VN")}N`;
  const [c5, c4, c3, c2] = rubric.cplTiers;
  const [a5, a4, a3, a2] = rubric.cacTiers;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto min-w-0">
          <h3 className="text-sm font-semibold">Tổng hợp chỉ số theo trung tâm × tháng</h3>
          <p className="text-xs text-muted-foreground">Ads ngân sách riêng từng TT. Mọi chỉ số trong 1 bảng; bấm tên tháng để xem chi tiết tháng đó.</p>
        </div>
        <Segmented
          value={shown}
          onChange={setShown}
          options={[
            { value: "result", label: "Tháng có kết quả (từ T7)" },
            { value: "all", label: "Tất cả tháng" },
          ]}
        />
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Quy tắc màu</span>
        {([5, 4, 3, 2, 1] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-5 rounded-sm", TIER_CLASS[t].split(" ")[0])} />
            {TIER_NAME[t]}
          </span>
        ))}
        <span>
          CPL: ≤{k(c5)} · ≤{k(c4)} · ≤{k(c3)} · ≤{k(c2)} · cao hơn
        </span>
        <span>
          CAC: ≤{k(a5)} · ≤{k(a4)} · ≤{k(a3)} · ≤{k(a2)} · cao hơn
        </span>
        <span>HVM = 0 khi đã chi: đỏ</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={heatStyle(1, 0, 1)} />
          NS / Lead / HVM / CVR: xanh dương càng đậm càng lớn
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Chưa có số liệu để hiển thị.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Trung tâm</th>
                <th className="px-2 py-2 text-left font-medium">Tháng</th>
                <th className="px-2 py-2 text-right font-medium">Tổng NS</th>
                <th className="px-2 py-2 text-right font-medium">Lead</th>
                <th className="px-2 py-2 text-right font-medium">HVM</th>
                <th className="px-2 py-2 text-right font-medium">CPL</th>
                <th className="px-2 py-2 text-right font-medium">CAC</th>
                <th className="px-2 py-2 text-right font-medium">CVR</th>
                <th className="px-2 py-2 text-right font-medium">Điểm /5</th>
                <th className="px-2 py-2 text-left font-medium">Đánh giá</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.sbu.id} className="divide-y border-t">
                {g.cells.map((c, i) => (
                  <tr key={c.period} className="hover:bg-muted/20">
                    {i === 0 && (
                      <th rowSpan={g.cells.length + (g.cells.length > 1 ? 1 : 0)} scope="rowgroup" className="border-r px-3 py-1.5 text-left align-top font-semibold" title={g.sbu.name}>
                        {g.sbu.code}
                      </th>
                    )}
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => onPickMonth(c.period)} className={cn("rounded px-1 hover:bg-muted", c.period === activeMonth && "bg-brand/10 font-semibold text-brand")}>
                        {monthLabel(c.period, true)}
                      </button>
                    </td>
                    {cells(c.d)}
                  </tr>
                ))}
                {g.cells.length > 1 && (
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-2 py-1.5 text-xs">Cộng</td>
                    {cells(g.total, true)}
                  </tr>
                )}
              </tbody>
            ))}
            <tfoot className="border-t-2 bg-muted/40 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={2}>
                  Tổng cộng tất cả trung tâm
                </td>
                {cells(grand, true)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
