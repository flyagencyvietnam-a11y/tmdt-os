"use client";

import { AlertTriangle, Building2, Download, FileSpreadsheet, Inbox, Megaphone, RefreshCcw, TimerOff } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { StatCard } from "@/components/stat-card";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ManagementMetrics } from "@/lib/services/reports";
import { generateReportNowAction } from "./actions";

interface ReportExportRow {
  id: string;
  kind: string;
  period: string | null;
  fileName: string;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = { weekly_summary: "Tuần", monthly_summary: "Tháng", bod_schedule: "Lịch tuần BOD" };

export function DashboardView({
  metrics,
  exports,
  canManage,
  currentPeriod,
}: {
  metrics: ManagementMetrics;
  exports: ReportExportRow[];
  canManage: boolean;
  currentPeriod: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [monday, setMonday] = React.useState(mondayOfThisWeek());

  const chartData = metrics.overdueByPerson.slice(0, 10).map((r) => ({ name: r.name, count: r.count }));
  const overdueTotal = metrics.overdueByPerson.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Task trễ hạn" value={overdueTotal} icon={AlertTriangle} tone={overdueTotal ? "crit" : "ok"} hint={overdueTotal ? `${metrics.overdueByPerson.length} người có việc trễ` : "Không có"} href="/task" />
        <StatCard label="Campaign đang theo dõi" value={metrics.campaignProgress.length} icon={Megaphone} tone="brand" href="/campaign" />
        <StatCard label="Request đang mở" value={metrics.requestStats.inProgress + metrics.requestStats.new} icon={Inbox} tone="info" hint={`${metrics.requestStats.new} mới chưa nhận`} href="/request" />
        <StatCard label="Request trễ hạn" value={metrics.requestStats.overdue} icon={TimerOff} tone={metrics.requestStats.overdue ? "crit" : "ok"} href="/request" />
        <StatCard label="SBU theo dõi" value={metrics.sbuRows.length} icon={Building2} href="/sbu/matrix" />
      </div>

      <Panel title="Trễ hạn theo người" description="Top 10 người có nhiều task quá hạn nhất.">
        <div className="h-64">
          {chartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Không có task trễ hạn.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "var(--foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} formatter={(v) => [`${v} task`, "Trễ hạn"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar dataKey="count" name="Trễ hạn" fill="var(--series-8)" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <Panel title="Tiến độ campaign" flush>
        <SimpleTable
          columns={["Mã", "Tên", "Trạng thái", "Tổng task", "Đã xong", "Trễ hạn", "% xong"]}
          rows={metrics.campaignProgress.map((c) => [c.code, c.name, c.status, c.total, c.done, c.overdue ? <span key="o" className="font-semibold text-red-600 dark:text-red-400">{c.overdue}</span> : 0, <PctBar key="p" pct={c.pctDone} />])}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Ma trận SBU — % hoàn thành" flush>
          <SimpleTable columns={["SBU", "Tên", "Tổng hạng mục", "Đã xong", "% xong"]} rows={metrics.sbuRows.map((s) => [s.code, s.name, s.totalCatalogItems, s.done, <PctBar key="p" pct={s.pctDone} />])} />
        </Panel>
        <Panel title="Tỷ lệ đúng hạn theo loại task (tháng này)" flush>
          <SimpleTable columns={["Loại", "Số task done", "% đúng hạn"]} rows={metrics.onTimeByType.map((t) => [t.type, t.total, <PctBar key="p" pct={t.pct} />])} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tỷ lệ đúng hạn theo người (tháng này)" description="Dùng để đo và hỗ trợ, không dùng để chấm điểm — không công khai bảng xếp hạng." flush>
          <SimpleTable columns={["Người phụ trách", "Số task done", "% đúng hạn"]} rows={metrics.onTimeByPerson.map((p) => [p.name, p.total, <PctBar key="p" pct={p.pct} />])} />
        </Panel>
        <Panel title="Việc lặp — tỷ lệ đúng hạn theo quy tắc" flush>
          <SimpleTable columns={["Quy tắc", "Số lần hoàn thành", "% đúng hạn"]} rows={metrics.recurringOnTime.map((r) => [r.ruleName, r.total, <PctBar key="p" pct={r.pct} />])} />
        </Panel>
      </div>

      {canManage && (
        <Panel title="Xuất báo cáo">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Xuất báo cáo tháng ngay</Label>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await generateReportNowAction(currentPeriod);
                    if (res.ok) {
                      toast.success("Đã xuất báo cáo — xem danh sách bên dưới.");
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                <RefreshCcw className="mr-1 h-4 w-4" /> Xuất báo cáo tháng {currentPeriod}
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Xuất lịch tuần gửi BOD (Thứ Hai)</Label>
              <div className="flex gap-2">
                <DateInput value={monday} onChange={setMonday} className="w-40" />
                <a href={`/api/export/bod-schedule?monday=${monday}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <Download className="mr-1 h-4 w-4" /> Tải
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2">Kỳ</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Thời gian</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {exports.map((e) => (
                  <tr key={e.id} className="border-b">
                    <td className="px-3 py-1.5">{KIND_LABELS[e.kind] ?? e.kind}</td>
                    <td className="px-3 py-1.5">{e.period}</td>
                    <td className="px-3 py-1.5">{e.fileName}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                    <td className="px-3 py-1.5">
                      <a href={`/api/reports/${e.id}`} className="inline-flex items-center gap-1 text-xs hover:underline">
                        <FileSpreadsheet className="h-3 w-3" /> Tải
                      </a>
                    </td>
                  </tr>
                ))}
                {exports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      Chưa có báo cáo nào được xuất.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, description, flush, children }: { title: string; description?: string; flush?: boolean; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </header>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** % kèm thanh tiến độ, màu theo ngưỡng (≥80 tốt, ≥50 trung bình, còn lại kém) — luôn có số, không chỉ màu. */
function PctBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

function mondayOfThisWeek(): string {
  const d = new Date();
  const wd = d.getUTCDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function SimpleTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {r.map((v, j) => (
                <td key={j} className="px-3 py-1.5">
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có dữ liệu.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
