"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { upsertAdsMetricAction } from "./actions";
import type { Line, MetricRow, PeriodType } from "./shared";

type NumField = "budget" | "centerOrderBudget" | "hoTopupBudget" | "leads" | "newStudents" | "messages" | "impressions" | "revenue" | "actualRevenue" | "mql" | "deals";

/**
 * Sửa 1 ô số liệu ngay trên bảng (như Excel): bấm ô → gõ số → Enter (xuống dòng) / Tab (sang phải) / Esc (huỷ).
 * Ô trống bấm vào sẽ TẠO dòng số liệu của kỳ đó. Chỉ ghi đúng 1 trường — các trường khác giữ nguyên.
 */
export function useMetricSaver() {
  const router = useRouter();
  return React.useCallback(
    async (row: MetricRow | null, base: { line: Line; periodType: PeriodType; period: string; sbuId: string | null }, field: NumField, value: string | null) => {
      const res = await upsertAdsMetricAction({ id: row?.id, line: base.line, periodType: base.periodType, period: base.period, sbuId: base.sbuId, [field]: value });
      if (res.ok) router.refresh();
      else toast.error(res.error);
      return res.ok;
    },
    [router],
  );
}

/** Dấu hiệu nhận diện cho việc nhảy ô bằng DOM. */
const ATTR = "data-inline-num";

function jump(from: HTMLElement, mode: "right" | "down") {
  if (mode === "right") {
    const all = [...(from.closest("table")?.querySelectorAll<HTMLElement>(`[${ATTR}]`) ?? [])];
    all[all.indexOf(from) + 1]?.click();
    return;
  }
  const td = from.closest("td");
  const tr = td?.parentElement;
  const next = tr?.nextElementSibling as HTMLElement | null;
  const idx = td ? [...(tr?.children ?? [])].indexOf(td) : -1;
  next?.children[idx]?.querySelector<HTMLElement>(`[${ATTR}]`)?.click();
}

export function InlineNum({
  value,
  display,
  onSave,
  disabled,
  className,
  title,
}: {
  /** Giá trị thô để sửa (chuỗi số); null/"" = ô trống. */
  value: string | number | null | undefined;
  /** Nội dung hiển thị khi không sửa. */
  display: React.ReactNode;
  onSave: (v: string | null) => Promise<unknown> | void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const done = React.useRef(false);

  if (disabled) return <span className={className}>{display}</span>;

  if (editing) {
    const finish = async (raw: string, move?: "right" | "down") => {
      if (done.current) return;
      done.current = true;
      const next = raw.replace(/[.\s]/g, "").replace(/,/g, ".").trim();
      const cur = value == null || value === "" ? "" : String(Number(value));
      setEditing(false);
      if (next !== "" && !Number.isFinite(Number(next))) {
        toast.error("Chỉ nhập số.");
      } else if (next !== cur) {
        setSaving(true);
        await onSave(next === "" ? null : String(Number(next)));
        setSaving(false);
      }
      const el = btnRef.current;
      if (move && el) requestAnimationFrame(() => jump(el, move));
    };
    return (
      <input
        autoFocus
        inputMode="decimal"
        defaultValue={value == null || value === "" ? "" : String(Number(value))}
        className="h-6 w-full min-w-16 rounded border border-brand/60 bg-background px-1 text-right text-sm tabular-nums outline-none ring-2 ring-brand/20"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => void finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void finish((e.target as HTMLInputElement).value, "down");
          } else if (e.key === "Tab") {
            e.preventDefault();
            void finish((e.target as HTMLInputElement).value, e.shiftKey ? undefined : "right");
          } else if (e.key === "Escape") {
            done.current = true;
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      ref={btnRef}
      {...{ [ATTR]: "" }}
      type="button"
      title={title ?? "Bấm để sửa"}
      onClick={(e) => {
        e.stopPropagation();
        done.current = false;
        setEditing(true);
      }}
      className={cn("-mx-1 w-full cursor-cell rounded px-1 text-right tabular-nums hover:bg-brand/10 hover:outline hover:outline-1 hover:outline-brand/40", saving && "opacity-50", className)}
    >
      {display}
    </button>
  );
}
