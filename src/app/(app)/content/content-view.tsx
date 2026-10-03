"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { createContentItemAction, updateContentItemAction } from "./actions";

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
const STATUS_COLORS: Record<string, TagColor> = {
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

  const brandName = React.useCallback((id: string) => brands.find((b) => b.id === id)?.code ?? "", [brands]);
  const userName = React.useCallback((id: string | null) => users.find((u) => u.id === id)?.fullName ?? "", [users]);

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      let patch: Record<string, unknown> | null = null;
      if (field === "status") patch = { status: raw };
      else if (field === "postUrl") patch = { postUrl: raw || null };
      else if (field === "ownerId") patch = { ownerId: raw || null };
      else return;
      const res = await updateContentItemAction(rowId, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error);
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
        cell: (r) => fmtDate(r.publishDate),
        defaultWidth: 110,
      },
      { field: "brandId", header: "Brand", kind: "enum", accessor: (r) => r.brandId, cell: (r) => brandName(r.brandId), enumOptions: brands.map((b) => ({ value: b.id, label: b.code ?? "" })), defaultWidth: 100 },
      { field: "channel", header: "Kênh", kind: "text", accessor: (r) => r.channel, defaultWidth: 110 },
      { field: "contentPillar", header: "Nhóm nội dung", kind: "text", accessor: (r) => r.contentPillar ?? "", defaultWidth: 130 },
      {
        field: "topic",
        header: "Chủ đề",
        kind: "text",
        accessor: (r) => r.topic,
        defaultWidth: 260,
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
        defaultWidth: 160,
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
        field: "postUrl",
        header: "Link bài đăng",
        kind: "text",
        accessor: (r) => r.postUrl ?? "",
        editable: true,
        cell: (r) => (r.postUrl ? <a href={r.postUrl} target="_blank" rel="noreferrer" className="hover:underline">Xem</a> : <span className="text-muted-foreground">—</span>),
        defaultWidth: 110,
      },
    ],
    [brands, users, brandName, userName],
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Content mới
        </Button>
      </div>
      <DataGrid
        entity="content_items"
        columns={columns}
        rows={items}
        getRowId={(r) => r.id}
        onEditCell={onEditCell}
        initialView={{ sorts: [{ field: "publishDate", direction: "asc" }] }}
        emptyText="Chưa có content nào."
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
    channel: "",
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
              <Input value={f.channel} onChange={(e) => set("channel", e.target.value)} placeholder="Fanpage, TikTok..." />
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
