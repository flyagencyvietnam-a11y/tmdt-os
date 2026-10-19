"use client";

import * as React from "react";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { usePeriodRange } from "./period-range";
import { PeriodReport, type Bucket, type MetricKey } from "./period-report";
import { nextQuarter, quarterKey, quarterLabel, quarterMonths } from "./rollups";
import type { MetricRow } from "./shared";
import type { AdsUnit } from "./units";

const QUARTER_METRICS: MetricKey[] = ["spend", "leads", "hvm", "cpl", "cac", "cvr", "score", "messages", "costPerMess", "revenue", "roas"];
const QUARTER_DEFAULT: MetricKey[] = ["spend", "leads", "hvm", "cpl", "cac", "cvr", "score", "revenue", "roas"];

const quarterRangeText = (from: string, to: string, n: number) => (n <= 1 ? quarterLabel(to) : `${quarterLabel(from)} – ${quarterLabel(to)} (${n} quý)`);

/**
 * Báo cáo QUÝ của MỌI SBU (SPEC Phụ lục D mục 26): mỗi cột là 1 quý = CỘNG 3 dòng THÁNG (số tháng chính thức, ô trống thì tự cộng
 * từ tuần — mục 28). Chỉ xem — muốn sửa số, vào Báo cáo tháng. Quý đang dở được đánh dấu "x/3 tháng" để không đọc nhầm là cả quý.
 */
export function QuarterlyView({ metrics, units, canManage, currentMonth, months, rubric }: { metrics: MetricRow[]; units: AdsUnit[]; canManage: boolean; currentMonth: string; months: string[]; rubric: EffectivenessRubric }) {
  const dataQuarters = React.useMemo(() => [...new Set(months.map(quarterKey))].sort(), [months]);
  const range = usePeriodRange({
    storageKey: "quarter",
    dataKeys: dataQuarters,
    current: quarterKey(currentMonth),
    next: nextQuarter,
    label: quarterLabel,
    rangeText: quarterRangeText,
    unit: "quý",
    presets: [2, 4, 8, 0],
    defaultCount: 4,
    footer: "mỗi quý = cộng 3 tháng",
  });
  const toBucket = React.useCallback(
    (q: string): Bucket => {
      const ms = quarterMonths(q);
      const filled = ms.filter((m) => months.includes(m)).length;
      return { key: q, label: quarterLabel(q), short: `${quarterLabel(q, true)}/${q.slice(2, 4)}`, periods: ms, note: filled < 3 ? `${filled}/3 tháng có số` : undefined };
    },
    [months],
  );
  const buckets = React.useMemo(() => range.shown.map(toBucket), [range.shown, toBucket]);
  const prevBuckets = React.useMemo(() => range.prevShown.map(toBucket), [range.prevShown, toBucket]);

  if (range.options.length === 0 || !range.latest) {
    return <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Chưa có số liệu tháng nào để tổng hợp thành quý.</div>;
  }

  return (
    <PeriodReport
      kind="quarter"
      periodType="month"
      metrics={metrics}
      units={units}
      buckets={buckets}
      prevBuckets={prevBuckets}
      rangeLabel={range.rangeLabel}
      rangeHint={range.rangeHint}
      canManage={canManage}
      picker={range.picker}
      metricSet={QUARTER_METRICS}
      defaultOn={QUARTER_DEFAULT}
      persistKey="quarter:v2"
      rubric={rubric}
      title="Bảng theo dõi quý — mọi SBU"
      description="Mỗi SBU một khối, mỗi chỉ số một dòng, mỗi quý một cột. Quý đang dở (chưa đủ 3 tháng có số) được ghi rõ ở đầu cột — tổng và Δ của quý đó chưa phản ánh đủ quý."
    />
  );
}
