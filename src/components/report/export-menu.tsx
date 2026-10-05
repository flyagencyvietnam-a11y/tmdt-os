"use client";

import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReportKind } from "@/lib/reports/types";

/**
 * Nút "Xuất báo cáo" dùng chung cho SBU, Brand Performance, Growth Performance, Báo cáo:
 * Excel (.xlsx, có logo + bảng định dạng) hoặc PDF (mở trang báo cáo A4 → Lưu dưới dạng PDF).
 */
export function ExportMenu({ kind, period, label = "Xuất báo cáo" }: { kind: ReportKind; period?: string; label?: string }) {
  const q = period ? `&period=${period}` : "";
  const qPdf = period ? `?period=${period}&auto=1` : "?auto=1";
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <FileDown className="mr-1 h-4 w-4" /> {label}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <a href={`/api/export/report?kind=${kind}${q}`} className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-muted">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            <span className="block text-sm font-medium">Excel (.xlsx)</span>
            <span className="block text-xs text-muted-foreground">Bìa + mục lục + mỗi bảng 1 sheet, có logo, tô màu, bộ lọc</span>
          </span>
        </a>
        <a href={`/in-bao-cao/${kind}${qPdf}`} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-muted">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            <span className="block text-sm font-medium">PDF</span>
            <span className="block text-xs text-muted-foreground">Báo cáo A4 có logo, thẻ KPI, bảng & biểu đồ — chọn “Lưu dưới dạng PDF”</span>
          </span>
        </a>
      </PopoverContent>
    </Popover>
  );
}
