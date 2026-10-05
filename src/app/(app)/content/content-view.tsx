"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, Clock, ExternalLink, List as ListIcon, Newspaper, Pencil, Plus, Upload, X } from "lucide-react";
import { useSessionState } from "@/lib/use-session-state";
import { DateInput } from "@/components/ui/date-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { StatCard } from "@/components/stat-card";
import { TagMultiSelect, type TagOption } from "@/components/tag-multi-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { LoadMore, ScopeChips } from "@/components/scope-chips";
import { createContentItemAction, updateContentItemAction } from "./actions";
import { CHANNEL_OPTIONS, colorForBrand, colorForChannel } from "./content-colors";
import { ContentCalendarGrid } from "./content-calendar-grid";

export interface ContentRow {
  id: string;
  brandIds: string[];
  campaignId: string | null;
  sbuId: string | null;
  publishDate: string;
  channels: string[];
  topic: string;
  format: string | null;
  keyMessage: string | null;
  targetAudience: string | null;
  cta: string | null;
  ownerId: string | null;
  status: string;
  postUrl: string | null;
  contentPillar: string | null;
  /** Task đăng bài (task cha) — link qua lại với /task/[id]. */
  taskId: string | null;
  taskCode: string | null;
  taskStatus: string | null;
}
interface Lite {
  id: string;
  code?: string;
  name?: string;
  fullName?: string;
}

const STATUS_LABELS: Record<string, string> = {
  brief: "Brief",
  drafting: "Soạn nội dung",
  designing: "Thiết kế",
  in_review: "Chờ duyệt",
  approved: "Đã duyệt",
  published: "Đã đăng",
  cancelled: "Huỷ",
};
const STATUS_COLORS: Record<string, TagColor> = {
  brief: "slate",
  drafting: "blue",
  designing: "violet",
  in_review: "amber",
  approved: "teal",
  published: "emerald",
  cancelled: "gray",
};

/** Bài chưa đăng mà ngày đăng đã qua → trễ lịch đăng. */
function isLate(r: ContentRow, today: string) {
  return r.publishDate < today && r.status !== "published" && r.status !== "cancelled";
}

