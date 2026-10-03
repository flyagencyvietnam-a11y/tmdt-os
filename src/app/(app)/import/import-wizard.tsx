"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { T3ValidatedRow } from "@/lib/services/import/t3-tasks";
import { confirmT3Action, undoT3Action, uploadAndValidateT3 } from "./actions";

const RESULT_LABEL: Record<string, string> = {
  created: "Sẽ tạo mới",
  updated: "Sẽ cập nhật",
  conflict: "Xung đột — giữ bản hệ thống",
  error: "Lỗi",
  skipped: "Bỏ qua",
};

export function ImportWizard() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [preview, setPreview] = React.useState<{ batchId: string; rows: T3ValidatedRow[] } | null>(null);
  const [confirmed, setConfirmed] = React.useState<{ created: number; updated: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadAndValidateT3(fd);
      if (res.ok) {
        setPreview(res.data);
        setConfirmed(null);
      } else toast.error(res.error);
    });
  }

  const errorCount = preview?.rows.filter((r) => r.result === "error").length ?? 0;
  const okCount = preview?.rows.filter((r) => r.result === "created" || r.result === "updated").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/import/template/t3" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Download className="mr-1 h-4 w-4" /> Tải template T3
        </a>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="text-sm" />
        <Button size="sm" onClick={onUpload} disabled={pending}>
          <Upload className="mr-1 h-4 w-4" /> Tải lên &amp; kiểm tra
        </Button>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{okCount} dòng sẽ ghi</Badge>
            <Badge variant="outline" className={errorCount ? "text-crit" : ""}>
              {errorCount} dòng lỗi
            </Badge>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Dòng</th>
                  <th className="px-2 py-1">task_key</th>
                  <th className="px-2 py-1">Tiêu đề</th>
                  <th className="px-2 py-1">Kết quả</th>
                  <th className="px-2 py-1">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className="border-b">
                    <td className="px-2 py-1 text-muted-foreground">{r.rowNumber}</td>
                    <td className="px-2 py-1">{r.taskKey}</td>
                    <td className="px-2 py-1">{r.title}</td>
                    <td className="px-2 py-1">
                      <span className={r.result === "error" ? "text-crit" : r.result === "conflict" ? "text-warn" : ""}>
                        {RESULT_LABEL[r.result]}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-xs text-muted-foreground">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!confirmed ? (
            <Button
              disabled={pending || okCount === 0}
              onClick={() =>
                start(async () => {
                  const res = await confirmT3Action(preview.batchId);
                  if (res.ok) {
                    setConfirmed(res.data);
                    toast.success(`Đã ghi: ${res.data.created} mới, ${res.data.updated} cập nhật.`);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Xác nhận ghi {okCount} dòng
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Đã ghi: {confirmed.created} mới, {confirmed.updated} cập nhật
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await undoT3Action(preview.batchId);
                    if (res.ok) {
                      toast.success(`Đã hoàn tác ${res.data.undone} task.`);
                      setPreview(null);
                      setConfirmed(null);
                      router.refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                Hoàn tác đợt này (còn hiệu lực 72h)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
