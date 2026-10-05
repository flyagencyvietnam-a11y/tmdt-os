"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { areaRank, OTHER_AREA, type MonitoringRow, type SbuLite } from "./monitoring-shared";

/**
 * Tổng hợp số lượng POSM toàn hệ thống: mỗi dòng = (khu vực, loại POSM), mỗi cột = 1 trung tâm, cột cuối = tổng.
 * Tự cộng từ số lượng kiểm kê của từng hạng mục — thay cho sheet "Tổng hợp" trong file Excel (hay lỗi #VALUE!).
 * Ô trống "·" = trung tâm chưa kiểm kê dòng đó; "0" = đã kiểm kê và không có.
 */
export function SystemSummary({ items, sbus }: { items: MonitoringRow[]; sbus: SbuLite[] }) {
  const centers = React.useMemo(() => sbus.filter((s) => items.some((i) => i.sbuId === s.id && i.area)), [sbus, items]);

  const rows = React.useMemo(() => {
    const map = new Map<string, { area: string; title: string; order: number; qty: Map<string, number | null> }>();
    items.forEach((i, idx) => {
      if (!i.area) return;
      const key = `${i.area}||${i.title}`;
      let r = map.get(key);
      if (!r) {
        r = { area: i.area, title: i.title, order: idx, qty: new Map() };
        map.set(key, r);
      }
      if (i.quantity == null) {
        if (!r.qty.has(i.sbuId)) r.qty.set(i.sbuId, null);
      } else r.qty.set(i.sbuId, (r.qty.get(i.sbuId) ?? 0) + i.quantity);
    });
    return [...map.values()].sort((a, b) => areaRank(a.area) - areaRank(b.area) || a.order - b.order);
  }, [items]);

  if (centers.length === 0) return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Chưa có số liệu kiểm kê để tổng hợp.</p>;

  const totalOf = (r: (typeof rows)[number]) => [...r.qty.values()].reduce<number>((a, v) => a + (v ?? 0), 0);
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Tổng hợp POSM toàn hệ thống ({centers.length} trung tâm)</h3>
        <p className="text-xs text-muted-foreground">Cộng từ số lượng kiểm kê của từng hạng mục. “·” = chưa kiểm kê, “0” = đã kiểm kê và không có.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 min-w-56 bg-muted px-3 py-2 text-left font-medium">Loại POSM</th>
              {centers.map((c) => (
                <th key={c.id} className="px-2 py-2 text-right font-medium">
                  {c.code}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold text-foreground">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const head = idx === 0 || rows[idx - 1].area !== r.area;
              const total = totalOf(r);
              return (
                <React.Fragment key={`${r.area}||${r.title}`}>
                  {head && (
                    <tr className="bg-muted/40">
                      <td colSpan={centers.length + 2} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {r.area === OTHER_AREA ? "Khác (bổ sung theo từng trung tâm)" : r.area}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5">{r.title}</td>
                    {centers.map((c) => {
                      const has = r.qty.has(c.id);
                      const v = r.qty.get(c.id);
                      return (
                        <td key={c.id} className={cn("px-2 py-1.5 text-right tabular-nums", !has || v == null ? "text-muted-foreground/40" : v === 0 ? "text-muted-foreground" : "font-medium")}>
                          {!has || v == null ? "·" : v}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{total.toLocaleString("vi-VN")}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
