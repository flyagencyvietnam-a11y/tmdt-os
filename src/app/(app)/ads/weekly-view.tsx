"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { upsertAdsMetricAction } from "./actions";
import type { MetricRow, SbuLite } from "./shared";

function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("vi-VN");
}

/**
 * SPEC Mục 8.3/9.4 (thực tế: sheet "Tracking Tuần") — chu kỳ Thứ 7 tuần trước
 * → hết Thứ 6 tuần này. Trung tâm CHỈ theo dõi Ngân sách + Mess (không tách
 * Lead/HVM/Impression theo tuần — đúng phạm vi dữ liệu thật, không suy ra).
 */
export function WeeklyView({ metrics, sbus, canManage, weeks }: { metrics: MetricRow[]; sbus: SbuLite[]; canManage: boolean; weeks: string[] }) {
  const router = useRouter();
  const [week, setWeek] = React.useState(weeks[0] ?? "");
  const [editing, setEditing] = React.useState<{ row: MetricRow | null; sbuId: string | null; label: string } | null>(null);

  const rowsForWeek = metrics.filter((m) => m.periodType === "week" && m.period === week);
  const systemRow = rowsForWeek.find((m) => m.line === "b2c_system" && !m.sbuId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">Chu kỳ: Thứ 7 tuần trước → hết Thứ 6 tuần này.</p>
        <Input className="h-8 w-40" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="2026-10-03 (ngày T7)" />
        {weeks.length > 0 && <SimpleSelect triggerClassName="h-8 w-44" value="" onValueChange={(v) => v && setWeek(v)} placeholder="Tuần có dữ liệu…" options={weeks.map((w) => ({ value: w, label: w }))} />}
      </div>

      <div className="overflow-auto rounded-md border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Mảng</th>
              <th className="px-2 py-2 text-right">Ngân sách</th>
              <th className="px-2 py-2 text-right">Mess</th>
              <th className="px-2 py-2 text-right">Impression</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-muted/20">
              <td className="px-2 py-1.5 font-medium">Mục 1 — B2C Hệ thống</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(systemRow?.budget)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(systemRow?.messages)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmt(systemRow?.impressions)}</td>
              <td className="px-2 py-1.5">
                {canManage && (
                  <button className="text-xs hover:underline" onClick={() => setEditing({ row: systemRow, sbuId: null, label: "Mục 1 — B2C Hệ thống" })}>
                    Sửa
                  </button>
                )}
              </td>
            </tr>
            {sbus.map((s) => {
              const row = rowsForWeek.find((m) => m.line === "b2c_center" && m.sbuId === s.id) ?? null;
              return (
                <tr key={s.id} className="border-b hover:bg-muted/30">
                  <td className="px-2 py-1.5 pl-5">{s.code}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.centerOrderBudget)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.messages)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.impressions)}</td>
                  <td className="px-2 py-1.5">
                    {canManage && (
                      <button className="text-xs hover:underline" onClick={() => setEditing({ row, sbuId: s.id, label: s.code })}>
                        Sửa
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <WeeklyEditDialog
          target={editing}
          week={week}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function WeeklyEditDialog({
  target,
  week,
  onOpenChange,
  onDone,
}: {
  target: { row: MetricRow | null; sbuId: string | null; label: string };
  week: string;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const isSystem = !target.sbuId;
  const [budget, setBudget] = React.useState(isSystem ? (target.row?.budget ?? "") : (target.row?.centerOrderBudget ?? ""));
  const [messages, setMessages] = React.useState(target.row?.messages ?? "");
  const [impressions, setImpressions] = React.useState(target.row?.impressions ?? "");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target.label} — tuần {week}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Ngân sách</Label>
            <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mess</Label>
            <Input type="number" value={messages} onChange={(e) => setMessages(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Impression</Label>
            <Input type="number" value={impressions} onChange={(e) => setImpressions(e.target.value)} />
          </div>
          <Button
            className="w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await upsertAdsMetricAction({
                  id: target.row?.id,
                  line: isSystem ? "b2c_system" : "b2c_center",
                  periodType: "week",
                  period: week,
                  sbuId: target.sbuId,
                  budget: isSystem ? budget || null : null,
                  centerOrderBudget: isSystem ? null : budget || null,
                  messages: messages || null,
                  impressions: impressions || null,
                });
                if (res.ok) {
                  toast.success("Đã lưu.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
