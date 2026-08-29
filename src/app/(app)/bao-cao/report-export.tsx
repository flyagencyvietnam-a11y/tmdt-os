"use client";

import { Download } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ReportExport({
  filename,
  sheets,
}: {
  filename: string;
  sheets: {
    name: string;
    columns: { header: string; key: string }[];
    rows: Record<string, unknown>[];
  }[];
}) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const res = await fetch("/api/export", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ filename, entity: "REPORT", sheets }),
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${filename}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
          } catch {
            toast.error("Xuất báo cáo thất bại.");
          }
        })
      }
    >
      <Download className="mr-1 h-4 w-4" /> Xuất XLSX
    </Button>
  );
}
