"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { B2cSplit } from "./b2c-split";
import { CenterTrendTable } from "./center-trend";
import { EcomProducts } from "./ecom-products";
import { MetricEditDialog } from "./metric-edit-dialog";
import { usePeriodRange } from "./period-range";
import { officialOf } from "./month-derive";
import { PeriodReport, type Bucket, type MetricKey } from "./period-report";
import type { EcomProductRow } from "./rollups";
import { aggregate, derive, monthLabel, nextMonth, type MetricRow, type SbuLite } from "./shared";
import { rowsOfUnit, type AdsUnit } from "./units";

const MONTH_METRICS: MetricKey[] = ["spend", "leads", "hvm", "cpl", "cac", "cvr", "messages", "costPerMess", "revenue", "roas"];
const MONTH_DEFAULT: MetricKey[] = ["spend", "leads", "hvm", "cpl", "cac", "cvr", "revenue", "roas"];

const monthRangeText = (from: string, to: string, n: number) => (n <= 1 ? monthLabel(to) : `${monthLabel(from)} – ${monthLabel(to)} (${n} tháng)`);

/**
 * Báo cáo THÁNG của MỌI SBU (SPEC Phụ lục D mục 26) — cùng format với báo cáo tuần, chọn KHOẢNG tháng (Từ – Đến) thay cho so sánh
 * mặc định các tháng cũ. Số tháng = số nhập chính thức; ô còn trống tự cộng từ các tuần (mục 28). Kèm 3 khối chuyên sâu: ads riêng TT so với tổng B2C, hiệu quả theo
 * trung tâm × tháng (thang điểm CPL/CAC), Ecom theo sản phẩm.
 */
export function MonthlyView({
  metrics,
  units,
  centers,
  ecomProducts,
  canManage,
  currentMonth,
  months,
  rubric,
}: {
  metrics: MetricRow[];
  units: AdsUnit[];
  centers: SbuLite[];
  ecomProducts: EcomProductRow[];
  canManage: boolean;
  currentMonth: string;
  /** Mọi tháng đã có số liệu tháng. */
  months: string[];
  rubric: EffectivenessRubric;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ unit: AdsUnit; month: string } | null>(null);

  const range = usePeriodRange({
    storageKey: "month",
    dataKeys: months,
    current: currentMonth,
    next: nextMonth,
    label: monthLabel,
    rangeText: monthRangeText,
    unit: "tháng",
    presets: [3, 6, 12, 0],
    defaultCount: 6,
    footer: "ô chưa nhập tự cộng từ các tuần",
  });
  const toBucket = React.useCallback((m: string): Bucket => ({ key: m, label: monthLabel(m), short: monthLabel(m, true), periods: [m], editPeriod: m }), []);
  const buckets = React.useMemo(() => range.shown.map(toBucket), [range.shown, toBucket]);
  const prevBuckets = React.useMemo(() => range.prevShown.map(toBucket), [range.prevShown, toBucket]);

  const monthly = React.useMemo(() => metrics.filter((m) => m.periodType === "month"), [metrics]);
  const centerRows = React.useCallback((p: string, sbuId: string) => monthly.filter((m) => m.line === "b2c_center" && m.period === p && m.sbuId === sbuId), [monthly]);
  const der = React.useCallback((r: MetricRow[]) => derive(aggregate(r), "b2c_center", rubric), [rubric]);

  if (range.options.length === 0 || !range.latest) {
    return <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Chưa có số liệu tháng nào. Nhập qua “Nhập Excel” hoặc bấm vào ô trong bảng khi đã có dữ liệu.</div>;
  }

  return (
    <>
      <PeriodReport
        kind="month"
        periodType="month"
        metrics={metrics}
        units={units}
        buckets={buckets}
        prevBuckets={prevBuckets}
        rangeLabel={range.rangeLabel}
        rangeHint={range.rangeHint}
        canManage={canManage}
        picker={range.picker}
        metricSet={MONTH_METRICS}
        defaultOn={MONTH_DEFAULT}
        persistKey="month"
        title="Bảng theo dõi tháng — mọi SBU"
        description={`Mỗi SBU một khối, mỗi chỉ số một dòng, mỗi tháng một cột. ${canManage ? "Bấm ô để sửa ngay trên bảng; bấm ô CPL/CAC để mở form đầy đủ (NS P.MKT chạy thêm, feedback trung tâm…). Trung tâm: ô Ngân sách sửa phần NS Trung tâm order." : ""}`}
        detailMetrics={["cpl", "cac"]}
        onOpenDetail={(unit, b) => setEditing({ unit, month: b.editPeriod! })}
        below={
          <div className="space-y-4">
            <B2cSplit metrics={metrics} months={range.shown} />
            <CenterTrendTable sbus={centers} months={range.shown} rows={centerRows} der={der} rubric={rubric} activeMonth={range.to} onPickMonth={(m) => range.setRange(m, m)} />
            <EcomProducts metrics={metrics} products={ecomProducts} canManage={canManage} month={range.to} />
          </div>
        }
      />
      {editing && (
        <MetricEditDialog
          key={`${editing.unit.key}-${editing.month}`}
          target={{ row: officialOf(rowsOfUnit(monthly.filter((m) => m.period === editing.month), editing.unit)[0]), sbuId: editing.unit.sbuId, label: editing.unit.label }}
          line={editing.unit.line}
          period={editing.month}
          rubric={rubric}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
