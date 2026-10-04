"use client";

import * as React from "react";
import type { TooltipContentProps } from "recharts";
import { cn } from "@/lib/utils";

/** Khung thẻ biểu đồ: tiêu đề + mô tả + chú giải 1 hàng phía trên. */
export function ChartCard({
  title,
  description,
  legend,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  legend?: { label: string; color: string; dashed?: boolean }[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card p-4 shadow-xs", className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {legend && legend.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              {l.dashed ? (
                <span className="h-0.5 w-3.5 rounded-full" style={{ background: `repeating-linear-gradient(90deg, ${l.color} 0 4px, transparent 4px 6px)` }} />
              ) : (
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: l.color }} />
              )}
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Thuộc tính trục dùng chung — trục/lưới "lùi" về sau, chữ màu muted. */
export const axisProps = {
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  tickLine: false,
  axisLine: false,
} as const;
export const gridProps = { stroke: "var(--border)", strokeDasharray: "0", vertical: false } as const;

/**
 * Tooltip HTML: tiêu đề kỳ + từng series (chấm màu nhận diện + giá trị chữ màu
 * thường — màu series không dùng cho chữ).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  fmtValue,
  fmtLabel,
}: Partial<TooltipContentProps<number, string>> & {
  fmtValue?: (value: number, name: string) => string;
  fmtLabel?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-semibold">{fmtLabel ? fmtLabel(String(label)) : String(label)}</div>
      <div className="space-y-1">
        {payload
          .filter((p) => p.value != null)
          .map((p) => (
            <div key={String(p.dataKey)} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} />
              <span className="text-muted-foreground">{p.name}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">{fmtValue ? fmtValue(Number(p.value), String(p.name)) : Number(p.value).toLocaleString("vi-VN")}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/** Sparkline SVG nhỏ cho ô bảng (xu hướng nhiều kỳ). Bỏ qua điểm null. */
export function Sparkline({ values, color = "var(--series-1)", width = 84, height = 24 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / Math.max(values.length - 1, 1)) * (width - 4);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.5} fill={color} stroke="var(--card)" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Nền ô bảng nhiệt: 1 hue (xanh), đậm dần theo độ lớn trong CÙNG hàng/cột.
 * `invert` = giá trị cao là XẤU (CPL/CAC) → dùng hue đỏ.
 */
export function heatStyle(value: number | null, min: number, max: number, invert = false): React.CSSProperties | undefined {
  if (value == null || max <= min) return undefined;
  const t = (value - min) / (max - min);
  const alpha = 0.06 + t * 0.32;
  return { backgroundColor: invert ? `rgba(227, 73, 72, ${alpha})` : `rgba(42, 120, 214, ${alpha})` };
}
