"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang làm",
  done: "Xong",
  blocked: "Vướng",
  not_applicable: "N/A",
};
const STATUS_CLASS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  blocked: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  not_applicable: "bg-transparent text-muted-foreground",
};

export function MatrixGrid({
  period,
  catalogItems,
  sbus,
  cells,
}: {
  period: string;
  catalogItems: { id: string; code: string; title: string }[];
  sbus: { id: string; code: string; name: string }[];
  cells: Record<string, { status: string; taskId: string | null }>;
}) {
  const router = useRouter();
  const [month, setMonth] = React.useState(period);

  function changeMonth(next: string) {
    setMonth(next);
    router.push(`/sbu/matrix?period=${next}`);
  }

  const doneCountBySbu = (sbuId: string) =>
    catalogItems.filter((c) => cells[`${c.id}::${sbuId}`]?.status === "done").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Kỳ:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => changeMonth(e.target.value)}
          className="rounded-md border px-2 py-1 text-sm"
        />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2">Hạng mục</th>
              {sbus.map((s) => (
                <th key={s.id} className="px-2 py-2 text-center" title={s.name}>
                  {s.code}
                </th>
              ))}
            </tr>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-1 text-right font-normal">% xong</th>
              {sbus.map((s) => {
                const pct = catalogItems.length ? Math.round((doneCountBySbu(s.id) / catalogItems.length) * 100) : 0;
                return (
                  <th key={s.id} className="px-2 py-1 text-center font-normal text-muted-foreground">
                    {pct}%
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {catalogItems.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/10">
                <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                  <div>{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.code}</div>
                </td>
                {sbus.map((s) => {
                  const cell = cells[`${c.id}::${s.id}`];
                  const content = (
                    <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px]", STATUS_CLASS[cell?.status ?? "not_started"])}>
                      {STATUS_LABEL[cell?.status ?? "not_started"]}
                    </span>
                  );
                  return (
                    <td key={s.id} className="px-2 py-2 text-center">
                      {cell?.taskId ? (
                        <a href={`/task/${cell.taskId}`} className="hover:opacity-80">
                          {content}
                        </a>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {catalogItems.length === 0 && (
              <tr>
                <td colSpan={sbus.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có hạng mục SBU catalog.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
