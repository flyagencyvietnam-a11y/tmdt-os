"use client";

import { cn } from "@/lib/utils";

interface WorkloadCell {
  value: number;
  unit: "hours" | "tasks";
  overloaded: boolean;
}
interface WorkloadWeek {
  from: string;
  to: string;
  label: string;
}
interface WorkloadRow {
  userId: string;
  fullName: string;
  cells: WorkloadCell[];
}

/** Mức tải so với ngưỡng (Cài đặt) → màu. Luôn kèm số, không chỉ màu. */
function level(c: WorkloadCell, t: { hours: number; tasks: number }) {
  const limit = c.unit === "hours" ? t.hours : t.tasks;
  const ratio = limit ? c.value / limit : 0;
  if (c.overloaded || ratio > 1) return { ratio, bar: "bg-red-500", cell: "bg-red-500/10 text-red-700 dark:text-red-300 font-semibold" };
  if (ratio >= 0.7) return { ratio, bar: "bg-amber-500", cell: "bg-amber-500/10" };
  if (c.value > 0) return { ratio, bar: "bg-sky-500", cell: "" };
  return { ratio, bar: "bg-transparent", cell: "text-muted-foreground/50" };
}

export function WorkloadTable({
  weeks,
  rows,
  thresholds,
  today,
}: {
  weeks: WorkloadWeek[];
  rows: WorkloadRow[];
  thresholds: { hours: number; tasks: number };
  today: string;
}) {
  const currentIdx = weeks.findIndex((w) => w.from <= today && today <= w.to);
  const overloadedCount = rows.reduce((s, r) => s + r.cells.filter((c) => c.overloaded).length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2.5 text-xs text-muted-foreground shadow-xs">
        <span>
          Ngưỡng quá tải: <b className="text-foreground">{thresholds.hours} giờ</b> hoặc <b className="text-foreground">{thresholds.tasks} task</b> / tuần (sửa ở Cài đặt)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-sky-500" /> Bình thường
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-amber-500" /> Gần ngưỡng (≥70%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-red-500" /> Quá tải
        </span>
        {overloadedCount > 0 && <span className="ml-auto font-semibold text-red-600 dark:text-red-400">{overloadedCount} ô quá tải</span>}
      </div>

      <div className="overflow-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="min-w-48 border-b px-4 py-2.5 text-xs font-semibold text-muted-foreground">Người phụ trách</th>
              {weeks.map((w, i) => (
                <th key={w.from} className={cn("min-w-24 border-b px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground", i === currentIdx && "bg-brand/10 text-brand")}>
                  {i === currentIdx ? "Tuần này" : `Tuần ${w.label}`}
                </th>
              ))}
              <th className="min-w-20 border-b px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Tổng</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const total = r.cells.reduce((s, c) => s + c.value, 0);
              const unit = r.cells[0]?.unit === "hours" ? "giờ" : "task";
              return (
                <tr key={r.userId} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{r.fullName}</td>
                  {r.cells.map((c, i) => {
                    const lv = level(c, thresholds);
                    return (
                      <td key={i} className={cn("px-2 py-2 text-center", lv.cell, i === currentIdx && "outline outline-1 -outline-offset-1 outline-brand/20")} title={c.overloaded ? "Vượt ngưỡng quá tải" : undefined}>
                        <div className="tabular-nums">
                          {c.value}
                          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{c.unit === "hours" ? "h" : " task"}</span>
                        </div>
                        <div className="mx-auto mt-1 h-1 w-12 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", lv.bar)} style={{ width: `${Math.min(lv.ratio, 1) * 100}%` }} />
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {total}
                    <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unit}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={weeks.length + 2} className="px-3 py-8 text-center text-muted-foreground">
                  Chưa có nhân sự.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
