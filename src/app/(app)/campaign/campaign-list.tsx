"use client";

import { AlertTriangle, CalendarClock, CircleUserRound, Megaphone, PlayCircle } from "lucide-react";
import { BulkDeleteButton } from "@/components/data-grid/bulk-delete";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { LinksCell, sbuTagOptions } from "@/components/sbu-links";
import { TagMultiSelect, type TagOption } from "@/components/tag-multi-select";
import type { TagColor } from "@/components/data-grid/tag";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createCampaignAction, deleteCampaignsAction, updateCampaignAction } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  brand_theme: "Brand Theme",
  product_gtm: "GTM sản phẩm",
  business_program: "Chương trình kinh doanh",
  rebrand: "Rebrand",
  data_program: "Dữ liệu",
  internal_program: "Nội bộ",
  other: "Khác",
};
/** Mỗi loại 1 màu — dùng cho nhãn, dải màu đầu dòng và thanh thời gian để phân biệt campaign ngay khi lướt. */
const TYPE_COLORS: Record<string, TagColor> = {
  brand_theme: "violet",
  product_gtm: "sky",
  business_program: "amber",
  rebrand: "rose",
  data_program: "teal",
  internal_program: "slate",
  other: "gray",
};
const TYPE_BAR: Record<string, string> = {
  brand_theme: "bg-violet-500",
  product_gtm: "bg-sky-500",
  business_program: "bg-amber-500",
  rebrand: "bg-rose-500",
  data_program: "bg-teal-500",
  internal_program: "bg-slate-400",
  other: "bg-gray-400",
};
const TYPE_BAND: Record<string, string> = {
  brand_theme: "shadow-[inset_4px_0_0_var(--color-violet-500)]",
  product_gtm: "shadow-[inset_4px_0_0_var(--color-sky-500)]",
  business_program: "shadow-[inset_4px_0_0_var(--color-amber-500)]",
  rebrand: "shadow-[inset_4px_0_0_var(--color-rose-500)]",
  data_program: "shadow-[inset_4px_0_0_var(--color-teal-500)]",
  internal_program: "shadow-[inset_4px_0_0_var(--color-slate-400)]",
  other: "shadow-[inset_4px_0_0_var(--color-gray-400)]",
};

const STATUS_LABEL: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  preparing: "Đang chuẩn bị",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn tất",
  cancelled: "Huỷ",
  needs_confirmation: "Cần xác nhận",
};
const STATUS_COLORS: Record<string, TagColor> = {
  planned: "slate",
  preparing: "amber",
  running: "blue",
  paused: "orange",
  done: "emerald",
  cancelled: "gray",
  needs_confirmation: "red",
};

type Phase = "upcoming" | "ongoing" | "ended";
const PHASE_LABEL: Record<Phase, string> = { upcoming: "Sắp diễn ra", ongoing: "Đang diễn ra", ended: "Đã kết thúc" };
const PHASE_COLORS: Record<Phase, TagColor> = { upcoming: "sky", ongoing: "emerald", ended: "gray" };

function phaseOf(c: { startDate: string; endDate: string }, today: string): Phase {
  if (c.endDate < today) return "ended";
  if (c.startDate > today) return "upcoming";
  return "ongoing";
}

