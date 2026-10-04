"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EFFECTIVENESS_TONE, monthLabel } from "./shared";
import { quarterLabel } from "./rollups";

/** Các mảnh UI nhỏ dùng chung giữa các tab Ads (tránh import vòng giữa các view). */

export function MonthPicker({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  const sorted = [...new Set([...months, value])].sort().reverse();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border bg-background px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-label="Chọn tháng"
    >
      {sorted.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  );
}

export function QuarterPicker({ quarters, value, onChange }: { quarters: string[]; value: string; onChange: (q: string) => void }) {
  const sorted = [...new Set([...quarters, value])].sort().reverse();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border bg-background px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      aria-label="Chọn quý"
    >
      {sorted.map((q) => (
        <option key={q} value={q}>
          {quarterLabel(q)}
        </option>
      ))}
    </select>
  );
}

export function EffBadge({ label }: { label: string }) {
  const tone = EFFECTIVENESS_TONE[label] ?? EFFECTIVENESS_TONE["Chưa đủ dữ liệu"];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {label}
    </span>
  );
}

export function Preview({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}
