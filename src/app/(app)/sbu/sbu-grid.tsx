"use client";

import { AlertTriangle, Building2, ClipboardCheck, Inbox, ShieldAlert } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import type { SbuStats } from "@/lib/services/sbu-overview";

export interface SbuRow extends SbuStats {
  id: string;
  code: string;
  name: string;
  kind: string;
  region: string;
  active: boolean;
  ownerName: string | null;
}

const REGION_LABEL: Record<string, string> = {
  KV1: "Khu vực 1",
  KV2: "Khu vực 2",
  KV3: "Khu vực 3",
  KV2_KV3: "Khu vực 2/3",
  ONLINE: "Online",
  RND: "Nhóm nội bộ",
};
const REGION_COLORS: Record<string, TagColor> = {
  KV1: "blue",
  KV2: "violet",
  KV3: "purple",
  KV2_KV3: "indigo",
  ONLINE: "emerald",
  RND: "slate",
};
const KIND_LABEL: Record<string, string> = { center: "Trung tâm", online_center: "Trung tâm online", group: "Nhóm nội bộ" };

const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : null);

function Bar({ value, label, title }: { value: number | null; label?: React.ReactNode; title?: string }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-2" title={title}>
      <span className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", value >= 80 ? "bg-emerald-500" : value >= 40 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${value}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{value}%</span>
      {label && <span className="text-[11px] text-muted-foreground tabular-nums">{label}</span>}
    </span>
  );
}

const INITIAL_VIEW = { sorts: [{ field: "code", direction: "asc" as const }] };

export function SbuGrid({ rows, period }: { rows: SbuRow[]; period: string }) {
  const totals = React.useMemo(() => {
    const live = rows.filter((r) => r.active);
    const items = live.reduce((a, r) => ({ done: a.done + r.itemsDone, all: a.all + r.itemsApplicable }), { done: 0, all: 0 });
    return {
      sbus: live.length,
      overdue: live.reduce((a, r) => a + r.taskOverdue, 0),
      mon: live.reduce((a, r) => a + r.monitoringOverdue, 0),
      itemsPct: pct(items.done, items.all),
      requests: live.reduce((a, r) => a + r.requestsOpen, 0),
    };
  }, [rows]);

  const columns: GridColumn<SbuRow>[] = React.useMemo(
    () => [
      {
        field: "code",
        header: "Mã",
        kind: "text",
        accessor: (r) => r.code,
        defaultWidth: 90,
        groupable: false,
        cell: (r) => (
          <Link href={`/sbu/${r.id}`} className="font-semibold hover:text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.code}
          </Link>
        ),
      },
      { field: "name", header: "Tên", kind: "text", accessor: (r) => r.name, defaultWidth: 200, groupable: false },
      { field: "kind", header: "Loại", kind: "enum", accessor: (r) => r.kind, enumLabels: KIND_LABEL, defaultWidth: 140 },
      { field: "region", header: "Khu vực", kind: "enum", accessor: (r) => r.region, enumLabels: REGION_LABEL, enumColors: REGION_COLORS, defaultWidth: 120 },
      {
        field: "ownerName",
        header: "HO phụ trách",
        kind: "enum",
        accessor: (r) => r.ownerName ?? "",
        cell: (r) => r.ownerName ?? <span className="text-muted-foreground">—</span>,
        defaultWidth: 140,
      },
      {
        field: "campaigns",
        header: "Campaign",
        kind: "number",
        accessor: (r) => r.campaigns,
        align: "right",
        defaultWidth: 95,
        groupable: false,
        cell: (r) => (r.campaigns > 0 ? <span className="font-medium tabular-nums">{r.campaigns}</span> : <span className="text-muted-foreground">0</span>),
      },
      {
        field: "taskProgress",
        header: "Tiến độ task",
        kind: "number",
        accessor: (r) => pct(r.taskDone, r.taskTotal),
        defaultWidth: 210,
        groupable: false,
        cell: (r) => <Bar value={pct(r.taskDone, r.taskTotal)} label={`${r.taskDone}/${r.taskTotal}`} title={`${r.taskDone}/${r.taskTotal} task xong`} />,
      },
      {
        field: "taskOverdue",
        header: "Task trễ hạn",
        kind: "number",
        accessor: (r) => r.taskOverdue,
        align: "right",
        defaultWidth: 105,
        groupable: false,
        cell: (r) =>
          r.taskOverdue > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              <AlertTriangle className="h-3 w-3" /> {r.taskOverdue}
            </span>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        field: "itemProgress",
        header: `Hạng mục T${period.slice(5)}/${period.slice(0, 4)}`,
        kind: "number",
        accessor: (r) => pct(r.itemsDone, r.itemsApplicable),
        defaultWidth: 210,
        groupable: false,
        cell: (r) => <Bar value={pct(r.itemsDone, r.itemsApplicable)} label={`${r.itemsDone}/${r.itemsApplicable}`} title={`${r.itemsDone}/${r.itemsApplicable} hạng mục SBU đã xong trong kỳ ${period}`} />,
      },
      {
        field: "requestsOpen",
        header: "Request mở",
        kind: "number",
        accessor: (r) => r.requestsOpen,
        align: "right",
        defaultWidth: 100,
        groupable: false,
        cell: (r) => (r.requestsOpen > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{r.requestsOpen}</span> : <span className="text-muted-foreground">0</span>),
      },
      {
        field: "monitoringOverdue",
        header: "Giám sát",
        kind: "number",
        accessor: (r) => r.monitoringOverdue * 1000 + r.monitoringDueSoon,
        defaultWidth: 170,
        groupable: false,
        cell: (r) =>
          r.monitoringTotal === 0 ? (
            <span className="text-muted-foreground">Chưa có hạng mục</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              {r.monitoringOverdue > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">{r.monitoringOverdue} quá hạn</span>}
              {r.monitoringDueSoon > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{r.monitoringDueSoon} sắp hạn</span>}
              {r.monitoringOverdue === 0 && r.monitoringDueSoon === 0 && <span className="text-muted-foreground">{r.monitoringTotal} hạng mục · ổn</span>}
            </span>
          ),
      },
      {
        field: "active",
        header: "Trạng thái",
        kind: "boolean",
        accessor: (r) => r.active,
        cell: (r) => (r.active ? "Hoạt động" : "Ngừng"),
        defaultWidth: 100,
        groupable: false,
      },
    ],
    [period],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="SBU đang hoạt động" value={totals.sbus} icon={Building2} />
        <StatCard label="Task trễ hạn (mọi SBU)" value={totals.overdue} icon={AlertTriangle} tone={totals.overdue ? "crit" : "muted"} />
        <StatCard label={`Hạng mục kỳ ${period.slice(5)}/${period.slice(0, 4)} đã xong`} value={totals.itemsPct == null ? "—" : `${totals.itemsPct}%`} icon={ClipboardCheck} tone="info" />
        <StatCard label="Giám sát quá hạn" value={totals.mon} icon={ShieldAlert} tone={totals.mon ? "crit" : "muted"} hint={totals.requests ? `${totals.requests} request đang mở` : undefined} />
      </div>
      <DataGrid
        entity="sbus"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        initialView={INITIAL_VIEW}
        rowClassName={(r) => (!r.active ? "opacity-50" : r.taskOverdue > 0 || r.monitoringOverdue > 0 ? "bg-red-50/60 dark:bg-red-500/10" : undefined)}
        emptyText="Chưa có SBU."
      />
      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Inbox className="h-3.5 w-3.5" /> Bấm mã SBU để xem chi tiết task, request và giám sát của SBU đó.
      </p>
    </div>
  );
}
