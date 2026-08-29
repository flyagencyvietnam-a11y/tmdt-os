"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate, fmtVnd } from "@/lib/format";
import { setEmsAction } from "./actions";

interface Row {
  enrollmentId: string;
  leadCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  productCode: string | null;
  contractDate: string;
  grossAmount: number;
  netAmount: number;
  collectedAmount: number;
  studentCount: number;
  creditedTo: string | null;
  emsStudentId: string | null;
  classAssigned: string | null;
  preferredSchedule: string | null;
}

const CSV_COLS: { key: keyof Row; header: string }[] = [
  { key: "leadCode", header: "Ma lead" },
  { key: "fullName", header: "Ho ten" },
  { key: "phone", header: "SDT" },
  { key: "email", header: "Email" },
  { key: "productCode", header: "San pham" },
  { key: "contractDate", header: "Ngay hop dong" },
  { key: "grossAmount", header: "Doanh thu gop" },
  { key: "netAmount", header: "Doanh thu rong" },
  { key: "collectedAmount", header: "Tien thuc thu" },
  { key: "studentCount", header: "So HVM" },
  { key: "creditedTo", header: "Nguoi chot" },
  { key: "classAssigned", header: "Xep lop" },
  { key: "preferredSchedule", header: "Lich ranh" },
  { key: "emsStudentId", header: "Ma HV EMS" },
];

export function HandoffTable({
  rows,
  onlyPending,
}: {
  rows: Row[];
  onlyPending: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = CSV_COLS.map((c) => esc(c.header)).join(",");
    const body = rows
      .map((r) => CSV_COLS.map((c) => esc(r[c.key])).join(","))
      .join("\n");
    const blob = new Blob([`﻿${head}\n${body}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ban-giao-ems-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border text-sm">
          <a
            href="/ban-giao"
            className={
              onlyPending ? "bg-brand/10 px-2.5 py-1 font-medium text-brand" : "px-2.5 py-1"
            }
          >
            Chưa bàn giao
          </a>
          <a
            href="/ban-giao?pending=0"
            className={
              !onlyPending
                ? "bg-brand/10 px-2.5 py-1 font-medium text-brand"
                : "px-2.5 py-1"
            }
          >
            Tất cả
          </a>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="mr-1 h-4 w-4" /> Xuất CSV ({rows.length})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Mã lead</th>
              <th className="px-3 py-2">Học viên</th>
              <th className="px-3 py-2">SP</th>
              <th className="px-3 py-2">Ngày HĐ</th>
              <th className="px-3 py-2 text-right">Doanh thu ròng</th>
              <th className="px-3 py-2">Người chốt</th>
              <th className="px-3 py-2">Mã HV EMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {onlyPending ? "Không còn học viên chờ bàn giao." : "Chưa có dữ liệu."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.enrollmentId} className="border-b">
                <td className="px-3 py-1.5 font-mono text-xs">{r.leadCode}</td>
                <td className="px-3 py-1.5">
                  {r.fullName}
                  {r.phone ? (
                    <span className="ml-1 text-xs text-muted-foreground">{r.phone}</span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5">
                  <Badge variant="secondary">{r.productCode}</Badge>
                </td>
                <td className="px-3 py-1.5">{fmtDate(r.contractDate)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtVnd(r.netAmount)}
                </td>
                <td className="px-3 py-1.5 text-xs">{r.creditedTo ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <EmsInput
                    enrollmentId={r.enrollmentId}
                    value={r.emsStudentId}
                    disabled={pending}
                    onSaved={() => router.refresh()}
                    start={start}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmsInput({
  enrollmentId,
  value,
  disabled,
  onSaved,
  start,
}: {
  enrollmentId: string;
  value: string | null;
  disabled: boolean;
  onSaved: () => void;
  start: React.TransitionStartFunction;
}) {
  const [v, setV] = React.useState(value ?? "");
  return (
    <span className="flex items-center gap-1">
      <Input
        className="h-7 w-32"
        value={v}
        placeholder="mã EMS"
        onChange={(e) => setV(e.target.value)}
      />
      {v !== (value ?? "") && (
        <Button
          size="sm"
          className="h-7"
          disabled={disabled}
          onClick={() =>
            start(async () => {
              const r = await setEmsAction(enrollmentId, v);
              if (r.ok) {
                toast.success("Đã lưu mã EMS.");
                onSaved();
              } else toast.error(r.error);
            })
          }
        >
          Lưu
        </Button>
      )}
    </span>
  );
}
