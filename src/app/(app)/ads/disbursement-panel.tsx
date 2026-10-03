"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { upsertDisbursementPlanAction } from "./actions";

type DisbursementLine = "b2c_system" | "ecom" | "osir";
const LINES: DisbursementLine[] = ["b2c_system", "ecom", "osir"];
const LINE_LABELS: Record<DisbursementLine, string> = { b2c_system: "Mục 1 — B2C Hệ thống", ecom: "Mục 3 — Ecom", osir: "Mục 5 — OSIR" };

interface PlanRow {
  id: string;
  line: string;
  period: string;
  plannedAmount: string;
  notes: string | null;
}
interface MetricRow {
  line: string;
  periodType: string;
  period: string;
  budget: string | null;
  centerOrderBudget: string | null;
  hoTopupBudget: string | null;
}

function actualFor(metrics: MetricRow[], line: string, period: string): number {
  return metrics
    .filter((m) => m.line === line && m.periodType === "month" && m.period === period)
    .reduce((s, m) => s + (m.line === "b2c_center" ? Number(m.centerOrderBudget || 0) + Number(m.hoTopupBudget || 0) : Number(m.budget || 0)), 0);
}

export function DisbursementPanel({ plan, metrics, canManage, currentMonth }: { plan: PlanRow[]; metrics: MetricRow[]; canManage: boolean; currentMonth: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ line: DisbursementLine; period: string; row: PlanRow | null } | null>(null);

  const periods = [...new Set([...plan.map((p) => p.period), currentMonth])].sort().reverse();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        SPEC Mục 10.5 — phạm vi Mục 1 (B2C Hệ thống) + Mục 3 (Ecom) + Mục 5 (OSIR), không gồm NS Trung tâm order/B2B/VMP
        (đúng phạm vi sheet &quot;Giải ngân Digital&quot; gốc).
      </p>
      <div className="overflow-auto rounded-md border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Tháng</th>
              {LINES.map((l) => (
                <th key={l} className="px-2 py-2 text-right" colSpan={3}>
                  {LINE_LABELS[l]}
                </th>
              ))}
            </tr>
            <tr>
              <th className="px-2 py-1" />
              {LINES.map((l) => (
                <React.Fragment key={l}>
                  <th className="px-2 py-1 text-right font-normal">KH</th>
                  <th className="px-2 py-1 text-right font-normal">TT</th>
                  <th className="px-2 py-1 text-right font-normal">%</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period} className="border-b">
                <td className="px-2 py-1.5 font-medium">{period}</td>
                {LINES.map((l) => {
                  const row = plan.find((p) => p.line === l && p.period === period) ?? null;
                  const planned = row ? Number(row.plannedAmount) : 0;
                  const actual = actualFor(metrics, l, period);
                  const pct = planned ? Math.round((actual / planned) * 100) : null;
                  return (
                    <React.Fragment key={l}>
                      <td className="cursor-pointer px-2 py-1.5 text-right tabular-nums hover:bg-muted/40" onClick={() => canManage && setEditing({ line: l, period, row })}>
                        {planned ? planned.toLocaleString("vi-VN") : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{actual ? actual.toLocaleString("vi-VN") : "—"}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums", pct != null && pct > 110 && "text-crit")}>{pct != null ? `${pct}%` : "—"}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Kế hoạch giải ngân — {LINE_LABELS[editing.line]} · {editing.period}
              </DialogTitle>
            </DialogHeader>
            <PlanForm
              initial={editing.row}
              onSave={async (plannedAmount, notes) => {
                const res = await upsertDisbursementPlanAction({ id: editing.row?.id, line: editing.line, period: editing.period, plannedAmount, notes });
                if (res.ok) {
                  toast.success("Đã lưu.");
                  setEditing(null);
                  router.refresh();
                } else toast.error(res.error);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PlanForm({ initial, onSave }: { initial: PlanRow | null; onSave: (plannedAmount: string, notes: string | null) => void }) {
  const [pending, start] = React.useTransition();
  const [amount, setAmount] = React.useState(initial?.plannedAmount ?? "");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Kế hoạch phân bổ (VND)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Ghi chú</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button className="w-full" disabled={pending || !amount} onClick={() => start(() => onSave(amount, notes || null))}>
        Lưu
      </Button>
    </div>
  );
}
