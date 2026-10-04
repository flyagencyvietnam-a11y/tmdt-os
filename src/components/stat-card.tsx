import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "brand" | "ok" | "warn" | "crit" | "info" | "muted";

const ICON_TONE: Record<StatTone, string> = {
  default: "bg-muted text-foreground/70",
  brand: "bg-brand/10 text-brand",
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  crit: "bg-red-500/10 text-red-600 dark:text-red-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
};

const VALUE_TONE: Record<StatTone, string> = {
  default: "",
  brand: "",
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  crit: "text-red-600 dark:text-red-400",
  info: "",
  muted: "text-muted-foreground",
};

/**
 * Thẻ KPI dùng chung (Việc của tôi / Request / Báo cáo / Ads...). `delta` là
 * thay đổi so với kỳ trước — `deltaGoodWhen` cho biết tăng là tốt hay xấu
 * (vd. chi phí/CPL tăng là xấu) để tô màu đúng.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  delta,
  deltaGoodWhen = "up",
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  hint?: React.ReactNode;
  /** Tỷ lệ thay đổi (0.12 = +12%). null = không có kỳ so sánh. */
  delta?: number | null;
  deltaGoodWhen?: "up" | "down";
  href?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs transition-colors",
        href && "hover:border-foreground/20 hover:bg-muted/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className={cn("text-2xl font-semibold leading-none tracking-tight tabular-nums", VALUE_TONE[tone])}>{value}</div>
      {(delta != null || hint) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {delta != null && <DeltaBadge delta={delta} goodWhen={deltaGoodWhen} />}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DeltaBadge({ delta, goodWhen = "up", className }: { delta: number; goodWhen?: "up" | "down"; className?: string }) {
  if (!Number.isFinite(delta)) return null;
  const flat = Math.abs(delta) < 0.005;
  const good = flat ? null : (delta > 0) === (goodWhen === "up");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        good == null && "bg-muted text-muted-foreground",
        good === true && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        good === false && "bg-red-500/10 text-red-700 dark:text-red-400",
        className,
      )}
    >
      {flat ? "±0%" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta * 100).toFixed(Math.abs(delta) < 0.1 ? 1 : 0)}%`}
    </span>
  );
}
