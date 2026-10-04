"use client";

import { Check, ChevronDown, X } from "lucide-react";
import * as React from "react";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TagOption {
  value: string;
  label: string;
  color?: TagColor;
  hint?: string;
}

/**
 * Chọn NHIỀU giá trị dạng tag màu (kiểu Airtable/Notion multi-select).
 * Thứ tự chọn được giữ nguyên — phần tử đầu tiên là giá trị "chính" (★).
 */
export function TagMultiSelect({
  value,
  onChange,
  options,
  placeholder = "Chọn…",
  primaryHint,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: TagOption[];
  placeholder?: string;
  /** Hiện dấu ★ ở phần tử đầu, kèm tooltip này (vd. "Brand chính"). */
  primaryHint?: string;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const byValue = React.useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options;

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <Popover>
      {/* div (không phải <button>) vì bên trong có nút "x" bỏ từng tag — button lồng button là HTML sai. */}
      <PopoverTrigger
        nativeButton={false}
        render={
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-left text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50",
              className,
            )}
          />
        }
      >
        {value.length === 0 && <span className="px-1 text-muted-foreground">{placeholder}</span>}
        {value.map((v, i) => {
          const o = byValue.get(v);
          return (
            <Tag key={v} color={o?.color} className="gap-1 pr-1">
              {primaryHint && i === 0 && value.length > 1 && (
                <span title={primaryHint} aria-label={primaryHint}>
                  ★
                </span>
              )}
              {o?.label ?? v}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Bỏ ${o?.label ?? v}`}
                className="rounded-full p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  toggle(v);
                }}
              >
                <X className="h-3 w-3" />
              </span>
            </Tag>
          );
        })}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {options.length > 6 && (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm…"
            className="mb-1 h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        )}
        <div className="max-h-64 overflow-y-auto">
          {shown.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", on && "bg-muted/60")}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-brand bg-brand text-brand-foreground" : "border-input",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <Tag color={o.color}>{o.label}</Tag>
                {o.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Không có lựa chọn.</p>}
        </div>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md border-t px-2 pt-1.5 text-left text-xs text-muted-foreground hover:text-foreground">
            Bỏ chọn tất cả
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
