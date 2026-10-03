"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { fmtDate } from "@/lib/format";
import { createCampaignAction } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  brand_theme: "Brand Theme",
  product_gtm: "GTM sản phẩm",
  business_program: "Chương trình kinh doanh",
  rebrand: "Rebrand",
  data_program: "Dữ liệu",
  internal_program: "Nội bộ",
  other: "Khác",
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

export function CampaignList({
  campaigns,
  canEdit,
}: {
  campaigns: { id: string; code: string; name: string; type: string; startDate: string; endDate: string; status: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({ code: "", name: "", type: "other", startDate: "", endDate: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Campaign mới
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Thời gian</th>
              <th className="px-3 py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 text-xs text-muted-foreground">{c.code}</td>
                <td className="px-3 py-2">
                  <a href={`/campaign/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </a>
                </td>
                <td className="px-3 py-2">{TYPE_LABEL[c.type] ?? c.type}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={c.status === "needs_confirmation" ? "outline" : "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có campaign. Nạp qua template T1 hoặc tạo thủ công.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
            <Fld label="Loại">
              <SimpleSelect
                value={f.type}
                onValueChange={(v) => v && set("type", v)}
                options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Fld>
            <div className="grid grid-cols-2 gap-2">
              <Fld label="Bắt đầu">
                <Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Fld>
              <Fld label="Kết thúc">
                <Input type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </Fld>
            </div>
            <Button
              className="w-full"
              disabled={pending || !f.code.trim() || !f.name.trim() || !f.startDate || !f.endDate}
              onClick={() =>
                start(async () => {
                  const res = await createCampaignAction(f as never);
                  if (res.ok) {
                    toast.success("Đã tạo campaign.");
                    setOpen(false);
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

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
