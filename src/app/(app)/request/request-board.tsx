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
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/format";
import { acceptRequestAction, createRequestAction, updateRequestStatusAction } from "./actions";

interface RequestItem {
  id: string;
  code: string;
  receivedDate: string;
  requesterName: string;
  requesterSbuId: string | null;
  requestType: string;
  description: string;
  status: string;
  committedDate: string | null;
  desiredDate: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  design: "Thiết kế",
  ads: "Ads",
  content: "Content",
  media: "Quay chụp",
  posm: "POSM",
  event: "Sự kiện",
  consulting: "Tư vấn",
  other: "Khác",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  accepted: "Đã nhận",
  in_progress: "Đang xử lý",
  in_review: "Chờ duyệt",
  done: "Xong",
  rejected: "Từ chối",
  postponed: "Hoãn",
};

export function RequestBoard({
  requests,
  sbus,
  canManage,
}: {
  requests: RequestItem[];
  sbus: { id: string; code: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Request mới
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Người yêu cầu</th>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Mô tả</th>
              <th className="px-3 py-2">Hạn cam kết</th>
              <th className="px-3 py-2">Trạng thái</th>
              {canManage && <th className="px-3 py-2 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <RequestRow key={r.id} r={r} canManage={canManage} pending={pending} start={start} router={router} />
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có request.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateRequestDialog open={open} onOpenChange={setOpen} sbus={sbus} onDone={() => { setOpen(false); router.refresh(); }} />
    </div>
  );
}

function RequestRow({
  r,
  canManage,
  pending,
  start,
  router,
}: {
  r: RequestItem;
  canManage: boolean;
  pending: boolean;
  start: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
}) {
  const [committedDate, setCommittedDate] = React.useState(r.desiredDate ?? "");
  return (
    <tr className="border-b align-top hover:bg-muted/20">
      <td className="px-3 py-2 text-xs text-muted-foreground">{r.code}</td>
      <td className="px-3 py-2">{r.requesterName}</td>
      <td className="px-3 py-2">{TYPE_LABEL[r.requestType] ?? r.requestType}</td>
      <td className="max-w-xs px-3 py-2 truncate" title={r.description}>{r.description}</td>
      <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.committedDate)}</td>
      <td className="px-3 py-2">
        <Badge variant="secondary">{STATUS_LABEL[r.status] ?? r.status}</Badge>
      </td>
      {canManage && (
        <td className="px-3 py-2">
          <div className="flex flex-col items-end gap-1">
            {r.status === "new" && (
              <div className="flex items-center gap-1">
                <Input type="date" className="h-7 w-32 text-xs" value={committedDate} onChange={(e) => setCommittedDate(e.target.value)} />
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await acceptRequestAction(r.id, committedDate);
                      if (res.ok) router.refresh();
                      else toast.error(res.error);
                    })
                  }
                >
                  Nhận
                </Button>
              </div>
            )}
            {["accepted", "in_progress", "in_review"].includes(r.status) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await updateRequestStatusAction(r.id, "done");
                    if (res.ok) router.refresh();
                    else toast.error(res.error);
                  })
                }
              >
                Đánh dấu xong
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function CreateRequestDialog({
  open,
  onOpenChange,
  sbus,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sbus: { id: string; code: string; name: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    requesterName: "",
    requesterSbuId: "",
    requestType: "other",
    description: "",
    desiredDate: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Fld label="Người yêu cầu">
            <Input value={f.requesterName} onChange={(e) => set("requesterName", e.target.value)} />
          </Fld>
          <Fld label="Trung tâm">
            <SimpleSelect
              value={f.requesterSbuId}
              onValueChange={(v) => set("requesterSbuId", v ?? "")}
              options={[{ value: "", label: "— Không thuộc trung tâm —" }, ...sbus.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))]}
            />
          </Fld>
          <Fld label="Loại yêu cầu">
            <SimpleSelect value={f.requestType} onValueChange={(v) => v && set("requestType", v)} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          </Fld>
          <Fld label="Mô tả">
            <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </Fld>
          <Fld label="Ngày mong muốn">
            <Input type="date" value={f.desiredDate} onChange={(e) => set("desiredDate", e.target.value)} />
          </Fld>
          <p className="text-xs text-muted-foreground">
            Không nhập thông tin cá nhân học viên/phụ huynh (SPEC Mục 1.3).
          </p>
          <Button
            className="w-full"
            disabled={pending || !f.requesterName.trim() || !f.description.trim()}
            onClick={() =>
              start(async () => {
                const res = await createRequestAction({
                  receivedDate: new Date().toISOString().slice(0, 10),
                  requesterName: f.requesterName,
                  requesterSbuId: f.requesterSbuId || null,
                  requestType: f.requestType as never,
                  description: f.description,
                  desiredDate: f.desiredDate || null,
                });
                if (res.ok) {
                  toast.success("Đã gửi request.");
                  onDone();
                } else toast.error(res.error);
              })
            }
          >
            Gửi request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