interface CampaignRow {
  id: string;
  code: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  ownerId: string | null;
  sbuIds: string[];
  taskTotal: number;
  taskDone: number;
  progressPct: number | null;
  overdueCount: number;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const INITIAL_VIEW = { sorts: [{ field: "startDate", direction: "asc" as const }] };

export function CampaignList({
  campaigns,
  users,
  sbus,
  currentUserId,
  today,
  canEdit,
}: {
  campaigns: CampaignRow[];
  users: { id: string; fullName: string }[];
  sbus: { id: string; code: string; name: string; kind: string }[];
  currentUserId: string;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ code: "", name: "", type: "other", startDate: "", endDate: "", ownerId: currentUserId });
  const [linkSbus, setLinkSbus] = React.useState<string[]>([]);
  // SBU = brand/sản phẩm HOẶC trung tâm; brand tô màu hổ phách, trung tâm màu xanh để phân biệt.
  const sbuOpts = React.useMemo<TagOption[]>(() => sbuTagOptions(sbus), [sbus]);
  const saveLinks = React.useCallback(
    async (id: string, patch: { sbuIds?: string[] }) => {
      const res = await updateCampaignAction({ id, ...patch } as never);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const userName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      if (!["status", "type", "ownerId", "name", "startDate", "endDate"].includes(field)) return;
      if ((field === "name" || field === "startDate" || field === "endDate" || field === "ownerId") && !raw.trim()) return toast.error("Không được để trống.");
      const res = await updateCampaignAction({ id: rowId, [field]: raw.trim() } as never);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const stats = React.useMemo(() => {
    const live = campaigns.filter((c) => c.status !== "done" && c.status !== "cancelled");
    return {
      ongoing: live.filter((c) => phaseOf(c, today) === "ongoing").length,
      upcoming: live.filter((c) => phaseOf(c, today) === "upcoming").length,
      withOverdue: live.filter((c) => c.overdueCount > 0).length,
      noOwner: campaigns.filter((c) => !c.ownerId).length,
    };
  }, [campaigns, today]);

  const columns: GridColumn<CampaignRow>[] = React.useMemo(
    () => [
      { field: "code", header: "Mã", kind: "text", accessor: (r) => r.code, defaultWidth: 120, groupable: false },
      {
        field: "name",
        header: "Tên campaign",
        kind: "text",
        accessor: (r) => r.name,
        defaultWidth: 280,
        groupable: false,
        editable: canEdit,
        cell: (r) => (
          <Link href={`/campaign/${r.id}`} className="font-medium hover:text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.name}
          </Link>
        ),
      },
      {
        field: "type",
        header: "Loại",
        kind: "enum",
        accessor: (r) => r.type,
        enumLabels: TYPE_LABEL,
        enumColors: TYPE_COLORS,
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.type,
        defaultWidth: 170,
      },
      {
        field: "ownerId",
        header: "Owner",
        kind: "enum",
        accessor: (r) => r.ownerId ?? "",
        cell: (r) =>
          r.ownerId ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[10px] font-semibold uppercase text-brand">{initials(userName(r.ownerId))}</span>
              {userName(r.ownerId)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
              <AlertTriangle className="h-3 w-3" /> Chưa có owner
            </span>
          ),
        enumOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        filterOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        editable: canEdit,
        editKind: "select",
        editOptions: users.map((u) => ({ value: u.id, label: u.fullName })),
        editValue: (r) => r.ownerId ?? "",
        defaultWidth: 160,
      },
      {
        field: "sbuIds",
        header: "SBU (brand / trung tâm)",
        kind: "enum",
        accessor: (r) => r.sbuIds,
        cell: (r) => (
          <LinksCell
            key={r.sbuIds.join(",")}
            value={r.sbuIds}
            options={sbuOpts}
            canEdit={canEdit}
            empty="Toàn hệ thống / chưa gắn"
            onSave={(v) => saveLinks(r.id, { sbuIds: v })}
          />
        ),
        enumOptions: sbuOpts,
        filterOptions: sbuOpts,
        groupable: true,
        defaultWidth: 220,
      },
      {
        field: "status",
        header: "Trạng thái",
        kind: "enum",
        accessor: (r) => r.status,
        enumLabels: STATUS_LABEL,
        enumColors: STATUS_COLORS,
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.status,
        defaultWidth: 140,
      },
      {
        field: "phase",
        header: "Giai đoạn",
        kind: "enum",
        accessor: (r) => phaseOf(r, today),
        enumLabels: PHASE_LABEL,
        enumColors: PHASE_COLORS,
        defaultWidth: 120,
      },
      {
        field: "timeline",
        header: "Thời gian diễn ra",
        kind: "text",
        accessor: (r) => r.startDate,
        sortable: true,
        groupable: false,
        defaultWidth: 230,
        cell: (r) => <Timeline row={r} today={today} />,
      },
      {
        field: "startDate",
        header: "Bắt đầu",
        kind: "date",
        accessor: (r) => r.startDate,
        cell: (r) => fmtDate(r.startDate),
        editable: canEdit,
        editInputType: "date",
        editValue: (r) => r.startDate,
        defaultWidth: 105,
        groupable: false,
      },
      {
        field: "endDate",
        header: "Kết thúc",
        kind: "date",
        accessor: (r) => r.endDate,
        cell: (r) => fmtDate(r.endDate),
        editable: canEdit,
        editInputType: "date",
        editValue: (r) => r.endDate,
        defaultWidth: 105,
        groupable: false,
      },
      {
        field: "progressPct",
        header: "Tiến độ",
        kind: "number",
        accessor: (r) => r.progressPct,
        cell: (r) =>
          r.progressPct === null ? (
            <span className="text-muted-foreground">Chưa có task</span>
          ) : (
            <span className="flex items-center gap-2" title={`${r.taskDone}/${r.taskTotal} task xong`}>
              <span className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", r.progressPct >= 80 ? "bg-emerald-500" : r.progressPct >= 40 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${r.progressPct}%` }} />
              </span>
              <span className="w-9 text-right tabular-nums">{r.progressPct}%</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {r.taskDone}/{r.taskTotal}
              </span>
            </span>
          ),
        defaultWidth: 200,
        groupable: false,
      },
      {
        field: "overdueCount",
        header: "Trễ hạn",
        kind: "number",
        accessor: (r) => r.overdueCount,
        cell: (r) =>
          r.overdueCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              <AlertTriangle className="h-3 w-3" /> {r.overdueCount}
            </span>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
        align: "right",
        defaultWidth: 90,
        groupable: false,
      },
    ],
    [canEdit, users, userName, today, sbuOpts, saveLinks],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Đang diễn ra" value={stats.ongoing} icon={PlayCircle} tone="ok" />
        <StatCard label="Sắp diễn ra" value={stats.upcoming} icon={CalendarClock} tone="info" />
        <StatCard label="Có task trễ hạn" value={stats.withOverdue} icon={AlertTriangle} tone={stats.withOverdue ? "crit" : "muted"} />
        <StatCard label="Chưa có owner" value={stats.noOwner} icon={CircleUserRound} tone={stats.noOwner ? "warn" : "muted"} hint={stats.noOwner ? "Bấm ô Owner để chọn" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Megaphone className="h-3.5 w-3.5" />
        {Object.entries(TYPE_LABEL).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cn("h-2.5 w-2.5 rounded-sm", TYPE_BAR[k])} /> {label}
          </span>
        ))}
      </div>

      <DataGrid
        entity="campaigns"
        columns={columns}
        rows={campaigns}
        getRowId={(r) => r.id}
        initialView={INITIAL_VIEW}
        onEditCell={canEdit ? onEditCell : undefined}
        onAddRow={canEdit ? () => setOpen(true) : undefined}
        bulkActions={
          canEdit
            ? (selected, clear) => (
                <>
                  <BulkOwner ids={selected.map((r) => r.id)} users={users} onDone={() => { clear(); router.refresh(); }} />
                  <BulkDeleteButton
                    count={selected.length}
                    noun="campaign"
                    warning={`Toàn bộ task action plan của campaign (${selected.reduce((a, r) => a + r.taskTotal, 0)} task) sẽ bị xoá theo; task/bài content gắn campaign chỉ bị gỡ liên kết.`}
                    onRun={async () => {
                      const res = await deleteCampaignsAction(selected.map((r) => r.id));
                      if (res.ok) {
                        toast.success(`Đã xoá ${res.campaigns} campaign (${res.tasks} task).`);
                        clear();
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                  />
                </>
              )
            : undefined
        }
        addRowLabel="Campaign mới"
        rowClassName={(r) => cn(TYPE_BAND[r.type], r.status === "done" || r.status === "cancelled" ? "opacity-60" : r.overdueCount > 0 ? "bg-red-50/70 dark:bg-red-500/10" : undefined)}
        emptyText="Chưa có campaign. Nạp qua template T1 hoặc tạo thủ công."
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Campaign mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Fld label="Mã (vd BT-2026-11)">
              <Input value={f.code} onChange={(e) => set("code", e.target.value)} />
            </Fld>
            <Fld label="Tên">
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Fld>
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Loại">
                <SimpleSelect value={f.type} onValueChange={(v) => v && set("type", v)} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              </Fld>
              <Fld label="Owner (bắt buộc)">
                <SimpleSelect value={f.ownerId} onValueChange={(v) => v && set("ownerId", v)} placeholder="Chọn owner" options={users.map((u) => ({ value: u.id, label: u.fullName }))} />
              </Fld>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Bắt đầu">
                <DateInput value={f.startDate} onChange={(v) => set("startDate", v)} />
              </Fld>
              <Fld label="Kết thúc">
                <DateInput value={f.endDate} onChange={(v) => set("endDate", v)} />
              </Fld>
            </div>
            <Fld label="SBU phục vụ — brand/sản phẩm và/hoặc trung tâm (tuỳ chọn)">
              <TagMultiSelect value={linkSbus} onChange={setLinkSbus} options={sbuOpts} placeholder="Chọn brand/sản phẩm hoặc trung tâm (để trống = toàn hệ thống)" />
            </Fld>
            {f.startDate && f.endDate && f.endDate < f.startDate && <p className="text-xs text-red-600">Ngày kết thúc phải sau ngày bắt đầu.</p>}
            <Button
              className="w-full"
              disabled={pending || !f.code.trim() || !f.name.trim() || !f.startDate || !f.endDate || !f.ownerId || f.endDate < f.startDate}
              onClick={() =>
                start(async () => {
                  const res = await createCampaignAction({ ...f, sbuIds: linkSbus } as never);
                  if (res.ok) {
                    toast.success("Đã tạo campaign.");
                    setOpen(false);
                    setLinkSbus([]);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Tạo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Chọn nhiều campaign → gán cùng 1 owner một lần (xử lý nhanh các campaign chưa có owner). */
function BulkOwner({ ids, users, onDone }: { ids: string[]; users: { id: string; fullName: string }[]; onDone: () => void }) {
  const [owner, setOwner] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <div className="flex items-center gap-1">
      <SimpleSelect triggerClassName="h-8 w-48" value={owner} onValueChange={(v) => setOwner(v ?? "")} placeholder="Gán owner cho…" options={users.map((u) => ({ value: u.id, label: u.fullName }))} />
      <Button
        size="sm"
        disabled={pending || !owner}
        onClick={() =>
          start(async () => {
            let fail = 0;
            for (const id of ids) {
              const res = await updateCampaignAction({ id, ownerId: owner } as never);
              if (!res.ok) fail++;
            }
            if (fail) toast.error(`Không gán được ${fail}/${ids.length} campaign.`);
            else toast.success(`Đã gán owner cho ${ids.length} campaign.`);
            onDone();
          })
        }
      >
        Gán owner ({ids.length})
      </Button>
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? "?" : parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
}

/** Thanh thời gian: vạch "hôm nay" trên đoạn bắt đầu → kết thúc, màu theo loại campaign. */
function Timeline({ row, today }: { row: CampaignRow; today: string }) {
  const total = Math.max(1, daysBetween(row.startDate, row.endDate));
  const pos = Math.min(100, Math.max(0, (daysBetween(row.startDate, today) / total) * 100));
  const phase = phaseOf(row, today);
  const remain = daysBetween(today, row.endDate);
  const until = daysBetween(today, row.startDate);
  return (
    <span className="flex items-center gap-2" title={`${fmtDate(row.startDate)} → ${fmtDate(row.endDate)}`}>
      <span className="relative h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
        <span className={cn("absolute inset-y-0 left-0 rounded-full opacity-90", TYPE_BAR[row.type])} style={{ width: phase === "upcoming" ? "0%" : `${phase === "ended" ? 100 : pos}%` }} />
        {phase === "ongoing" && <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${pos}%` }} />}
      </span>
      <span className="truncate text-xs tabular-nums text-muted-foreground">
        {phase === "upcoming" ? `Còn ${until} ngày nữa bắt đầu` : phase === "ongoing" ? `Còn ${remain} ngày` : `Đã kết thúc ${-remain} ngày`}
      </span>
    </span>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
