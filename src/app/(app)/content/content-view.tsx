"use client";

import { CalendarDays, List as ListIcon, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { Tag } from "@/components/data-grid/tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { createContentItemAction, updateContentItemAction } from "./actions";
import { CHANNEL_OPTIONS, colorForBrand, colorForChannel } from "./content-colors";
import { ContentCalendarGrid } from "./content-calendar-grid";

interface ContentRow {
  id: string;
  brandId: string;
  campaignId: string | null;
  sbuId: string | null;
  publishDate: string;
  channel: string;
  topic: string;
  ownerId: string | null;
  status: string;
  postUrl: string | null;
  contentPillar: string | null;
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
const STATUS_COLORS: Record<string, import("@/components/data-grid/tag").TagColor> = {
  brief: "slate",
  drafting: "blue",
  designing: "violet",
  in_review: "amber",
  approved: "teal",
  published: "emerald",
  cancelled: "gray",
};

export function ContentCalendarView({
  items,
  brands,
  campaigns,
  sbus,
  users,
}: {
  items: ContentRow[];
  brands: Lite[];
  campaigns: Lite[];
  sbus: Lite[];
  users: Lite[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [view, setView] = React.useState<"list" | "calendar">("list");
  const [brandFilter, setBrandFilter] = React.useState<string>("all");
  const [quickViewId, setQuickViewId] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const brandCode = React.useCallback((id: string) => brands.find((b) => b.id === id)?.code ?? "", [brands]);
  const userName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);
  // Vị trí brand trong danh sách — dùng làm fallback index khi brand chưa có màu cố định (content-colors.ts).
  const brandColorIndex = React.useMemo(() => Object.fromEntries(brands.map((b, i) => [b.id, i])), [brands]);

  const visible = brandFilter === "all" ? items : items.filter((i) => i.brandId === brandFilter);

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      let patch: Record<string, unknown> | null = null;
      if (field === "status") patch = { status: raw };
      else if (field === "channel") patch = { channel: raw };
      else if (field === "postUrl") patch = { postUrl: raw || null };
      else if (field === "ownerId") patch = { ownerId: raw || null };
      else return;
      const res = await updateContentItemAction(rowId, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  function togglePublished(row: ContentRow, checked: boolean) {
    start(async () => {
      const res = await updateContentItemAction(row.id, { status: checked ? "published" : "approved" });
      if (res.ok) {
        toast.success(checked ? "Đã tick đăng." : "Đã bỏ tick đăng.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const columns: GridColumn<ContentRow>[] = React.useMemo(
    () => [
      {
        field: "publishDate",
        header: "Ngày đăng",
        kind: "date",
        accessor: (r) => r.publishDate,
        cell: (r) => fmtDate(r.publishDate),
        defaultWidth: 110,
      },
      {
        field: "brandId",
        header: "Brand",
        kind: "enum",
        accessor: (r) => r.brandId,
        cell: (r) => <Tag color={colorForBrand(brandCode(r.brandId), brandColorIndex[r.brandId] ?? 0)}>{brandCode(r.brandId)}</Tag>,
        enumOptions: brands.map((b) => ({ value: b.id, label: b.code ?? "" })),
        defaultWidth: 110,
      },
      {
        field: "channel",
        header: "Kênh",
        kind: "enum",
        accessor: (r) => r.channel,
        cell: (r) => <Tag color={colorForChannel(r.channel)}>{r.channel}</Tag>,
        enumOptions: CHANNEL_OPTIONS.map((c) => ({ value: c, label: c })),
        editable: true,
        editKind: "select",
        editOptions: CHANNEL_OPTIONS.map((c) => ({ value: c, label: c })),
        editValue: (r) => r.channel,
        defaultWidth: 110,
      },
      { field: "contentPillar", header: "Nhóm nội dung", kind: "text", accessor: (r) => r.contentPillar ?? "", defaultWidth: 130 },
      {
        field: "topic",
        header: "Chủ đề",
        kind: "text",
        accessor: (r) => r.topic,
        defaultWidth: 240,
        groupable: false,
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
        defaultWidth: 120,
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
        field: "postUrl",
        header: "Link bài đăng",
        kind: "text",
        accessor: (r) => r.postUrl ?? "",
        editable: true,
        cell: (r) => (r.postUrl ? <a href={r.postUrl} target="_blank" rel="noreferrer" className="hover:underline">Xem</a> : <span className="text-muted-foreground">—</span>),
        defaultWidth: 110,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brands, users, brandCode, userName, brandColorIndex, pending],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border text-sm">
          <button className={cn("flex items-center gap-1 px-2.5 py-1", view === "list" && "bg-brand/10 font-medium text-brand")} onClick={() => setView("list")}>
            <ListIcon className="h-3.5 w-3.5" /> Danh sách
          </button>
          <button className={cn("flex items-center gap-1 px-2.5 py-1", view === "calendar" && "bg-brand/10 font-medium text-brand")} onClick={() => setView("calendar")}>
            <CalendarDays className="h-3.5 w-3.5" /> Lịch
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            className={cn("rounded-full px-2.5 py-1", brandFilter === "all" ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-muted")}
            onClick={() => setBrandFilter("all")}
          >
            Tất cả
          </button>
          {brands.map((b, i) => (
            <button
              key={b.id}
              className={cn("rounded-full", brandFilter === b.id ? "ring-2 ring-offset-1 ring-brand" : "opacity-70 hover:opacity-100")}
              onClick={() => setBrandFilter((prev) => (prev === b.id ? "all" : b.id))}
            >
              <Tag color={colorForBrand(b.code ?? "", i)}>{b.code}</Tag>
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Link href="/import?tab=t6" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Upload className="mr-1 h-4 w-4" /> Nhập plan tháng
          </Link>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
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
          initialView={{ sorts: [{ field: "publishDate", direction: "asc" }] }}
          emptyText="Chưa có content nào."
        />
      ) : (
        <ContentCalendarGrid
          items={visible.map((r) => ({ id: r.id, brandId: r.brandId, brandCode: brandCode(r.brandId), channel: r.channel, topic: r.topic, status: r.status, publishDate: r.publishDate }))}
          brandColorIndex={brandColorIndex}
          onSelect={(id) => setQuickViewId(id)}
        />
      )}

      <QuickViewDialog
        item={items.find((i) => i.id === quickViewId) ?? null}
        onOpenChange={(o) => !o && setQuickViewId(null)}
        brandCode={brandCode}
        userName={userName}
        pending={pending}
        onTogglePublished={togglePublished}
      />

      <CreateContentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        brands={brands}
        campaigns={campaigns}
        sbus={sbus}
        users={users}
        onDone={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateContentDialog({
  open,
  onOpenChange,
  brands,
  campaigns,
  sbus,
  users,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brands: Lite[];
  campaigns: Lite[];
  sbus: Lite[];
  users: Lite[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    brandId: brands[0]?.id ?? "",
    campaignId: "",
    sbuId: "",
    publishDate: "",
    channel: CHANNEL_OPTIONS[0] as string,
    topic: "",
    ownerId: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Content mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <F label="Brand">
              <SimpleSelect value={f.brandId} onValueChange={(v) => v && set("brandId", v)} options={brands.map((b) => ({ value: b.id, label: b.code ?? "" }))} />
            </F>
            <F label="Ngày đăng">
              <Input type="date" value={f.publishDate} onChange={(e) => set("publishDate", e.target.value)} />
            </F>
            <F label="Kênh">
              <SimpleSelect value={f.channel} onValueChange={(v) => v && set("channel", v)} options={CHANNEL_OPTIONS.map((c) => ({ value: c, label: c }))} />
            </F>
            <F label="Người phụ trách">
              <SimpleSelect value={f.ownerId} onValueChange={(v) => set("ownerId", v ?? "")} options={users.map((u) => ({ value: u.id, label: u.fullName ?? "" }))} />
            </F>
            <F label="Campaign (tuỳ chọn)">
              <SimpleSelect value={f.campaignId} onValueChange={(v) => set("campaignId", v ?? "")} options={[{ value: "", label: "—" }, ...campaigns.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]} />
            </F>
            <F label="SBU (tuỳ chọn)">
              <SimpleSelect value={f.sbuId} onValueChange={(v) => set("sbuId", v ?? "")} options={[{ value: "", label: "—" }, ...sbus.map((s) => ({ value: s.id, label: s.code ?? "" }))]} />
            </F>
          </div>
          <F label="Chủ đề">
            <Input value={f.topic} onChange={(e) => set("topic", e.target.value)} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.brandId || !f.publishDate || !f.channel.trim() || !f.topic.trim()}
            onClick={() =>
              start(async () => {
                const res = await createContentItemAction({
                  brandId: f.brandId,
                  campaignId: f.campaignId || null,
                  sbuId: f.sbuId || null,
                  publishDate: f.publishDate,
                  channel: f.channel.trim(),
                  topic: f.topic.trim(),
                  ownerId: f.ownerId || null,
                });
                if (res.ok) {
                  toast.success("Đã tạo content + task.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Tạo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickViewDialog({
  item,
  onOpenChange,
  brandCode,
  userName,
  pending,
  onTogglePublished,
}: {
  item: ContentRow | null;
  onOpenChange: (o: boolean) => void;
  brandCode: (id: string) => string;
  userName: (id: string | null) => string;
  pending: boolean;
  onTogglePublished: (row: ContentRow, checked: boolean) => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item?.topic}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={colorForBrand(brandCode(item.brandId))}>{brandCode(item.brandId)}</Tag>
              <Tag color={colorForChannel(item.channel)}>{item.channel}</Tag>
              <Tag color={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status] ?? item.status}</Tag>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>
                Ngày đăng: <span className="text-foreground">{fmtDate(item.publishDate)}</span>
              </div>
              <div>
                Người phụ trách: <span className="text-foreground">{userName(item.ownerId) || "—"}</span>
              </div>
            </div>
            {item.postUrl && (
              <a href={item.postUrl} target="_blank" rel="noreferrer" className="block text-brand hover:underline">
                Xem bài đã đăng →
              </a>
            )}
            <label className="flex items-center gap-2">
              <Checkbox checked={item.status === "published"} disabled={pending || item.status === "cancelled"} onCheckedChange={(v) => onTogglePublished(item, !!v)} />
              Đã đăng
            </label>
          </div>
        )}
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
