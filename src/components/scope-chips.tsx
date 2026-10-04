"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Đổi 1 tham số trên URL (giữ các tham số khác, luôn bỏ `limit` khi đổi phạm vi) rồi để server tải lại đúng phạm vi. */
export function useUrlParam() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = React.useTransition();
  const set = React.useCallback(
    (updates: Record<string, string | null>, opts: { keepLimit?: boolean } = {}) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!opts.keepLimit) next.delete("limit");
      const qs = next.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [router, pathname, sp],
  );
  return { set, pending, get: (k: string) => sp.get(k) };
}

export interface ScopeOption {
  value: string;
  label: string;
  /** Số lượng hiện trên chip. */
  count?: number;
  /** Tô đỏ khi > 0 (vd. "Quá hạn"). */
  alert?: boolean;
}

/**
 * Chip chọn phạm vi danh sách (Đang làm việc / Của tôi / Quá hạn…). Giá trị nằm trên URL nên link chia sẻ
 * được, nút Back hoạt động, và server chỉ tải đúng phạm vi đang xem. `defaultValue` không ghi lên URL.
 */
export function ScopeChips({ param, value, defaultValue, options, className }: { param: string; value: string; defaultValue: string; options: ScopeOption[]; className?: string }) {
  const { set, pending } = useUrlParam();
  return (
    <div className={cn("flex flex-wrap items-center gap-1", pending && "opacity-60", className)} role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => set({ [param]: o.value === defaultValue ? null : o.value })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              on ? "border-brand/40 bg-brand/10 font-medium text-brand" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold tabular-nums leading-4",
                  o.alert && o.count > 0 ? "bg-red-500 text-white" : on ? "bg-brand/15" : "bg-muted",
                )}
              >
                {o.count.toLocaleString("vi-VN")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Nút "Hiện thêm": tăng `limit` trên URL để server trả thêm dòng. Chỉ hiện khi còn dòng chưa tải. */
export function LoadMore({ shown, total, step, className }: { shown: number; total: number; step: number; className?: string }) {
  const { set, pending, get } = useUrlParam();
  if (shown >= total) return null;
  const current = Number(get("limit")) || step;
  return (
    <div className={cn("flex items-center justify-center gap-3 py-2 text-xs text-muted-foreground", className)}>
      <span>
        Đang hiện {shown.toLocaleString("vi-VN")} / {total.toLocaleString("vi-VN")}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => set({ limit: String(current + step) }, { keepLimit: true })}
        className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 font-medium text-foreground shadow-xs hover:bg-muted disabled:opacity-60"
      >
        <ChevronDown className="h-3.5 w-3.5" />
        {pending ? "Đang tải…" : `Hiện thêm ${Math.min(step, total - shown).toLocaleString("vi-VN")}`}
      </button>
    </div>
  );
}
