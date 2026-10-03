"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { T8Row } from "@/lib/services/import/t8-foundation";
import { confirmT8Action, uploadAndValidateT8 } from "./actions";

export function T8Wizard() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [preview, setPreview] = React.useState<{ batchId: string; rows: T8Row[] } | null>(null);
  const [confirmed, setConfirmed] = React.useState<{ count: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadAndValidateT8(fd);
      if (res.ok) {
        setPreview(res.data);
        setConfirmed(null);
      } else toast.error(res.error);
    });
  }

  const errorCount = preview?.rows.filter((r) => r.result === "error").length ?? 0;
  const okCount = preview?.rows.filter((r) => r.result !== "error").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/import/template/t8" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Download className="mr-1 h-4 w-4" /> Tải template T8
        </a>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="text-sm" />
        <Button size="sm" onClick={onUpload} disabled={pending}>
          <Upload className="mr-1 h-4 w-4" /> Tải lên &amp; kiểm tra
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">SPEC Mục 9.2 — khoá tự nhiên brand_code+component_code; nạp lại ghi đè kèm lưu lịch sử.</p>

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
                  <th className="px-2 py-1">brand+component</th>
                  <th className="px-2 py-1">Kết quả</th>
                  <th className="px-2 py-1">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className="border-b">
                    <td className="px-2 py-1 text-muted-foreground">{r.rowNumber}</td>
                    <td className="px-2 py-1">{r.key}</td>
                    <td className="px-2 py-1">
                      <span className={r.result === "error" ? "text-crit" : ""}>{r.result === "error" ? "Lỗi" : "Sẽ ghi"}</span>
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
                  const res = await confirmT8Action(preview.batchId);
                  if (res.ok) {
                    setConfirmed(res.data);
                    toast.success(`Đã ghi ${res.data.count} ô.`);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Xác nhận ghi {okCount} dòng
            </Button>
          ) : (
            <Badge variant="secondary">Đã ghi {confirmed.count} ô</Badge>
          )}
        </div>
      )}
    </div>
  );
}
