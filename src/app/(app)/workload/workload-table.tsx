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

export function WorkloadTable({ weeks, rows }: { weeks: WorkloadWeek[]; rows: WorkloadRow[] }) {
  return (
    <div className="overflow-auto rounded-md border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-muted/60">
          <tr>
            <th className="min-w-44 border-b px-3 py-2 text-xs font-semibold text-muted-foreground">Người phụ trách</th>
            {weeks.map((w) => (
              <th key={w.from} className="min-w-20 border-b px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                Tuần {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b">
              <td className="px-3 py-2 font-medium">{r.fullName}</td>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-2 py-2 text-center tabular-nums",
                    c.overloaded && "bg-red-100 font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300",
                  )}
                >
                  {c.value}
                  <span className="ml-0.5 text-[10px] text-muted-foreground">{c.unit === "hours" ? "h" : "tk"}</span>
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={weeks.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                Chưa có nhân sự.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
