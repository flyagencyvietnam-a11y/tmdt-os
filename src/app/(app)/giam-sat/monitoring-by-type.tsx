"use client";

import { Camera, ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { MonitoringItem } from "./monitoring-item";
import { areaRank, KIND_LABELS, KIND_ORDER, type MonitoringRow, type SbuLite } from "./monitoring-shared";

export interface TypeGroup {
  key: string;
  title: string;
  area: string | null;
  kind: string;
  all: MonitoringRow[];
  shown: MonitoringRow[];
}

/** Gom hạng mục của MỌI trung tâm theo loại (cùng khu vực + cùng tên, vd. "Standee thương hiệu / chiến dịch" ở Sảnh lễ tân). */
export function buildTypeGroups(items: MonitoringRow[], matches: (i: MonitoringRow) => boolean): TypeGroup[] {
  const map = new Map<string, TypeGroup & { order: number }>();
  items.forEach((i, idx) => {
    const key = `${i.kind}||${i.area ?? ""}||${i.title.trim().toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = { key, title: i.title, area: i.area, kind: i.kind, all: [], shown: [], order: idx };
      map.set(key, g);
    }
    g.all.push(i);
    if (matches(i)) g.shown.push(i);
  });
  return [...map.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || areaRank(a.area) - areaRank(b.area) || a.order - b.order);
}

/** Giám sát theo LOẠI hạng mục: mỗi loại là 1 nhóm, mở ra thấy hạng mục của từng trung tâm (so sánh nhanh giữa các trung tâm). */
export function ByTypeView({
  groups,
  sbus,
  isOpen,
  toggle,
  canEdit,
  canManage,
}: {
  groups: TypeGroup[];
  sbus: SbuLite[];
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  canEdit: boolean;
  canManage: boolean;
}) {
  const codeOf = React.useMemo(() => new Map(sbus.map((s) => [s.id, s.code])), [sbus]);
  return (
    <div className="space-y-2">
      {groups.map((g, idx) => {
        const expanded = isOpen(g.key);
        const overdue = g.all.filter((i) => i.alert === "overdue").length;
        const dueSoon = g.all.filter((i) => i.alert === "due_soon").length;
        const noData = g.all.filter((i) => i.alert === "no_data").length;
        const qty = g.all.reduce((a, i) => a + (i.quantity ?? 0), 0);
        const reported = g.all.filter((i) => i.quantity != null).length;
        const photos = g.all.reduce((a, i) => a + i.photos.length, 0);
        const kindHead = idx === 0 || groups[idx - 1].kind !== g.kind;
        const shown = g.shown.slice().sort((a, b) => (codeOf.get(a.sbuId) ?? "").localeCompare(codeOf.get(b.sbuId) ?? ""));
        return (
          <React.Fragment key={g.key}>
            {kindHead && <h3 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{KIND_LABELS[g.kind] ?? g.kind}</h3>}
            <section className={cn("overflow-hidden rounded-xl border bg-card shadow-xs", overdue > 0 && "border-red-300 dark:border-red-500/40")}>
              <button type="button" aria-expanded={expanded} onClick={() => toggle(g.key)} className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/40", overdue > 0 && "bg-red-50/70 dark:bg-red-500/10")}>
                {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="text-base font-semibold">{g.title}</span>
                {g.area && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{g.area}</span>}
                <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums">{g.all.length} trung tâm</span>
                  {reported > 0 && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold tabular-nums text-sky-800 dark:bg-sky-500/20 dark:text-sky-300" title={`${reported}/${g.all.length} trung tâm đã kiểm kê số lượng`}>
                      Σ {qty.toLocaleString("vi-VN")}
                    </span>
                  )}
                  {overdue > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-semibold tabular-nums text-white">{overdue} quá hạn</span>}
                  {dueSoon > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold tabular-nums text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{dueSoon} sắp hạn</span>}
                  {noData > 0 && <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">{noData} chưa rà soát</span>}
                  {photos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">
                      <Camera className="h-3 w-3" /> {photos}
                    </span>
                  )}
                </span>
              </button>
              {expanded && (
                <div className="space-y-2 border-t bg-muted/20 p-3">
                  {shown.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Không có hạng mục khớp bộ lọc.</p>}
                  {shown.map((i) => (
                    <MonitoringItem key={i.id} item={i} canEdit={canEdit} canManage={canManage} sbuLabel={codeOf.get(i.sbuId)} />
                  ))}
                </div>
              )}
            </section>
          </React.Fragment>
        );
      })}
      {groups.length === 0 && <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">Không có hạng mục nào khớp.</p>}
    </div>
  );
}
