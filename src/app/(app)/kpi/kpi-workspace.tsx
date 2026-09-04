"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import type { KpiProgress } from "@/lib/services/kpi";
import { fmtInt, fmtPct, fmtVnd } from "@/lib/format";
import { monthBounds, todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  addOtherCostAction,
  createKpiAssignmentAction,
  deleteKpiAssignmentAction,
  deleteOtherCostAction,
} from "./actions";

/** Điểm KPI tổng — SPEC 14.4 (bản client, cùng công thức với kpi.ts). */
function totalKpiScore(items: KpiProgress[]): number | null {
  const sw = items.reduce((s, i) => s + i.weightPct, 0);
  if (sw === 0) return null;
  const ss = items.reduce((s, i) => s + (i.scoreContribution ?? 0), 0);
  return ss / sw;
}

interface Def {
  id: string;
  code: string;
  name: string;
  unit: string;
  source: string;
  direction: string;
}

export function KpiWorkspace({
  role,
  currentUserId,
  periodStart,
  periodEnd,
  quarterKey,
  definitions,
  progress,
  users,
  products,
  otherCosts,
}: {
  role: string;
  currentUserId: string;
  periodStart: string;
  periodEnd: string;
  quarterKey: string;
  definitions: Def[];
  progress: KpiProgress[];
  users: { id: string; fullName: string; role: string }[];
  products: { id: string; code: string }[];
  otherCosts: { id: string; costType: string; incurredOn: string; amount: number; note: string | null }[];
}) {
  const canManage = role === "ADMIN" || role === "MANAGER";
  const isViewer = role === "VIEWER";

  // gom theo user cho scorecard / ma trận
  const byUser = new Map<string | null, KpiProgress[]>();
  for (const p of progress) {
    const k = p.userId;
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k)!.push(p);
  }

  return (
    <div className="space-y-6">
      {!canManage && !isViewer && (
        <Scorecard items={byUser.get(currentUserId) ?? []} />
      )}

      {isViewer && <ViewerSummary progress={progress} />}

      {canManage && (
        <>
          <TeamMatrix byUser={byUser} users={users} progress={progress} />
          <AssignForm
            definitions={definitions}
            users={users}
            products={products}
            periodStart={periodStart}
            periodEnd={periodEnd}
            quarterKey={quarterKey}
            progress={progress}
          />
          <OtherCostsPanel
            costs={otherCosts}
            products={products}
            periodStart={periodStart}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Scorecard

function Scorecard({ items }: { items: KpiProgress[] }) {
  if (items.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Bạn chưa được giao chỉ tiêu nào trong kỳ này.
      </p>
    );
  const score = totalKpiScore(items);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <KpiCard key={it.id} it={it} />
        ))}
      </div>
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Điểm KPI tổng</span>
          <span className="text-lg font-bold tabular-nums">{fmtPct(score)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Σ(min(% hoàn thành, 100%) × trọng số) / Σ trọng số — SPEC Mục 14.4.
        </p>
      </div>
    </div>
  );
}

