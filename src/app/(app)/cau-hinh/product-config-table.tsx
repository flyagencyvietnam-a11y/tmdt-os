"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtPct, fmtVnd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateProductConfigAction } from "./actions";

interface Row {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  listPrice: number | null;
  cacRoomPct: number;
  targetCpmql: number;
  killThresholdNoMql: number;
  budgetSharePct: number | null;
  crMqlWon90d: number | null;
  suggestedCpmql: number | null;
  mql90d: number;
  won90d: number;
}

export function ProductConfigTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [draft, setDraft] = React.useState<Record<string, Partial<Record<string, string>>>>(
    {},
  );

  function field(id: string, key: string, fallback: number | null): string {
    return draft[id]?.[key] ?? (fallback == null ? "" : String(fallback));
  }
  function edit(id: string, key: string, v: string) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: v } }));
  }
  const dirty = (id: string) => !!draft[id] && Object.keys(draft[id]!).length > 0;

  function save(r: Row) {
    const d = draft[r.id] ?? {};
    const num = (k: string): number | undefined =>
      d[k] === undefined || d[k] === "" ? undefined : Number(d[k]);
    start(async () => {
      const res = await updateProductConfigAction(r.id, {
        targetCpmql: num("targetCpmql"),
        killThresholdNoMql: num("killThresholdNoMql"),
        cacRoomPct: num("cacRoomPct"),
        budgetSharePct:
          d.budgetSharePct === undefined
            ? undefined
            : d.budgetSharePct === ""
              ? null
              : Number(d.budgetSharePct),
        listPrice:
          d.listPrice === undefined
            ? undefined
            : d.listPrice === ""
              ? null
              : Number(d.listPrice),
      });
      if (res.ok) {
        toast.success(`Đã lưu cấu hình ${r.code}.`);
        setDraft((x) => {
          const n = { ...x };
          delete n[r.id];
          return n;
        });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function applySuggested(r: Row) {
    if (r.suggestedCpmql == null) return;
    edit(r.id, "targetCpmql", String(r.suggestedCpmql));
    edit(r.id, "killThresholdNoMql", String(Math.round(r.suggestedCpmql * 1.5)));
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Sản phẩm</th>
            <th className="px-3 py-2 text-right">Giá niêm yết (đ)</th>
            <th className="px-3 py-2 text-right">Room CAC (%)</th>
            <th className="px-3 py-2 text-right">CR MQL→Chốt 90n</th>
            <th className="px-3 py-2 text-right">Ngưỡng gợi ý</th>
            <th className="px-3 py-2 text-right">Ngưỡng CPMQL (đ)</th>
            <th className="px-3 py-2 text-right">Ngưỡng KILL (đ)</th>
            <th className="px-3 py-2 text-right">% ngân sách</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff =
              r.suggestedCpmql != null
                ? Math.round(((r.targetCpmql - r.suggestedCpmql) / r.suggestedCpmql) * 100)
                : null;
            return (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-1.5">
                  <div className="font-medium">
                    {r.code}
                    {!r.isActive && (
                      <Badge variant="outline" className="ml-1">
                        ngừng
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{r.name}</div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    className="h-7 w-32 text-right tabular-nums"
                    type="number"
                    value={field(r.id, "listPrice", r.listPrice)}
                    onChange={(e) => edit(r.id, "listPrice", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    className="h-7 w-16 text-right tabular-nums"
                    type="number"
                    value={field(r.id, "cacRoomPct", r.cacRoomPct)}
                    onChange={(e) => edit(r.id, "cacRoomPct", e.target.value)}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.crMqlWon90d == null ? (
                    <span className="text-muted-foreground">– (0 MQL)</span>
                  ) : (
                    <>
                      {fmtPct(r.crMqlWon90d)}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {r.won90d}/{r.mql90d}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.suggestedCpmql == null ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    <button
                      className="text-brand hover:underline"
                      onClick={() => applySuggested(r)}
                      title="Áp dụng ngưỡng gợi ý + KILL 1,5×"
                    >
                      {fmtVnd(r.suggestedCpmql)}
                    </button>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <div className="flex flex-col items-end">
                    <Input
                      className="h-7 w-28 text-right tabular-nums"
                      type="number"
                      value={field(r.id, "targetCpmql", r.targetCpmql)}
                      onChange={(e) => edit(r.id, "targetCpmql", e.target.value)}
                    />
                    {diff != null && Math.abs(diff) > 20 && (
                      <span
                        className={cn(
                          "text-[10px]",
                          diff > 0 ? "text-warn" : "text-ok",
                        )}
                      >
                        {diff > 0 ? "+" : ""}
                        {diff}% vs gợi ý
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    className="h-7 w-28 text-right tabular-nums"
                    type="number"
                    value={field(r.id, "killThresholdNoMql", r.killThresholdNoMql)}
                    onChange={(e) => edit(r.id, "killThresholdNoMql", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    className="h-7 w-16 text-right tabular-nums"
                    type="number"
                    value={field(r.id, "budgetSharePct", r.budgetSharePct)}
                    onChange={(e) => edit(r.id, "budgetSharePct", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Button
                    size="sm"
                    className="h-7"
                    disabled={!dirty(r.id) || pending}
                    onClick={() => save(r)}
                  >
                    Lưu
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
