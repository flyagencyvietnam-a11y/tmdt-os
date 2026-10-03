"use client";

import { Megaphone, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { computeAdsDerived, type AdsDerived } from "@/lib/services/ads";
import { upsertAdsMetricAction } from "./actions";
import { CampaignsDialog } from "./campaigns-dialog";
import { DisbursementPanel } from "./disbursement-panel";

type Line = "b2c_system" | "b2c_center" | "ecom" | "b2b" | "osir" | "vmp";
type PeriodType = "month" | "week";

interface MetricRow {
  id: string;
  line: Line;
  periodType: PeriodType;
  period: string;
  sbuId: string | null;
  budget: string | null;
  centerOrderBudget: string | null;
  hoTopupBudget: string | null;
  leads: string | null;
  newStudents: string | null;
  messages: string | null;
  impressions: string | null;
  revenue: string | null;
  actualRevenue: string | null;
  mql: string | null;
  deals: string | null;
  status: string;
  centerFeedback?: string | null;
  mktAssessment?: string | null;
  notes?: string | null;
}
interface SbuLite {
  id: string;
  code: string;
  name: string;
}
interface CampaignRow {
  id: string;
  sbuId: string;
  period: string;
  campaignName: string;
  spend: string;
  [k: string]: unknown;
}
interface DisbursementRow {
  id: string;
  line: string;
  period: string;
  plannedAmount: string;
  notes: string | null;
}

const LINE_LABELS: Record<Line, string> = {
  b2c_system: "B2C Hệ thống",
  b2c_center: "B2C Trung tâm",
  ecom: "Ecom (TMĐT)",
  b2b: "B2B",
  osir: "OSIR",
  vmp: "VMP (Du học)",
};

const EFFECTIVENESS_COLOR: Record<string, string> = {
  "Rất hiệu quả": "text-emerald-600 dark:text-emerald-400",
  "Hiệu quả": "text-teal-600 dark:text-teal-400",
  "Chấp nhận được": "text-amber-600 dark:text-amber-400",
  "Cần tối ưu": "text-orange-600 dark:text-orange-400",
  "Kém hiệu quả": "text-crit",
  "Chưa đủ dữ liệu": "text-muted-foreground",
};

function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("vi-VN");
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function AdsView({
  metrics,
  sbus,
  campaigns,
  disbursementPlan,
  canManage,
  currentMonth,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  campaigns: CampaignRow[];
  disbursementPlan: DisbursementRow[];
  canManage: boolean;
  currentMonth: string;
}) {
  const router = useRouter();
  const [line, setLine] = React.useState<Line>("b2c_center");
  const [periodType, setPeriodType] = React.useState<PeriodType>("month");
  const [period, setPeriod] = React.useState(currentMonth);
  const [editing, setEditing] = React.useState<{ row: MetricRow | null; sbuId: string | null } | null>(null);
  const [campaignsFor, setCampaignsFor] = React.useState<{ sbuId: string; period: string } | null>(null);

  const periods = [...new Set(metrics.filter((m) => m.line === line && m.periodType === periodType).map((m) => m.period))].sort().reverse();
  const sbuName = (id: string | null) => sbus.find((s) => s.id === id)?.code ?? "";

  const rowsForView = metrics.filter((m) => m.line === line && m.periodType === periodType && m.period === period);

  return (
    <Tabs defaultValue="metrics">
      <TabsList>
        <TabsTrigger value="metrics">Theo mảng</TabsTrigger>
        <TabsTrigger value="disbursement">Giải ngân (KH vs TT)</TabsTrigger>
      </TabsList>

      <TabsContent value="metrics" className="space-y-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect triggerClassName="h-8 w-44" value={line} onValueChange={(v) => v && setLine(v as Line)} options={Object.entries(LINE_LABELS).map(([value, label]) => ({ value, label }))} />
          {line === "b2c_center" && (
            <SimpleSelect triggerClassName="h-8 w-24" value={periodType} onValueChange={(v) => v && setPeriodType(v as PeriodType)} options={[{ value: "month", label: "Tháng" }, { value: "week", label: "Tuần" }]} />
          )}
          <Input className="h-8 w-40" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={periodType === "month" ? "2026-10" : "2026-10-03 (T7)"} />
          {periods.length > 0 && (
            <SimpleSelect triggerClassName="h-8 w-44" value="" onValueChange={(v) => v && setPeriod(v)} placeholder="Kỳ có dữ liệu…" options={periods.map((p) => ({ value: p, label: p }))} />
          )}
          {canManage && line !== "b2c_center" && (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => setEditing({ row: rowsForView[0] ?? null, sbuId: null })}
            >
              <Plus className="mr-1 h-4 w-4" /> {rowsForView[0] ? "Sửa" : "Nhập số liệu"}
            </Button>
          )}
        </div>

        {line === "b2c_center" ? (
          <div className="overflow-auto rounded-md border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">SBU</th>
                  <th className="px-2 py-2 text-right">NS Trung tâm order</th>
                  <th className="px-2 py-2 text-right">NS P.MKT thêm</th>
                  <th className="px-2 py-2 text-right">Tổng NS</th>
                  {periodType === "week" && <th className="px-2 py-2 text-right">Mess</th>}
                  {periodType === "month" && (
                    <>
                      <th className="px-2 py-2 text-right">Lead</th>
                      <th className="px-2 py-2 text-right">HVM</th>
                      <th className="px-2 py-2 text-right">CPL</th>
                      <th className="px-2 py-2 text-right">CAC</th>
                      <th className="px-2 py-2 text-right">CVR</th>
                      <th className="px-2 py-2">Hiệu quả</th>
                    </>
                  )}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {sbus.map((s) => {
                  const row = rowsForView.find((m) => m.sbuId === s.id) ?? null;
                  const derived: AdsDerived | null = row ? computeAdsDerived(row as never) : null;
                  return (
                    <tr key={s.id} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-1.5 font-medium">{s.code}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.centerOrderBudget)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.hoTopupBudget)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmt(derived?.totalBudget ?? null)}</td>
                      {periodType === "week" && <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.messages)}</td>}
                      {periodType === "month" && (
                        <>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.leads)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(row?.newStudents)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(derived?.cpl ?? null)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt(derived?.cac ?? null)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(derived?.cvr ?? null)}</td>
                          <td className={cn("px-2 py-1.5 text-xs font-medium", EFFECTIVENESS_COLOR[derived?.effectivenessLabel ?? "Chưa đủ dữ liệu"])}>
                            {derived?.effectivenessLabel ?? "—"}
                          </td>
                        </>
                      )}
                      <td className="px-2 py-1.5">
                        <div className="flex gap-2">
                          {canManage && (
                            <button className="text-xs hover:underline" onClick={() => setEditing({ row, sbuId: s.id })}>
                              Sửa
                            </button>
                          )}
                          {periodType === "month" && (
                            <button className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline" onClick={() => setCampaignsFor({ sbuId: s.id, period })}>
                              <Megaphone className="h-3 w-3" /> Chiến dịch
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <SingleLineCard line={line} row={rowsForView[0] ?? null} />
        )}
      </TabsContent>

      <TabsContent value="disbursement" className="pt-3">
        <DisbursementPanel plan={disbursementPlan} metrics={metrics} canManage={canManage} currentMonth={currentMonth} />
      </TabsContent>

      <MetricEditDialog
        target={editing}
        line={line}
        periodType={periodType}
        period={period}
        onOpenChange={(o) => !o && setEditing(null)}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
      />
      {campaignsFor && (
        <CampaignsDialog
          sbuId={campaignsFor.sbuId}
          sbuCode={sbuName(campaignsFor.sbuId)}
          period={campaignsFor.period}
          campaigns={campaigns.filter((c) => c.sbuId === campaignsFor.sbuId && c.period === campaignsFor.period)}
          canManage={canManage}
          onOpenChange={(o) => !o && setCampaignsFor(null)}
          onDone={() => router.refresh()}
        />
      )}
    </Tabs>
  );
}

function SingleLineCard({ line, row }: { line: Line; row: MetricRow | null }) {
  const derived = row ? computeAdsDerived(row as never) : null;
  if (!row) return <p className="rounded-md border p-10 text-center text-sm text-muted-foreground">Chưa có số liệu cho kỳ này — bấm &quot;Nhập số liệu&quot;.</p>;
  const fields: [string, string][] = [
    ["Ngân sách chi", fmt(row.budget)],
    ["Lead/Data", fmt(row.leads)],
    [line === "ecom" ? "HVM online" : line === "osir" ? "Học viên ghi danh thi" : line === "vmp" ? "Học sinh đăng ký DV" : "HVM", fmt(row.newStudents)],
    ["CPL", fmt(derived?.cpl ?? null)],
    ["CAC", fmt(derived?.cac ?? null)],
    ["CVR Lead→HVM", fmtPct(derived?.cvr ?? null)],
  ];
  if (line === "ecom") {
    fields.push(["MQL", fmt(row.mql)], ["CPMQL", fmt(derived?.cpmql ?? null)], ["Doanh thu", fmt(row.revenue)], ["Thực thu", fmt(row.actualRevenue)], ["ROAS", derived?.roas != null ? derived.roas.toFixed(2) + "x" : "—"]);
  }
  if (line === "b2b") fields.push(["Mess", fmt(row.messages)], ["Hợp đồng/Deal chốt", fmt(row.deals)]);
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border p-4 sm:grid-cols-3 lg:grid-cols-4">
      {fields.map(([label, value]) => (
        <div key={label}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

function MetricEditDialog({
  target,
  line,
  periodType,
  period,
  onOpenChange,
  onDone,
}: {
  target: { row: MetricRow | null; sbuId: string | null } | null;
  line: Line;
  periodType: PeriodType;
  period: string;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const row = target?.row;
  const [f, setF] = React.useState({
    budget: row?.budget ?? "",
    centerOrderBudget: row?.centerOrderBudget ?? "",
    hoTopupBudget: row?.hoTopupBudget ?? "",
    leads: row?.leads ?? "",
    newStudents: row?.newStudents ?? "",
    messages: row?.messages ?? "",
    impressions: row?.impressions ?? "",
    revenue: row?.revenue ?? "",
    actualRevenue: row?.actualRevenue ?? "",
    mql: row?.mql ?? "",
    deals: row?.deals ?? "",
    centerFeedback: row?.centerFeedback ?? "",
    mktAssessment: row?.mktAssessment ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isCenter = line === "b2c_center";

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {LINE_LABELS[line]} — {period}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {isCenter ? (
              <>
                <F label="NS Trung tâm order">
                  <Input type="number" value={f.centerOrderBudget} onChange={(e) => set("centerOrderBudget", e.target.value)} />
                </F>
                <F label="NS P.MKT thêm">
                  <Input type="number" value={f.hoTopupBudget} onChange={(e) => set("hoTopupBudget", e.target.value)} />
                </F>
              </>
            ) : (
              <F label="Ngân sách chi">
                <Input type="number" value={f.budget} onChange={(e) => set("budget", e.target.value)} />
              </F>
            )}
            {periodType === "week" ? (
              <>
                <F label="Mess">
                  <Input type="number" value={f.messages} onChange={(e) => set("messages", e.target.value)} />
                </F>
                <F label="Impression">
                  <Input type="number" value={f.impressions} onChange={(e) => set("impressions", e.target.value)} />
                </F>
              </>
            ) : (
              <>
                <F label="Lead/Data">
                  <Input type="number" value={f.leads} onChange={(e) => set("leads", e.target.value)} />
                </F>
                <F label={line === "osir" ? "Học viên ghi danh thi" : line === "vmp" ? "Học sinh đăng ký DV" : "HVM"}>
                  <Input type="number" value={f.newStudents} onChange={(e) => set("newStudents", e.target.value)} />
                </F>
              </>
            )}
            {line === "ecom" && (
              <>
                <F label="MQL">
                  <Input type="number" value={f.mql} onChange={(e) => set("mql", e.target.value)} />
                </F>
                <F label="Doanh thu">
                  <Input type="number" value={f.revenue} onChange={(e) => set("revenue", e.target.value)} />
                </F>
                <F label="Thực thu">
                  <Input type="number" value={f.actualRevenue} onChange={(e) => set("actualRevenue", e.target.value)} />
                </F>
              </>
            )}
            {line === "b2b" && (
              <F label="Hợp đồng/Deal chốt">
                <Input type="number" value={f.deals} onChange={(e) => set("deals", e.target.value)} />
              </F>
            )}
          </div>
          {isCenter && periodType === "month" && (
            <>
              <F label="Feedback trung tâm">
                <Input value={f.centerFeedback} onChange={(e) => set("centerFeedback", e.target.value)} />
              </F>
              <F label="MKT đánh giá">
                <Input value={f.mktAssessment} onChange={(e) => set("mktAssessment", e.target.value)} />
              </F>
            </>
          )}
          <Button
            className="w-full"
            disabled={pending || !target}
            onClick={() =>
              start(async () => {
                if (!target) return;
                const res = await upsertAdsMetricAction({
                  id: row?.id,
                  line,
                  periodType,
                  period,
                  sbuId: target.sbuId,
                  budget: f.budget || null,
                  centerOrderBudget: f.centerOrderBudget || null,
                  hoTopupBudget: f.hoTopupBudget || null,
                  leads: f.leads || null,
                  newStudents: f.newStudents || null,
                  messages: f.messages || null,
                  impressions: f.impressions || null,
                  revenue: f.revenue || null,
                  actualRevenue: f.actualRevenue || null,
                  mql: f.mql || null,
                  deals: f.deals || null,
                  centerFeedback: f.centerFeedback || null,
                  mktAssessment: f.mktAssessment || null,
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export { LINE_LABELS };
export type { Line, MetricRow };
