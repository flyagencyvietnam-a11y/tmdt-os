"use client";

import { AlertOctagon, Camera, ChevronDown, ChevronRight, CircleDashed, Clock, Plus, Table2, RefreshCcw, Search, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";
import { bulkCreateMonitoringItemsAction, runMonitoringAlertsNowAction } from "./actions";
import { MonitoringItem } from "./monitoring-item";
import { buildTypeGroups, ByTypeView } from "./monitoring-by-type";
import { SystemSummary } from "./monitoring-summary";
import { areaRank, KIND_LABELS, KIND_ORDER, type Alert, type MonitoringRow, type SbuLite } from "./monitoring-shared";

const REGION_COLORS: Record<string, TagColor> = { KV1: "blue", KV2: "violet", KV3: "purple", KV2_KV3: "indigo", ONLINE: "emerald", RND: "slate" };

/**
 * Giám sát theo SBU: danh sách SBU (kèm tóm tắt cảnh báo) — mở từng SBU để xem từng hạng mục
 * (Standee, Poster, Decal cửa kính, Bảng hiệu, Google Maps…) với hiện trạng, ảnh thực tế và lịch rà soát.
 */
export function MonitoringView({ items, sbus, canEdit, canManage }: { items: MonitoringRow[]; sbus: SbuLite[]; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = useSessionState<string[]>("monitoring:open", []);
  const [alertFilter, setAlertFilter] = useSessionState<Alert | null>("monitoring:alert", null);
  const [query, setQuery] = useSessionState<string>("monitoring:q", "");
  // Cách nhóm: theo trung tâm (mặc định) hoặc theo loại hạng mục (so sánh giữa các trung tâm).
  const [groupMode, setGroupMode] = useSessionState<"sbu" | "type">("monitoring:group", "sbu");
  const [typeOpen, setTypeOpen] = useSessionState<string[]>("monitoring:typeOpen", []);
  const [showSummary, setShowSummary] = useSessionState<boolean>("monitoring:summary", false);
  const [adding, setAdding] = React.useState<SbuLite | null>(null);

  const count = (a: Alert) => items.filter((i) => i.alert === a).length;
  const pick = (a: Alert) => setAlertFilter((p) => (p === a ? null : a));
  const ring = (a: Alert) => (alertFilter === a ? "ring-2 ring-brand" : "");

  const q = query.trim().toLowerCase();
  const matches = React.useCallback((i: MonitoringRow) => (!alertFilter || i.alert === alertFilter) && (!q || i.title.toLowerCase().includes(q) || (i.currentStateNote ?? "").toLowerCase().includes(q) || (KIND_LABELS[i.kind] ?? "").toLowerCase().includes(q)), [alertFilter, q]);

  const groups = React.useMemo(() => {
    const list = sbus.map((s) => {
      const all = items.filter((i) => i.sbuId === s.id);
      return {
        sbu: s,
        all,
        shown: all.filter(matches),
        overdue: all.filter((i) => i.alert === "overdue").length,
        dueSoon: all.filter((i) => i.alert === "due_soon").length,
        noData: all.filter((i) => i.alert === "no_data").length,
        photos: all.reduce((a, i) => a + i.photos.length, 0),
      };
    });
    // SBU có vấn đề (quá hạn → sắp hạn) lên đầu; còn lại theo mã.
    return list.sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || a.sbu.code.localeCompare(b.sbu.code));
  }, [sbus, items, matches]);

  const typeGroups = React.useMemo(() => buildTypeGroups(items, matches), [items, matches]);
  const filtering = !!alertFilter || !!q;
  const visibleTypeGroups = filtering ? typeGroups.filter((g) => g.shown.length > 0) : typeGroups;
  const isTypeOpen = (key: string) => typeOpen.includes(key) || (filtering && visibleTypeGroups.some((g) => g.key === key));
  const toggleType = (key: string) => setTypeOpen((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));
  const visibleGroups = filtering ? groups.filter((g) => g.shown.length > 0) : groups;
  const isOpen = (id: string) => open.includes(id) || (filtering && visibleGroups.some((g) => g.sbu.id === id));
  const toggle = (id: string) => setOpen((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button type="button" className="text-left" onClick={() => pick("overdue")}>
          <StatCard className={ring("overdue")} label="Quá hạn thay mới" value={count("overdue")} icon={AlertOctagon} tone={count("overdue") ? "crit" : "muted"} hint="Bấm để lọc" />
        </button>
        <button type="button" className="text-left" onClick={() => pick("due_soon")}>
          <StatCard className={ring("due_soon")} label="Sắp đến hạn (30 ngày)" value={count("due_soon")} icon={Clock} tone={count("due_soon") ? "warn" : "muted"} hint="Bấm để lọc" />
        </button>
        <button type="button" className="text-left" onClick={() => pick("ok")}>
          <StatCard className={ring("ok")} label="Còn hạn" value={count("ok")} icon={ShieldCheck} tone="ok" hint="Bấm để lọc" />
        </button>
        <button type="button" className="text-left" onClick={() => pick("no_data")}>
          <StatCard className={ring("no_data")} label="Chưa rà soát lần nào" value={count("no_data")} icon={CircleDashed} tone={count("no_data") ? "info" : "muted"} hint="Chưa có ngày cập nhật" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hạng mục, hiện trạng…" className="h-8 w-64 pl-8 pr-7 text-sm" />
          {query && (
            <button type="button" aria-label="Xoá tìm kiếm" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => setQuery("")}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {alertFilter && (
          <button type="button" className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand" onClick={() => setAlertFilter(null)}>
            Đang lọc theo cảnh báo <X className="h-3 w-3" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Nhóm theo">
            {(
              [
                ["sbu", "Theo trung tâm"],
                ["type", "Theo loại hạng mục"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setGroupMode(k)} className={cn("whitespace-nowrap rounded-md px-2.5 py-1 transition-colors", groupMode === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {label}
              </button>
            ))}
          </div>
          <Button variant={showSummary ? "default" : "outline"} size="sm" onClick={() => setShowSummary((v) => !v)}>
            <Table2 className="mr-1 h-4 w-4" /> Tổng hợp toàn hệ thống
          </Button>
          <Button variant="ghost" size="sm" onClick={() => (groupMode === "sbu" ? setOpen(groups.map((g) => g.sbu.id)) : setTypeOpen(typeGroups.map((g) => g.key)))}>
            Mở tất cả
          </Button>
          <Button variant="ghost" size="sm" onClick={() => (groupMode === "sbu" ? setOpen([]) : setTypeOpen([]))}>
            Thu gọn
          </Button>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await runMonitoringAlertsNowAction();
                  if (res.ok) {
                    toast.success(`Đã sinh ${res.data.created} task cảnh báo.`);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              <RefreshCcw className="mr-1 h-4 w-4" /> Chạy cảnh báo ngay
            </Button>
          )}
        </div>
      </div>

      {showSummary && <SystemSummary items={items} sbus={sbus} />}

      {groupMode === "type" && <ByTypeView groups={visibleTypeGroups} sbus={sbus} isOpen={isTypeOpen} toggle={toggleType} canEdit={canEdit} canManage={canManage} />}

      <div className={cn("space-y-2", groupMode === "type" && "hidden")}>
        {visibleGroups.map((g) => {
          const expanded = isOpen(g.sbu.id);
          return (
            <section key={g.sbu.id} className={cn("overflow-hidden rounded-xl border bg-card shadow-xs", g.overdue > 0 && "border-red-300 dark:border-red-500/40")}>
              <button type="button" className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/40", g.overdue > 0 && "bg-red-50/70 dark:bg-red-500/10")} onClick={() => toggle(g.sbu.id)} aria-expanded={expanded}>
                {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="text-base font-semibold">{g.sbu.code}</span>
                <span className="text-sm text-muted-foreground">{g.sbu.name !== g.sbu.code ? g.sbu.name : ""}</span>
                <Tag color={REGION_COLORS[g.sbu.region]}>{g.sbu.region.replace("_", "/")}</Tag>
                <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                  {g.all.length === 0 ? (
                    <span className="text-muted-foreground">Chưa có hạng mục</span>
                  ) : (
                    <>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium tabular-nums">{g.all.length} hạng mục</span>
                      {g.overdue > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white tabular-nums">{g.overdue} quá hạn</span>}
                      {g.dueSoon > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 tabular-nums dark:bg-amber-500/20 dark:text-amber-300">{g.dueSoon} sắp hạn</span>}
                      {g.noData > 0 && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground tabular-nums">{g.noData} chưa rà soát</span>}
                      {g.overdue === 0 && g.dueSoon === 0 && g.noData === 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Ổn</span>}
                      {g.photos > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">
                          <Camera className="h-3 w-3" /> {g.photos}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>

              {expanded && (
                <div className="space-y-4 border-t bg-muted/20 p-3">
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => setAdding(g.sbu)}>
                        <Plus className="mr-1 h-4 w-4" /> Thêm hạng mục cho {g.sbu.code}
                      </Button>
                    </div>
                  )}
                  {g.all.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">SBU này chưa có hạng mục giám sát. Bấm “Thêm hạng mục” (nhập nhiều dòng một lúc: Standee, Poster, Decal cửa kính…).</p>}
                  {g.all.length > 0 && g.shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Không có hạng mục khớp bộ lọc.</p>}
                  {KIND_ORDER.map((k) => {
                    const list = g.shown.filter((i) => i.kind === k).sort((a, b) => areaRank(a.area) - areaRank(b.area));
                    if (list.length === 0) return null;
                    return (
                      <div key={k} className="space-y-2">
                        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {KIND_LABELS[k]} <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{list.length}</span>
                        </h3>
                        {list.map((i) => (
                          <MonitoringItem key={i.id} item={i} canEdit={canEdit} canManage={canManage} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {visibleGroups.length === 0 && <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">Không có SBU / hạng mục nào khớp.</p>}
      </div>

      <AddItemsDialog key={adding?.id ?? "none"} sbu={adding} onClose={() => setAdding(null)} onDone={(id) => {
        setOpen((p) => (p.includes(id) ? p : [...p, id]));
        setAdding(null);
        router.refresh();
      }} />
    </div>
  );
}

function AddItemsDialog({ sbu, onClose, onDone }: { sbu: SbuLite | null; onClose: () => void; onDone: (sbuId: string) => void }) {
  const [pending, start] = React.useTransition();
  const [kind, setKind] = React.useState("posm");
  const [titles, setTitles] = React.useState("");
  const [cycle, setCycle] = React.useState(12);
  const lines = titles.split("\n").map((t) => t.trim()).filter(Boolean);
  const placeholder = kind === "google_maps" ? `Google Maps — ${sbu?.code ?? ""}` : kind === "posm" ? "Standee\nPoster\nDecal cửa kính" : kind === "signage" ? "Bảng hiệu mặt tiền\nBảng hiệu trong sảnh" : "Mỗi dòng 1 hạng mục";
  return (
    <Dialog open={!!sbu} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm hạng mục giám sát — {sbu?.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Loại</Label>
              <SimpleSelect value={kind} onValueChange={(v) => v && setKind(v)} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Chu kỳ (tháng)</Label>
              <Input type="number" min={1} value={cycle} onChange={(e) => setCycle(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tên hạng mục — mỗi dòng 1 hạng mục</Label>
            <Textarea rows={6} autoFocus value={titles} onChange={(e) => setTitles(e.target.value)} placeholder={placeholder} />
          </div>
          <Button
            className="w-full"
            disabled={pending || !sbu || lines.length === 0}
            onClick={() =>
              start(async () => {
                if (!sbu) return;
                const res = await bulkCreateMonitoringItemsAction({ sbuId: sbu.id, kind: kind as never, titles: lines, cycleMonths: Math.max(1, cycle || 12) });
                if (res.ok) {
                  toast.success(res.data.created === lines.length ? `Đã thêm ${res.data.created} hạng mục.` : `Đã thêm ${res.data.created}/${lines.length} hạng mục (còn lại đã có sẵn).`);
                  onDone(sbu.id);
                } else toast.error(res.error);
              })
            }
          >
            Thêm {lines.length > 0 ? `${lines.length} hạng mục` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
