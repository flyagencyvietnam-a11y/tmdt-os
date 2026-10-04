"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { FileInput } from "@/components/file-input";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { T7DeliverableRow, T7ShootRow } from "@/lib/services/import/t7-media";
import { confirmT7Action, uploadAndValidateT7 } from "./actions";

export function T7Wizard() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [preview, setPreview] = React.useState<{ batchId: string; shoots: T7ShootRow[]; deliverables: T7DeliverableRow[] } | null>(null);
  const [confirmed, setConfirmed] = React.useState<{ shootsCreated: number; shootsUpdated: number; deliverablesCreated: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadAndValidateT7(fd);
      if (res.ok) {
        setPreview(res.data);
        setConfirmed(null);
      } else toast.error(res.error);
    });
  }

  const shootErrors = preview?.shoots.filter((r) => r.result === "error").length ?? 0;
  const deliverableErrors = preview?.deliverables.filter((r) => r.result === "error").length ?? 0;
  const okCount = (preview?.shoots.filter((r) => r.result !== "error").length ?? 0) + (preview?.deliverables.filter((r) => r.result !== "error").length ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/import/template/t7" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Download className="mr-1 h-4 w-4" /> Tải template T7
        </a>
        <FileInput ref={fileRef} accept=".xlsx" />
        <Button size="sm" onClick={onUpload} disabled={pending}>
          <Upload className="mr-1 h-4 w-4" /> Tải lên &amp; kiểm tra
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">mỗi đợt quay tự sinh task chuẩn bị (-5 ngày làm việc) + task quay; mỗi deliverable sinh task hậu kỳ.</p>

      {preview && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex flex-wrap gap-2 text-sm">
              <span className="font-medium">SHOOTS</span>
              <Badge variant="outline" className={shootErrors ? "text-crit" : ""}>
                {shootErrors} lỗi
              </Badge>
            </div>
            <div className="max-h-60 overflow-auto rounded-xl border bg-card shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">Dòng</th>
                    <th className="px-2 py-1">shoot_code</th>
                    <th className="px-2 py-1">Kết quả</th>
                    <th className="px-2 py-1">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.shoots.map((r) => (
                    <tr key={r.rowNumber} className="border-b">
                      <td className="px-2 py-1 text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-2 py-1">{r.shootCode}</td>
                      <td className="px-2 py-1">
                        <span className={r.result === "error" ? "text-crit" : ""}>{r.result === "error" ? "Lỗi" : r.result === "updated" ? "Cập nhật" : "Mới"}</span>
                      </td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-1 flex flex-wrap gap-2 text-sm">
              <span className="font-medium">DELIVERABLES</span>
              <Badge variant="outline" className={deliverableErrors ? "text-crit" : ""}>
                {deliverableErrors} lỗi
              </Badge>
            </div>
            <div className="max-h-60 overflow-auto rounded-xl border bg-card shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">Dòng</th>
                    <th className="px-2 py-1">shoot_code</th>
                    <th className="px-2 py-1">Kết quả</th>
                    <th className="px-2 py-1">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.deliverables.map((r) => (
                    <tr key={r.rowNumber} className="border-b">
                      <td className="px-2 py-1 text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-2 py-1">{r.shootCode}</td>
                      <td className="px-2 py-1">
                        <span className={r.result === "error" ? "text-crit" : ""}>{r.result === "error" ? "Lỗi" : "Mới"}</span>
                      </td>
                      <td className="px-2 py-1 text-xs text-muted-foreground">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!confirmed ? (
            <Button
              disabled={pending || okCount === 0}
              onClick={() =>
                start(async () => {
                  const res = await confirmT7Action(preview.batchId);
                  if (res.ok) {
                    setConfirmed(res.data);
                    toast.success(`Đã ghi: ${res.data.shootsCreated} đợt quay mới, ${res.data.deliverablesCreated} deliverable.`);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Xác nhận ghi {okCount} dòng
            </Button>
          ) : (
            <Badge variant="secondary">
              Đã ghi: {confirmed.shootsCreated} đợt quay mới, {confirmed.shootsUpdated} cập nhật, {confirmed.deliverablesCreated} deliverable
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