export function ContentCalendarView({
  items,
  brands,
  campaigns,
  sbus,
  users,
  today,
  scope,
  total,
  allCount,
  pageSize,
  initialOpenId,
}: {
  items: ContentRow[];
  brands: Lite[];
  campaigns: Lite[];
  sbus: Lite[];
  users: Lite[];
  today: string;
  scope: "recent" | "all";
  total: number;
  allCount: number;
  pageSize: number;
  /** Mở sẵn dialog 1 bài (link từ trang task: /content?item=ID). */
  initialOpenId?: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(() => (initialOpenId && items.some((i) => i.id === initialOpenId) ? { mode: "edit", id: initialOpenId } : null));
  const [view, setView] = useSessionState<"list" | "calendar">("content:view", "list");
  const [brandFilter, setBrandFilter] = useSessionState<string[]>("content:brands", []);
  const [channelFilter, setChannelFilter] = useSessionState<string[]>("content:channels", []);
  const [pending, start] = React.useTransition();

  const brandCode = React.useCallback((id: string) => brands.find((b) => b.id === id)?.code ?? "", [brands]);
  const userName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);
  // Vị trí brand trong danh sách — fallback index khi brand chưa có màu cố định (content-colors.ts).
  const brandColorIndex = React.useMemo(() => Object.fromEntries(brands.map((b, i) => [b.id, i])), [brands]);
  const brandColor = React.useCallback((id: string) => colorForBrand(brandCode(id), brandColorIndex[id] ?? 0), [brandCode, brandColorIndex]);

  const brandOptions: TagOption[] = React.useMemo(
    () => brands.map((b) => ({ value: b.id, label: b.code ?? "", color: colorForBrand(b.code ?? "", brandColorIndex[b.id] ?? 0), hint: b.name !== b.code ? b.name : undefined })),
    [brands, brandColorIndex],
  );
  // Kênh: danh sách chuẩn + kênh lạ đã có trong dữ liệu cũ (vd. nhập từ file).
  const channelOptions: TagOption[] = React.useMemo(() => {
    const all = [...CHANNEL_OPTIONS] as string[];
    for (const i of items) for (const c of i.channels) if (!all.includes(c)) all.push(c);
    return all.map((c) => ({ value: c, label: c, color: colorForChannel(c) }));
  }, [items]);

  const visible = items.filter(
    (i) => (brandFilter.length === 0 || i.brandIds.some((b) => brandFilter.includes(b))) && (channelFilter.length === 0 || i.channels.some((c) => channelFilter.includes(c))),
  );

  // --- số liệu nhanh theo tháng hiện tại (sau khi áp bộ lọc brand/kênh) ---
  const month = today.slice(0, 7);
  const weekEnd = addDays(today, 7);
  const inMonth = visible.filter((i) => i.publishDate.startsWith(month) && i.status !== "cancelled");
  const publishedInMonth = inMonth.filter((i) => i.status === "published").length;
  const next7 = visible.filter((i) => i.publishDate >= today && i.publishDate <= weekEnd && i.status !== "published" && i.status !== "cancelled");
  const late = visible.filter((i) => isLate(i, today));

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      let patch: Record<string, unknown> | null = null;
      if (field === "status") patch = { status: raw };
      else if (field === "postUrl") patch = { postUrl: raw || null };
      else if (field === "ownerId") patch = { ownerId: raw || null };
      else if (field === "publishDate") patch = raw ? { publishDate: raw } : null;
      if (!patch) return;
      const res = await updateContentItemAction(rowId, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const togglePublished = React.useCallback(
    (row: ContentRow, checked: boolean) => {
      start(async () => {
        const res = await updateContentItemAction(row.id, { status: checked ? "published" : "approved" });
        if (res.ok) {
          toast.success(checked ? "Đã đánh dấu đã đăng — các task liên quan đã đóng." : "Đã bỏ đánh dấu đăng.");
          router.refresh();
        } else toast.error(res.error);
      });
    },
    [router],
  );

  const columns: GridColumn<ContentRow>[] = React.useMemo(
    () => [
      {
        field: "publishDate",
        header: "Ngày đăng",
        kind: "date",
        accessor: (r) => r.publishDate,
        cell: (r) => (
          <span className={cn("inline-flex items-center gap-1 tabular-nums", isLate(r, today) && "font-medium text-red-600 dark:text-red-400")}>
            {isLate(r, today) && <AlertTriangle className="h-3 w-3" />}
            {fmtDate(r.publishDate)}
          </span>
        ),
        editable: true,
        editInputType: "date",
        defaultWidth: 120,
      },
      {
        field: "topic",
        header: "Chủ đề",
        kind: "text",
        accessor: (r) => r.topic,
        cell: (r) => (
          <button type="button" className="group flex w-full items-center gap-1.5 truncate text-left font-medium hover:text-brand" onClick={() => setDialog({ mode: "edit", id: r.id })}>
            <span className="truncate">{r.topic}</span>
            <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60" />
          </button>
        ),
        defaultWidth: 280,
        groupable: false,
      },
      {
        field: "brandIds",
        header: "Brand",
        kind: "enum",
        accessor: (r) => r.brandIds,
        cell: (r) => (
          <span className="flex gap-1 overflow-hidden">
            {r.brandIds.map((b) => (
              <Tag key={b} color={brandColor(b)}>
                {brandCode(b)}
              </Tag>
            ))}
          </span>
        ),
        enumOptions: brands.map((b) => ({ value: b.id, label: b.code ?? "" })),
        defaultWidth: 160,
      },
      {
        field: "channels",
        header: "Kênh",
        kind: "enum",
        accessor: (r) => r.channels,
        cell: (r) => (
          <span className="flex gap-1 overflow-hidden">
            {r.channels.map((c) => (
              <Tag key={c} color={colorForChannel(c)}>
                {c}
              </Tag>
            ))}
          </span>
        ),
        enumOptions: channelOptions.map((c) => ({ value: c.value, label: c.label })),
        defaultWidth: 170,
      },
      {
        field: "status",
        header: "Trạng thái",
        kind: "enum",
        accessor: (r) => r.status,
        enumLabels: STATUS_LABELS,
        enumColors: STATUS_COLORS,
        editable: true,
        editKind: "select",
        editOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        editValue: (r) => r.status,
        defaultWidth: 130,
      },
      {
        field: "published",
        header: "Đã đăng",
        kind: "boolean",
        accessor: (r) => r.status === "published",
        sortable: false,
        groupable: false,
        align: "center",
        cell: (r) => (
          <Checkbox
            checked={r.status === "published"}
            disabled={pending || r.status === "cancelled"}
            onCheckedChange={(v) => togglePublished(r, !!v)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        defaultWidth: 80,
      },
      {
        field: "taskCode",
        header: "Task đăng bài",
        kind: "text",
        accessor: (r) => r.taskCode ?? "",
        sortable: false,
        groupable: false,
        cell: (r) =>
          r.taskId ? (
            <Link href={`/task/${r.taskId}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-mono text-xs text-brand hover:underline" title="Mở task đăng bài">
              {r.taskCode ?? "Task"}
              {r.taskStatus === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        defaultWidth: 110,
      },
      {
        field: "ownerId",
        header: "Người phụ trách",
        kind: "enum",
        accessor: (r) => r.ownerId ?? "",
        cell: (r) => userName(r.ownerId) || <span className="text-muted-foreground">—</span>,
        enumOptions: users.map((u) => ({ value: u.id, label: u.fullName ?? "" })),
        editable: true,
        editKind: "select",
        editOptions: users.map((u) => ({ value: u.id, label: u.fullName ?? "" })),
        editValue: (r) => r.ownerId ?? "",
        defaultWidth: 150,
      },
      { field: "contentPillar", header: "Nhóm nội dung", kind: "text", accessor: (r) => r.contentPillar ?? "", defaultWidth: 140 },
      { field: "format", header: "Định dạng", kind: "text", accessor: (r) => r.format ?? "", defaultWidth: 120 },
      {
        field: "postUrl",
        header: "Link bài đăng",
        kind: "text",
        accessor: (r) => r.postUrl ?? "",
        editable: true,
        cell: (r) =>
          r.postUrl ? (
            <a href={r.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
              Xem <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        defaultWidth: 110,
      },
    ],
    [brands, users, brandCode, brandColor, userName, channelOptions, pending, today, togglePublished],
  );

  const editing = dialog?.mode === "edit" ? (items.find((i) => i.id === dialog.id) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Bài trong tháng ${month.slice(5)}`} value={inMonth.length} icon={Newspaper} tone="brand" hint={brandFilter.length || channelFilter.length ? "Theo bộ lọc đang chọn" : "Không tính bài huỷ"} />
        <StatCard
          label="Đã đăng trong tháng"
          value={`${publishedInMonth}/${inMonth.length}`}
          icon={CheckCircle2}
          tone="ok"
          hint={inMonth.length ? `${Math.round((publishedInMonth / inMonth.length) * 100)}% hoàn thành` : undefined}
        />
        <StatCard label="Sắp đăng (7 ngày)" value={next7.length} icon={Clock} tone="info" hint="Chưa đăng" />
        <StatCard label="Trễ lịch đăng" value={late.length} icon={AlertTriangle} tone={late.length ? "crit" : "muted"} hint={late.length ? "Ngày đăng đã qua, chưa tick đăng" : "Không có"} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <div className="flex rounded-lg bg-muted p-0.5 text-sm">
          <SegBtn active={view === "list"} onClick={() => setView("list")}>
            <ListIcon className="h-3.5 w-3.5" /> Danh sách
          </SegBtn>
          <SegBtn active={view === "calendar"} onClick={() => setView("calendar")}>
            <CalendarDays className="h-3.5 w-3.5" /> Lịch
          </SegBtn>
        </div>
        <ScopeChips
          param="scope"
          value={scope}
          defaultValue="recent"
          options={[
            { value: "recent", label: "Gần đây & chưa đăng", count: total },
            { value: "all", label: "Tất cả", count: allCount },
          ]}
        />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <FilterChips label="Brand" options={brandOptions} value={brandFilter} onChange={setBrandFilter} />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <FilterChips label="Kênh" options={channelOptions} value={channelFilter} onChange={setChannelFilter} />
        <div className="ml-auto flex gap-2">
          <Link href="/import?tab=t6" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Upload className="mr-1 h-4 w-4" /> Nhập plan tháng
          </Link>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
            <Plus className="mr-1 h-4 w-4" /> Content mới
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <DataGrid
          entity="content_items"
          columns={columns}
          rows={visible}
          getRowId={(r) => r.id}
          onEditCell={onEditCell}
          initialView={{ sorts: [{ field: "publishDate", direction: "asc" }], rowHeight: "medium" }}
          emptyText="Chưa có content nào — bấm “Content mới” hoặc nhập plan tháng từ file."
        />
      ) : (
        <ContentCalendarGrid
          items={visible.map((r) => ({
            id: r.id,
            brandId: r.brandIds[0],
            brandCode: r.brandIds.map(brandCode).join(" · "),
            primaryBrandCode: brandCode(r.brandIds[0]),
            channel: r.channels.join(", "),
            topic: r.topic,
            status: r.status,
            publishDate: r.publishDate,
            late: isLate(r, today),
          }))}
          brandColorIndex={brandColorIndex}
          onSelect={(id) => setDialog({ mode: "edit", id })}
        />
      )}

      <LoadMore shown={items.length} total={total} step={pageSize} />

      {dialog && (
        <ContentDialog
          key={dialog.mode === "edit" ? dialog.id : "create"}
          item={editing}
          onOpenChange={(o) => !o && setDialog(null)}
          brandOptions={brandOptions}
          channelOptions={channelOptions}
          campaigns={campaigns}
          sbus={sbus}
          users={users}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors", active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  );
}

/** Chip lọc nhanh nhiều lựa chọn (bấm để bật/tắt, không chọn gì = tất cả). */
function FilterChips({ label, options, value, onChange }: { label: string; options: TagOption[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-xs font-medium text-muted-foreground">{label}:</span>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn("rounded-full transition", on ? "ring-2 ring-brand ring-offset-1 ring-offset-card" : value.length ? "opacity-45 hover:opacity-100" : "opacity-90 hover:opacity-100")}
          >
            <Tag color={o.color}>{o.label}</Tag>
          </button>
        );
      })}
      {value.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Bỏ lọc ${label}`}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Dialog dùng chung cho TẠO và SỬA content (trước đây chỉ có tạo + xem nhanh không sửa được). */
function ContentDialog({
  item,
  onOpenChange,
  brandOptions,
  channelOptions,
  campaigns,
  sbus,
  users,
  onDone,
}: {
  item: ContentRow | null;
  onOpenChange: (o: boolean) => void;
  brandOptions: TagOption[];
  channelOptions: TagOption[];
  campaigns: Lite[];
  sbus: Lite[];
  users: Lite[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    brandIds: item?.brandIds ?? [],
    channels: item?.channels ?? [],
    publishDate: item?.publishDate ?? "",
    topic: item?.topic ?? "",
    ownerId: item?.ownerId ?? "",
    campaignId: item?.campaignId ?? "",
    sbuId: item?.sbuId ?? "",
    status: item?.status ?? "brief",
    postUrl: item?.postUrl ?? "",
    contentPillar: item?.contentPillar ?? "",
    format: item?.format ?? "",
    targetAudience: item?.targetAudience ?? "",
    keyMessage: item?.keyMessage ?? "",
    cta: item?.cta ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.brandIds.length > 0 && f.channels.length > 0 && !!f.publishDate && !!f.topic.trim();

  function submit() {
    start(async () => {
      const common = {
        brandIds: f.brandIds,
        channels: f.channels,
        publishDate: f.publishDate,
        topic: f.topic.trim(),
        ownerId: f.ownerId || null,
        campaignId: f.campaignId || null,
        sbuId: f.sbuId || null,
        contentPillar: f.contentPillar.trim() || null,
        format: f.format.trim() || null,
        targetAudience: f.targetAudience.trim() || null,
        keyMessage: f.keyMessage.trim() || null,
        cta: f.cta.trim() || null,
      };
      const res = item
        ? await updateContentItemAction(item.id, { ...common, status: f.status, postUrl: f.postUrl.trim() || null })
        : await createContentItemAction(common);
      if (res.ok) {
        toast.success(item ? "Đã lưu thay đổi." : "Đã tạo content + task quy trình.");
        onDone();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Sửa content" : "Content mới"}</DialogTitle>
          <DialogDescription>
            Một bài có thể gắn <b>nhiều brand</b> và đăng <b>nhiều kênh</b>. Tag đầu tiên (★) là brand/kênh chính — dùng để chọn quy trình duyệt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {item?.taskId && (
            <Link href={`/task/${item.taskId}`} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm hover:bg-muted">
              <CheckCircle2 className={cn("h-4 w-4", item.taskStatus === "done" ? "text-emerald-600" : "text-muted-foreground")} />
              <span>
                Task đăng bài <b className="font-mono">{item.taskCode}</b>
                {item.taskStatus === "done" ? " — đã xong" : ""} · tick “Đã đăng” và task luôn khớp nhau
              </span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          )}
          <F label="Chủ đề *">
            <Input value={f.topic} onChange={(e) => set("topic", e.target.value)} placeholder="VD: Khai giảng lớp IELTS tháng 11" autoFocus={!item} />
          </F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Brand *">
              <TagMultiSelect value={f.brandIds} onChange={(v) => set("brandIds", v)} options={brandOptions} placeholder="Chọn 1 hoặc nhiều brand" primaryHint="Brand chính" />
            </F>
            <F label="Kênh *">
              <TagMultiSelect value={f.channels} onChange={(v) => set("channels", v)} options={channelOptions} placeholder="Chọn 1 hoặc nhiều kênh" primaryHint="Kênh chính" />
            </F>
            <F label="Ngày đăng *">
              <DateInput value={f.publishDate} onChange={(v) => set("publishDate", v)} />
            </F>
            <F label="Người phụ trách">
              <SimpleSelect value={f.ownerId} onValueChange={(v) => set("ownerId", v ?? "")} placeholder="Chọn người" options={users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))} />
            </F>
            {item && (
              <>
                <F label="Trạng thái">
                  <SimpleSelect value={f.status} onValueChange={(v) => v && set("status", v)} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label: <Tag color={STATUS_COLORS[value]}>{label}</Tag> }))} />
                </F>
                <F label="Link bài đăng">
                  <Input value={f.postUrl} onChange={(e) => set("postUrl", e.target.value)} placeholder="https://…" />
                </F>
              </>
            )}
            <F label="Campaign">
              <SimpleSelect value={f.campaignId} onValueChange={(v) => set("campaignId", v ?? "")} options={[{ value: "", label: "— Không gắn —" }, ...campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]} />
            </F>
            <F label="SBU">
              <SimpleSelect value={f.sbuId} onValueChange={(v) => set("sbuId", v ?? "")} options={[{ value: "", label: "— Không gắn —" }, ...sbus.map((s) => ({ value: s.id, label: s.code ?? "" }))]} />
            </F>
          </div>

          <details className="group rounded-lg border bg-muted/30 px-3 py-2" open={!!(item && (item.contentPillar || item.format || item.keyMessage || item.cta || item.targetAudience))}>
            <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground group-open:mb-3">Chi tiết nội dung (tuỳ chọn)</summary>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Nhóm nội dung">
                <Input value={f.contentPillar} onChange={(e) => set("contentPillar", e.target.value)} />
              </F>
              <F label="Định dạng">
                <Input value={f.format} onChange={(e) => set("format", e.target.value)} placeholder="Ảnh đơn, carousel, video ngắn…" />
              </F>
              <F label="Đối tượng">
                <Input value={f.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} />
              </F>
              <F label="CTA">
                <Input value={f.cta} onChange={(e) => set("cta", e.target.value)} />
              </F>
              <div className="sm:col-span-2">
                <F label="Thông điệp chính">
                  <Textarea rows={2} value={f.keyMessage} onChange={(e) => set("keyMessage", e.target.value)} />
                </F>
              </div>
            </div>
          </details>

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button disabled={pending || !valid} onClick={submit}>
              {item ? "Lưu thay đổi" : "Tạo content"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
