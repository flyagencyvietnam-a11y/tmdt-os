"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { upsertDisbursementPlanAction } from "./actions";
import { ALERT_THRESHOLDS } from "./alerts";
import { fmt, fmtMoney, LINE_COLORS, monthLabel, num, spendOf, type MetricRow } from "./shared";

type DisbursementLine = "b2c_system" | "ecom" | "osir";
const DLINES: DisbursementLine[] = ["b2c_system", "ecom", "osir"];
const DLABELS: Record<DisbursementLine, string> = { b2c_system: "Mục 1 — B2C Hệ thống", ecom: "Mục 3 — Ecom", osir: "Mục 5 — OSIR" };

interface PlanRow {
  id: string;
  line: string;
  period: string;
  plannedAmount: string;
  notes: string | null;
}

function actualFor(metrics: MetricRow[], line: string, period: string): number {
  return metrics.filter((m) => m.line === line && m.periodType === "month" && m.period === period).reduce((s, m) => s + (spendOf(m) ?? 0), 0);
}

/** Trạng thái giải ngân — luôn kèm icon + chữ, không chỉ màu. */
function statusOf(planned: number, actual: number, period: string, currentMonth: string) {
  if (!planned) return null;
  const r = actual / planned;
  if (r > ALERT_THRESHOLDS.overPlan) return { label: "Vượt KH", icon: AlertOctagon, cls: "text-red-600 dark:text-red-400", bar: "bg-red-500" };
  if (period < currentMonth && r < ALERT_THRESHOLDS.underPlan) return { label: "Chậm", icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" };
  return { label: period < currentMonth ? "Đạt" : "Đang chạy", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" };
}

/**
 * Kế hoạch giải ngân vs thực tế — phạm vi Mục 1 (B2C Hệ thống) + Mục 3 (Ecom)
 * + Mục 5 (OSIR), không gồm NS Trung tâm order/B2B/VMP (đúng sheet "Giải ngân Digital").
 */
export function DisbursementPanel({ plan, metrics, canManage, currentMonth }: { plan: PlanRow[]; metrics: MetricRow[]; canManage: boolean; currentMonth: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ line: DisbursementLine; period: string; row: PlanRow | null } | null>(null);

  const metricMonths = metrics.filter((m) => m.periodType === "month" && DLINES.includes(m.line as DisbursementLine)).map((m) => m.period);
  const periods = [...new Set([...plan.map((p) => p.period), ...metricMonths, currentMonth])].sort().reverse();

  const ytd = DLINES.map((l) => {
    const planned = plan.filter((p) => p.line === l).reduce((s, p) => s + (num(p.plannedAmount) ?? 0), 0);
    const actual = [...new Set(plan.filter((p) => p.line === l).map((p) => p.period))].reduce((s, p) => s + actualFor(metrics, l, p), 0);
    return { l, planned, actual };
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {ytd.map(({ l, planned, actual }) => {
          const ratio = planned ? actual / planned : null;
          return (
            <div key={l} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LINE_COLORS[l] }} />
                {DLABELS[l]} · lũy kế các tháng có KH
              </div>
              {planned ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{Math.round((ratio ?? 0) * 100)}%</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtMoney(actual)} / {fmtMoney(planned)}
                    </span>
                  </div>
                  <Progress ratio={ratio ?? 0} className="mt-2" />
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Chưa có kế hoạch — bấm ô KH trong bảng để nhập.</p>
              )}
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Kế hoạch vs thực tế theo tháng</h3>
          <p className="text-xs text-muted-foreground">
            Chỉ gồm Mục 1, 3, 5 (không gồm NS Trung tâm order / B2B / VMP). Vượt {Math.round(ALERT_THRESHOLDS.overPlan * 100)}% = đỏ · tháng đã qua dưới {Math.round(ALERT_THRESHOLDS.underPlan * 100)}% = vàng.
            {canManage && " Bấm ô KH để sửa kế hoạch."}
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tháng</th>
                {DLINES.map((l) => (
                  <th key={l} className="min-w-56 px-3 py-2 text-left font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: LINE_COLORS[l] }} />
                      {DLABELS[l]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {periods.map((period) => (
                <tr key={period} className={cn(period === currentMonth && "bg-brand/[0.03]")}>
                  <td className="px-3 py-2.5 font-medium">
                    {monthLabel(period)}
                    {period === currentMonth && <span className="ml-1.5 rounded bg-brand/10 px-1 py-0.5 text-[10px] font-semibold text-brand">Hiện tại</span>}
                  </td>
                  {DLINES.map((l) => {
                    const row = plan.find((p) => p.line === l && p.period === period) ?? null;
                    const planned = row ? Number(row.plannedAmount) : 0;
                    const actual = actualFor(metrics, l, period);
                    const st = statusOf(planned, actual, period, currentMonth);
                    const Icon = st?.icon;
                    return (
                      <td key={l} className="px-3 py-2.5 align-top">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => setEditing({ line: l, period, row })}
                            className={cn("group inline-flex items-center gap-1 rounded px-1 -mx-1 tabular-nums", canManage && "hover:bg-muted")}
                            title={row?.notes ?? undefined}
                          >
                            <span className="text-muted-foreground">KH</span> <b>{planned ? fmtMoney(planned) : "—"}</b>
                            {canManage && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60" />}
                          </button>
                          <span className="tabular-nums">
                            <span className="text-muted-foreground">TT</span> <b>{actual ? fmtMoney(actual) : "—"}</b>
                          </span>
                        </div>
                        {st && Icon && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <Progress ratio={actual / planned} barClass={st.bar} className="flex-1" />
                            <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums", st.cls)}>
                              <Icon className="h-3 w-3" />
                              {Math.round((actual / planned) * 100)}% · {st.label}
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Kế hoạch giải ngân</DialogTitle>
              <DialogDescription>
                {DLABELS[editing.line]} · {monthLabel(editing.period)}
              </DialogDescription>
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

function Progress({ ratio, barClass, className }: { ratio: number; barClass?: string; className?: string }) {
  const over = ratio > 1;
  return (
    <div className={cn("relative h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full", barClass ?? (over ? "bg-red-500" : "bg-emerald-500"))} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
    </div>
  );
}

function PlanForm({ initial, onSave }: { initial: PlanRow | null; onSave: (plannedAmount: string, notes: string | null) => void }) {
  const [pending, start] = React.useTransition();
  const [amount, setAmount] = React.useState(initial?.plannedAmount ?? "");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Kế hoạch phân bổ (VND)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        {num(amount) != null && <p className="text-xs text-muted-foreground">= {fmt(amount)} đ</p>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Ghi chú</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button className="w-full" disabled={pending || !amount} onClick={() => start(() => onSave(amount, notes || null))}>
        Lưu
      </Button>
    </div>
  );
}
