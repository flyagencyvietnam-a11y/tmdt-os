"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { T1ActionRow, T1CampaignRow } from "@/lib/services/import/t1-campaign-plan";
import { confirmT1Action, undoT1Action, uploadAndValidateT1 } from "./actions";

const RESULT_LABEL: Record<string, string> = {
  created: "Sẽ tạo mới",
  updated: "Sẽ cập nhật",
  conflict: "Xung đột — giữ bản hệ thống",
  error: "Lỗi",
};

export function T1Wizard() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [preview, setPreview] = React.useState<{ batchId: string; campaigns: T1CampaignRow[]; actions: T1ActionRow[] } | null>(null);
  const [confirmed, setConfirmed] = React.useState<{ campaignsCreated: number; campaignsUpdated: number; actionsCreated: number; actionsUpdated: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadAndValidateT1(fd);
      if (res.ok) {
        setPreview(res.data);
        setConfirmed(null);
      } else toast.error(res.error);
    });
  }

  const campaignErrors = preview?.campaigns.filter((c) => c.result === "error").length ?? 0;
  const actionErrors = preview?.actions.filter((a) => a.result === "error").length ?? 0;
  const okActions = preview?.actions.filter((a) => a.result === "created" || a.result === "updated").length ?? 0;
  const canConfirm = !!preview && campaignErrors === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/import/template/t1" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Download className="mr-1 h-4 w-4" /> Tải template T1
        </a>
        <input ref={fileRef} type="file" accept=".xlsx" className="text-sm" />
        <Button size="sm" onClick={onUpload} disabled={pending}>
          <Upload className="mr-1 h-4 w-4" /> Tải lên &amp; kiểm tra
        </Button>
      </div>

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{preview.campaigns.length} campaign</Badge>
            <Badge variant="outline" className={campaignErrors ? "text-crit" : ""}>
              {campaignErrors} campaign lỗi
            </Badge>
            <Badge variant="secondary">{okActions} action sẽ ghi</Badge>
            <Badge variant="outline" className={actionErrors ? "text-crit" : ""}>
              {actionErrors} action lỗi
            </Badge>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Sheet CAMPAIGN</div>
            <div className="max-h-48 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">Dòng</th>
                    <th className="px-2 py-1">campaign_code</th>
                    <th className="px-2 py-1">Kết quả</th>
                    <th className="px-2 py-1">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.campaigns.map((c) => (
                    <tr key={c.rowNumber} className="border-b">
                      <td className="px-2 py-1 text-muted-foreground">{c.rowNumber}</td>
                      <td className="px-2 py-1">{c.campaignCode}</td>
                      <td className="px-2 py-1">
                        <span className={c.result === "error" ? "text-crit" : ""}>{RESULT_LABEL[c.result]}</span>
                      </td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{c.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Sheet ACTIONS</div>
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">Dòng</th>
                    <th className="px-2 py-1">action_code</th>
                    <th className="px-2 py-1">Tiêu đề</th>
                    <th className="px-2 py-1">Kết quả</th>
                    <th className="px-2 py-1">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.actions.map((a) => (
                    <tr key={a.rowNumber} className="border-b">
                      <td className="px-2 py-1 text-muted-foreground">{a.rowNumber}</td>
                      <td className="px-2 py-1">{a.actionCode}</td>
                      <td className="px-2 py-1">{a.title}</td>
                      <td className="px-2 py-1">
                        <span className={a.result === "error" ? "text-crit" : a.result === "conflict" ? "text-warn" : ""}>{RESULT_LABEL[a.result]}</span>
                      </td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{a.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!confirmed ? (
            <Button
              disabled={pending || !canConfirm}
              onClick={() =>
                start(async () => {
                  const res = await confirmT1Action(preview.batchId);
                  if (res.ok) {
                    setConfirmed(res.data);
                    toast.success(
                      `Đã ghi: ${res.data.campaignsCreated} campaign mới, ${res.data.actionsCreated} action mới.`,
                    );
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Xác nhận ghi
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Campaign: {confirmed.campaignsCreated} mới / {confirmed.campaignsUpdated} cập nhật · Action:{" "}
                {confirmed.actionsCreated} mới / {confirmed.actionsUpdated} cập nhật
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await undoT1Action(preview.batchId);
                    if (res.ok) {
                      toast.success(`Đã hoàn tác ${res.data.undone} task (campaign giữ nguyên).`);
                      setPreview(null);
                      setConfirmed(null);
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                Hoàn tác task đã tạo (còn hiệu lực 72h)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
