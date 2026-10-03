"use client";

import { Download, FileSpreadsheet, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Task trễ hạn" value={metrics.overdueByPerson.reduce((s, r) => s + r.count, 0)} tone="crit" />
        <StatCard label="Campaign đang theo dõi" value={metrics.campaignProgress.length} />
        <StatCard label="Request mở" value={metrics.requestStats.inProgress + metrics.requestStats.new} />
        <StatCard label="Request trễ hạn" value={metrics.requestStats.overdue} tone="crit" />
        <StatCard label="SBU theo dõi" value={metrics.sbuRows.length} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Trễ hạn theo người</h2>
        <div className="h-64 rounded-md border p-2">
          {chartData.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Không có task trễ hạn.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#be202f" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Tiến độ campaign</h2>
        <SimpleTable
          columns={["Mã", "Tên", "Trạng thái", "Tổng task", "Đã xong", "Trễ hạn", "% xong"]}
          rows={metrics.campaignProgress.map((c) => [c.code, c.name, c.status, c.total, c.done, c.overdue, `${c.pctDone}%`])}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Ma trận SBU — % hoàn thành</h2>
          <SimpleTable columns={["SBU", "Tên", "Tổng hạng mục", "Đã xong", "% xong"]} rows={metrics.sbuRows.map((s) => [s.code, s.name, s.totalCatalogItems, s.done, `${s.pctDone}%`])} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Tỷ lệ đúng hạn theo loại task (tháng này)</h2>
          <SimpleTable columns={["Loại", "Số task done", "% đúng hạn"]} rows={metrics.onTimeByType.map((t) => [t.type, t.total, `${t.pct}%`])} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Tỷ lệ đúng hạn theo người (tháng này)</h2>
          <p className="text-xs text-muted-foreground">Dùng để đo, không dùng để chấm điểm (Mục 12.2) — không công khai bảng xếp hạng.</p>
          <SimpleTable columns={["Người phụ trách", "Số task done", "% đúng hạn"]} rows={metrics.onTimeByPerson.map((p) => [p.name, p.total, `${p.pct}%`])} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Việc lặp — tỷ lệ đúng hạn theo quy tắc</h2>
          <SimpleTable columns={["Quy tắc", "Số lần hoàn thành", "% đúng hạn"]} rows={metrics.recurringOnTime.map((r) => [r.ruleName, r.total, `${r.pct}%`])} />
        </section>
      </div>

      {canManage && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Xuất báo cáo</h2>
          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
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
                <Input type="date" value={monday} onChange={(e) => setMonday(e.target.value)} className="h-9 w-40" />
                <a href={`/api/export/bod-schedule?monday=${monday}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <Download className="mr-1 h-4 w-4" /> Tải
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-md border">
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
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("vi-VN")}</td>
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
        </section>
      )}
    </div>
  );
}

function mondayOfThisWeek(): string {
  const d = new Date();
  const wd = d.getUTCDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "crit" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold", tone === "crit" && value > 0 && "text-crit")}>{value}</div>
    </div>
  );
}

function SimpleTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
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
            <tr key={i} className="border-b">
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
