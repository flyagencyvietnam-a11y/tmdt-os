"use client";

import { cn } from "@/lib/utils";
import { b2cSummary } from "./rollups";
import { fmt, fmtMoney, fmtPct, monthLabel } from "./shared";
import type { MetricRow } from "./shared";

/**
 * So sánh nguồn B2C: ads ngân sách riêng từng trung tâm vs phần còn lại (suy ra) vs tổng — trả lời "ads ngân sách TT có tốt hơn không?".
 * Lead/HVM của trung tâm là TẬP CON của số tổng B2C (dòng Hệ thống), không cộng thêm. Tính trên các THÁNG của khoảng đang xem.
 */
export function B2cSplit({ metrics, months }: { metrics: MetricRow[]; months: string[] }) {
  const s = b2cSummary(metrics, months);
  if (s.attributedMonths === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-4 py-4 text-sm text-muted-foreground">
        Khoảng đang chọn chưa có số Lead/HVM quy riêng cho ads từng trung tâm (báo cáo này bắt đầu từ T7/2026). Số tổng B2C vẫn nằm ở dòng Hệ thống của bảng trên.
      </div>
    );
  }
  const rows: { key: string; label: string; note: string; d: { spend: number | null; leads: number | null; newStudents: number | null; cpl: number | null; cac: number | null; cvr: number | null }; strong?: boolean }[] = [
    { key: "center", label: "Ads ngân sách riêng từng TT", note: "NS TT order + P.MKT chạy thêm; Lead/HVM quy theo campaign của TT", d: s.center },
    { key: "rest", label: "Phần còn lại (Hệ thống + nguồn khác)", note: "Suy ra: Lead/HVM = tổng − TT; NS = NS Hệ thống. Chỉ tham khảo", d: s.rest },
    { key: "all", label: "Tổng B2C Offline", note: "Số báo cáo chung (Hệ thống + Trung tâm)", d: { spend: s.totalSpend, leads: s.leads, newStudents: s.newStudents, cpl: s.cpl, cac: s.cac, cvr: s.cvr }, strong: true },
  ];
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">B2C Offline — ads ngân sách riêng trung tâm so với tổng</h3>
        <p className="text-xs text-muted-foreground">Chỉ tính các tháng đã có số quy riêng cho trung tâm (từ T7/2026) trong khoảng đang xem.</p>
      </header>
      {s.inconsistentMonths.length > 0 && (
        <div className="border-b bg-red-500/10 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-400">
          Số quy riêng cho TT đang LỚN HƠN số tổng B2C ở {s.inconsistentMonths.map((m) => monthLabel(m, true)).join(", ")} — kiểm tra lại Lead/HVM của dòng Hệ thống hoặc của trung tâm.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nguồn</th>
              <th className="px-3 py-2 text-right font-medium">Ngân sách</th>
              <th className="px-3 py-2 text-right font-medium">Lead</th>
              <th className="px-3 py-2 text-right font-medium">HVM</th>
              <th className="px-3 py-2 text-right font-medium">CPL</th>
              <th className="px-3 py-2 text-right font-medium">CAC</th>
              <th className="px-3 py-2 text-right font-medium">CVR</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key} className={cn(r.strong && "bg-muted/40 font-semibold")}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">{r.note}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.d.spend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.d.leads)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.d.newStudents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.d.cpl)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.d.cac)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.d.cvr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
