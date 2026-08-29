"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtInt, fmtVnd } from "@/lib/format";
import { copyYesterdayAction, upsertDailyMetricAction } from "./actions";

interface Row {
  id: string;
  internalCode: string;
  displayName: string;
  productCode: string | null;
  dailyBudget: number | null;
  spend: number | null;
  messages: number | null;
  cpmql14: number | null;
  mql14: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function AdsEntryGrid({ date, rows }: { date: string; rows: Row[] }) {
  const router = useRouter();
  const [local, setLocal] = React.useState(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        { spend: r.spend?.toString() ?? "", messages: r.messages?.toString() ?? "" },
      ]),
    ),
  );
  const [state, setState] = React.useState<Record<string, SaveState>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function queueSave(id: string) {
    clearTimeout(timers.current[id]);
    setState((s) => ({ ...s, [id]: "saving" }));
    timers.current[id] = setTimeout(async () => {
      const v = local[id];
      const spend = Number(v.spend || 0);
      const messages = Number(v.messages || 0);
      if (v.spend === "" && v.messages === "") {
        setState((s) => ({ ...s, [id]: "idle" }));
        return;
      }
      const res = await upsertDailyMetricAction({
        campaignId: id,
        metricDate: date,
        spend,
        messages,
      });
      setState((s) => ({ ...s, [id]: res.ok ? "saved" : "error" }));
      if (!res.ok) toast.error(res.error);
    }, 800);
  }

  function edit(id: string, field: "spend" | "messages", value: string) {
    setLocal((l) => ({ ...l, [id]: { ...l[id], [field]: value } }));
    queueSave(id);
  }

  const [copying, startCopy] = React.useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Ngày:{" "}
          <Input
            type="date"
            className="inline-block h-8 w-40"
            value={date}
            onChange={(e) => router.push(`/ads?date=${e.target.value}`)}
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={copying}
          onClick={() =>
            startCopy(async () => {
              const empty = rows
                .filter((r) => !local[r.id]?.spend && !local[r.id]?.messages)
                .map((r) => r.id);
              if (empty.length === 0) {
                toast.info("Không có dòng trống để sao chép.");
                return;
              }
              const res = await copyYesterdayAction(empty, date);
              if (res.ok) {
                toast.success(
                  `Đã sao chép ${(res.data as { copied: number }).copied} campaign từ hôm qua.`,
                );
                router.refresh();
              } else toast.error(res.error);
            })
          }
        >
          Sao chép từ hôm qua
        </Button>
        <span className="text-xs text-muted-foreground">
          {rows.length} campaign đang ON
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Campaign</th>
              <th className="px-3 py-2">SP</th>
              <th className="px-3 py-2 text-right">NS/ngày</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Messages</th>
              <th className="px-3 py-2 text-right">CPL hôm nay</th>
              <th className="px-3 py-2 text-right">CPMQL 14 ngày</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = local[r.id];
              const spendN = Number(v.spend || 0);
              const msgN = Number(v.messages || 0);
              const cplToday = msgN > 0 ? spendN / msgN : null;
              const st = state[r.id] ?? "idle";
              return (
                <tr key={r.id} className="border-b">
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{r.displayName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {r.internalCode}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">{r.productCode}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.dailyBudget ? fmtVnd(r.dailyBudget) : "–"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-8 w-28 text-right tabular-nums"
                      value={v.spend}
                      onChange={(e) => edit(r.id, "spend", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-8 w-20 text-right tabular-nums"
                      value={v.messages}
                      onChange={(e) => edit(r.id, "messages", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {cplToday == null ? "–" : fmtVnd(cplToday)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtVnd(r.cpmql14)}
                    {r.mql14 === 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        (0 MQL)
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {st === "saving" && (
                      <span className="text-muted-foreground">đang lưu…</span>
                    )}
                    {st === "saved" && <span className="text-ok">✓ đã lưu</span>}
                    {st === "error" && <span className="text-crit">lỗi</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Không có campaign nào đang ON.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {fmtInt(rows.length)} dòng · số nhập tay là con số Lead chính thức để báo cáo
        (SPEC Mục 4.2).
      </p>
    </div>
  );
}
