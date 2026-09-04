"use client";

import * as React from "react";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  monthsOfYear,
  parsePeriodParts,
  recentYears,
  weeksOfMonth,
} from "@/lib/time";

const QUICK = [
  { v: "", l: "Nhanh…" },
  { v: "today", l: "Hôm nay" },
  { v: "7d", l: "7 ngày" },
  { v: "14d", l: "14 ngày" },
];
export const QUICK_VALUES = ["today", "7d", "14d"];
export const DEFAULT_RANGE = "this_month";

const mm = (m: number) => String(m).padStart(2, "0");

/**
 * Bộ 5 ô chọn thời gian phân cấp: Nhanh · Năm · Quý · Tháng · Tuần (SPEC 12.2).
 * Không tự điều hướng — cha truyền `range` hiện tại và nhận `onRange(next)`.
 */
export function PeriodSelects({
  range,
  onRange,
}: {
  range: string;
  onRange: (next: string) => void;
}) {
  const parts = React.useMemo(() => parsePeriodParts(range), [range]);
  const years = React.useMemo(() => recentYears(4), []);
  const quickValue = QUICK_VALUES.includes(range) ? range : "";

  const monthOpts = React.useMemo(() => {
    const all = monthsOfYear(parts.year);
    const inQuarter = parts.quarter
      ? all.filter(
          (m) =>
            Math.floor((Number(m.value.slice(5)) - 1) / 3) + 1 === parts.quarter,
        )
      : all;
    return [{ value: "", label: "Cả kỳ" }, ...inQuarter];
  }, [parts.year, parts.quarter]);

  const weekOpts = React.useMemo(() => {
    if (!parts.month) return [{ value: "", label: "— chọn tháng —" }];
    return [
      { value: "", label: "Cả tháng" },
      ...weeksOfMonth(parts.year, parts.month).map((w) => ({
        value: w.value,
        label: w.label,
      })),
    ];
  }, [parts.year, parts.month]);

  return (
    <>
      <SimpleSelect
        triggerClassName="h-8 w-24"
        value={quickValue}
        onValueChange={(v) => onRange(v || `year:${years[0]}`)}
        options={QUICK.map((q) => ({ value: q.v, label: q.l }))}
      />
      <SimpleSelect
        triggerClassName="h-8 w-[4.5rem]"
        value={String(parts.year)}
        onValueChange={(y) => onRange(`year:${y}`)}
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
      />
      <SimpleSelect
        triggerClassName="h-8 w-24"
        value={parts.quarter ? `Q${parts.quarter}` : ""}
        onValueChange={(q) =>
          onRange(q ? `quarter:${parts.year}-${q}` : `year:${parts.year}`)
        }
        options={[
          { value: "", label: "Cả năm" },
          ...[1, 2, 3, 4].map((q) => ({ value: `Q${q}`, label: `Quý ${q}` })),
        ]}
      />
      <SimpleSelect
        triggerClassName="h-8 w-28"
        value={parts.month ? `${parts.year}-${mm(parts.month)}` : ""}
        onValueChange={(v) =>
          onRange(
            v
              ? `month:${v}`
              : parts.quarter
                ? `quarter:${parts.year}-Q${parts.quarter}`
                : `year:${parts.year}`,
          )
        }
        options={monthOpts}
      />
      <SimpleSelect
        triggerClassName="h-8 w-40"
        disabled={!parts.month}
        value={parts.weekFrom ? `week:${parts.weekFrom}` : ""}
        onValueChange={(v) =>
          onRange(v || `month:${parts.year}-${mm(parts.month ?? 1)}`)
        }
        options={weekOpts}
      />
    </>
  );
}