function KpiCard({ it }: { it: KpiProgress }) {
  const comp = it.completionPct ?? 0;
  const pct = Math.min(comp, 1.2);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium">{it.name}</div>
          <div className="text-xs text-muted-foreground">
            Trọng số {it.weightPct}% · {it.source === "MANUAL" ? "nhập tay" : "tự động"}
          </div>
        </div>
        {it.atRisk && (
          <Badge variant="outline" className="text-crit">
            Nguy cơ trượt
          </Badge>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <Stat label="Chỉ tiêu" v={fmtNumUnit(it.target, it.unit)} />
        <Stat label="Thực tế" v={it.actual == null ? "–" : fmtNumUnit(it.actual, it.unit)} />
        <Stat label="% hoàn thành" v={fmtPct(it.completionPct)} />
      </div>

      <div className="relative mt-3 h-3 rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            comp >= 1 ? "bg-ok" : it.atRisk ? "bg-crit" : "bg-brand",
          )}
          style={{ width: `${Math.min(100, (pct / 1.2) * 100)}%` }}
        />
        {/* mốc 85 / 90 / 100 */}
        {it.thresholdTiers.map((t) => (
          <span
            key={t.pct}
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${(t.pct / 120) * 100}%` }}
            title={`Mốc ${t.pct}%`}
          />
        ))}
        {/* vạch tiến độ thời gian */}
        <span
          className="absolute -top-1 h-5 w-0.5 bg-foreground"
          style={{ left: `${Math.min(100, (it.timeProgressPct / 1.2) * 100)}%` }}
          title={`Tiến độ thời gian ${(it.timeProgressPct * 100).toFixed(0)}%`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>85</span>
        <span>90</span>
        <span>100</span>
        <span>120%</span>
      </div>
      <div className="mt-1 text-xs">
        Điểm quy đổi: <b>{(it.scoreContribution ?? 0).toFixed(1)}</b> / {it.weightPct}
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="tabular-nums">{v}</div>
    </div>
  );
}

function fmtNumUnit(v: number, unit: string): string {
  if (unit === "VND") return fmtVnd(v);
  if (unit === "PERCENT") return fmtPct(v > 1 ? v / 100 : v);
  if (unit === "RATIO") return v.toFixed(2);
  return fmtInt(v);
}

// ---------------------------------------------------------------- Team matrix

function TeamMatrix({
  byUser,
  users,
  progress,
}: {
  byUser: Map<string | null, KpiProgress[]>;
  users: { id: string; fullName: string }[];
  progress: KpiProgress[];
}) {
  const codes = [...new Set(progress.map((p) => p.code))];
  const rows = users
    .map((u) => ({ u, items: byUser.get(u.id) ?? [] }))
    .filter((r) => r.items.length > 0);

  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Chưa giao chỉ tiêu cá nhân nào cho kỳ này.
      </p>
    );

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Theo dõi toàn đội</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nhân sự</th>
              {codes.map((c) => (
                <th key={c} className="px-3 py-2 text-right">
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Điểm tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, items }) => (
              <tr key={u.id} className="border-b">
                <td className="px-3 py-1.5 font-medium">{u.fullName}</td>
                {codes.map((c) => {
                  const it = items.find((x) => x.code === c);
                  const p = it?.completionPct ?? null;
                  return (
                    <td
                      key={c}
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        p == null
                          ? "text-muted-foreground"
                          : p >= 1
                            ? "text-ok"
                            : it?.atRisk
                              ? "text-crit"
                              : "",
                      )}
                    >
                      {p == null ? "–" : fmtPct(p)}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                  {fmtPct(totalKpiScore(items))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Assign form

function AssignForm({
  definitions,
  users,
  products,
  periodStart,
  periodEnd,
  quarterKey,
  progress,
}: {
  definitions: Def[];
  users: { id: string; fullName: string; role: string }[];
  products: { id: string; code: string }[];
  periodStart: string;
  periodEnd: string;
  quarterKey: string;
  progress: KpiProgress[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    kpiDefinitionId: definitions[0]?.id ?? "",
    periodType: "QUARTER",
    scopeType: "USER",
    userId: users.find((u) => u.role === "EC")?.id ?? users[0]?.id ?? "",
    productId: products[0]?.id ?? "",
    targetValue: "",
    allocatedBudget: "",
    weightPct: "30",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // tổng trọng số theo user (cảnh báo khi != 100 — SPEC 14.3)
  const weightByUser = new Map<string, number>();
  for (const p of progress)
    if (p.userId)
      weightByUser.set(p.userId, (weightByUser.get(p.userId) ?? 0) + p.weightPct);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-semibold">
        Giao chỉ tiêu — kỳ {quarterKey}
      </h2>
      <div className="grid gap-2 md:grid-cols-3">
        <Field label="Loại KPI">
          <SimpleSelect
            value={f.kpiDefinitionId}
            onValueChange={(v) => set("kpiDefinitionId", v)}
            options={definitions.map((d) => ({
              value: d.id,
              label: `${d.code} — ${d.name}`,
            }))}
          />
        </Field>
        <Field label="Kỳ">
          <SimpleSelect
            value={f.periodType}
            onValueChange={(v) => set("periodType", v)}
            options={[
              { value: "QUARTER", label: `Quý (${quarterKey})` },
              { value: "MONTH", label: "Tháng này" },
            ]}
          />
        </Field>
        <Field label="Phạm vi">
          <SimpleSelect
            value={f.scopeType}
            onValueChange={(v) => set("scopeType", v)}
            options={[
              { value: "USER", label: "Cá nhân" },
              { value: "TEAM", label: "Đội" },
              { value: "PRODUCT", label: "Sản phẩm" },
            ]}
          />
        </Field>
        {f.scopeType === "USER" && (
          <Field label="Người">
            <SimpleSelect
              value={f.userId}
              onValueChange={(v) => set("userId", v)}
              options={users.map((u) => ({
                value: u.id,
                label: `${u.fullName}${
                  weightByUser.has(u.id)
                    ? ` (đã giao ${weightByUser.get(u.id)}%)`
                    : ""
                }`,
              }))}
            />
          </Field>
        )}
        {f.scopeType === "PRODUCT" && (
          <Field label="Sản phẩm">
            <SimpleSelect
              value={f.productId}
              onValueChange={(v) => set("productId", v)}
              options={products.map((p) => ({ value: p.id, label: p.code }))}
            />
          </Field>
        )}
        <Field label="Chỉ tiêu (số)">
          <Input
            type="number"
            value={f.targetValue}
            onChange={(e) => set("targetValue", e.target.value)}
          />
        </Field>
        <Field label="Trọng số (%)">
          <Input
            type="number"
            value={f.weightPct}
            onChange={(e) => set("weightPct", e.target.value)}
          />
        </Field>
        <Field label="Ngân sách đã giao (đ)">
          <Input
            type="number"
            placeholder="để trống nếu không gắn ngân sách"
            value={f.allocatedBudget}
            onChange={(e) => set("allocatedBudget", e.target.value)}
          />
        </Field>
      </div>

      {f.scopeType === "USER" && weightByUser.has(f.userId) && (
        <p
          className={cn(
            "mt-2 text-xs",
            (weightByUser.get(f.userId) ?? 0) + Number(f.weightPct || 0) === 100
              ? "text-ok"
              : "text-warn",
          )}
        >
          Tổng trọng số sau khi thêm:{" "}
          {(weightByUser.get(f.userId) ?? 0) + Number(f.weightPct || 0)}% (nên = 100%)
        </p>
      )}

      <Button
        className="mt-3"
        size="sm"
        disabled={pending || !f.targetValue}
        onClick={() =>
          start(async () => {
            const [ps, pe] =
              f.periodType === "MONTH"
                ? monthBounds(todayVnDayStr())
                : [periodStart, periodEnd];
            const res = await createKpiAssignmentAction({
              kpiDefinitionId: f.kpiDefinitionId,
              periodType: f.periodType as never,
              periodStart: ps,
              periodEnd: pe,
              scopeType: f.scopeType as never,
              userId: f.scopeType === "USER" ? f.userId : null,
              productId: f.scopeType === "PRODUCT" ? f.productId : null,
              targetValue: Number(f.targetValue),
              allocatedBudget: f.allocatedBudget
                ? Number(f.allocatedBudget)
                : null,
              weightPct: Number(f.weightPct || 0),
            });
            if (res.ok) {
              toast.success("Đã giao chỉ tiêu.");
              setF((p) => ({ ...p, targetValue: "", allocatedBudget: "" }));
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        Giao chỉ tiêu
      </Button>

      {progress.length > 0 && (
        <ul className="mt-3 space-y-1 border-t pt-2 text-xs">
          {progress.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span>
                {p.code} · {p.userName ?? p.scopeType} · chỉ tiêu{" "}
                {fmtNumUnit(p.target, p.unit)} · TS {p.weightPct}%
              </span>
              <button
                className="text-crit hover:underline"
                onClick={() =>
                  start(async () => {
                    const res = await deleteKpiAssignmentAction(p.id);
                    if (res.ok) router.refresh();
                    else toast.error(res.error);
                  })
                }
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Other costs

function OtherCostsPanel({
  costs,
  products,
  periodStart,
}: {
  costs: { id: string; costType: string; incurredOn: string; amount: number; note: string | null }[];
  products: { id: string; code: string }[];
  periodStart: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    costType: "KOL_KOC",
    incurredOn: periodStart,
    productId: "",
    amount: "",
    note: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const total = costs.reduce((a, c) => a + c.amount, 0);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-1 text-sm font-semibold">Chi phí KOL/KOC & khác</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Dùng cho chỉ tiêu “Doanh thu gộp sau chi phí MKT & KOL/KOC” (QĐ07 / SPEC 14.2).
        Tổng kỳ: {fmtVnd(total)}
      </p>
      <div className="grid gap-2 md:grid-cols-5">
        <Field label="Loại">
          <SimpleSelect
            value={f.costType}
            onValueChange={(v) => set("costType", v)}
            options={[
              { value: "KOL_KOC", label: "KOL/KOC" },
              { value: "TOOL", label: "Công cụ" },
              { value: "OTHER", label: "Khác" },
            ]}
          />
        </Field>
        <Field label="Sản phẩm">
          <SimpleSelect
            value={f.productId || "__none"}
            onValueChange={(v) => set("productId", v === "__none" ? "" : v)}
            options={[
              { value: "__none", label: "— chung —" },
              ...products.map((p) => ({ value: p.id, label: p.code })),
            ]}
          />
        </Field>
        <Field label="Ngày">
          <Input
            type="date"
            value={f.incurredOn}
            onChange={(e) => set("incurredOn", e.target.value)}
          />
        </Field>
        <Field label="Số tiền (đ)">
          <Input
            type="number"
            value={f.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </Field>
        <Field label="Ghi chú">
          <Input value={f.note} onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>
      <Button
        className="mt-2"
        size="sm"
        disabled={pending || !f.amount}
        onClick={() =>
          start(async () => {
            const res = await addOtherCostAction({
              costType: f.costType as never,
              incurredOn: f.incurredOn,
              productId: f.productId || null,
              amount: Number(f.amount),
              note: f.note || null,
            });
            if (res.ok) {
              toast.success("Đã thêm chi phí.");
              setF((p) => ({ ...p, amount: "", note: "" }));
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        Thêm
      </Button>
      {costs.length > 0 && (
        <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
          {costs.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>
                {c.incurredOn} · {c.costType} · {fmtVnd(c.amount)}
                {c.note ? ` · ${c.note}` : ""}
              </span>
              <button
                className="text-crit hover:underline"
                onClick={() =>
                  start(async () => {
                    await deleteOtherCostAction(c.id);
                    router.refresh();
                  })
                }
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ViewerSummary({ progress }: { progress: KpiProgress[] }) {
  const byCode = new Map<string, KpiProgress[]>();
  for (const p of progress) {
    if (!byCode.has(p.code)) byCode.set(p.code, []);
    byCode.get(p.code)!.push(p);
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...byCode.entries()].map(([code, items]) => {
        const target = items.reduce((a, i) => a + i.target, 0);
        const actual = items.reduce((a, i) => a + (i.actual ?? 0), 0);
        return (
          <div key={code} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{items[0].name}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {fmtNumUnit(actual, items[0].unit)}
            </div>
            <div className="text-xs text-muted-foreground">
              / chỉ tiêu {fmtNumUnit(target, items[0].unit)} ·{" "}
              {fmtPct(target ? actual / target : null)}
            </div>
          </div>
        );
      })}
      {progress.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có chỉ tiêu nào trong kỳ.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
