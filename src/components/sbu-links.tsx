"use client";

import * as React from "react";
import { TagMultiSelect, type TagOption } from "@/components/tag-multi-select";

/** Lựa chọn SBU cho ô chọn nhiều: brand/sản phẩm (hổ phách) đứng trước, trung tâm (xanh) sau. */
export function sbuTagOptions(sbus: { id: string; code: string; name: string; kind: string }[]): TagOption[] {
  return [...sbus]
    .sort((a, b) => Number(b.kind === "brand") - Number(a.kind === "brand") || a.code.localeCompare(b.code))
    .map((x) => ({
      value: x.id,
      label: x.code,
      hint: `${x.kind === "brand" ? "Brand/sản phẩm" : "Trung tâm"} · ${x.name}`,
      color: x.kind === "brand" ? ("amber" as const) : ("sky" as const),
    }));
}

/** Ô gắn nhiều brand/trung tâm: bấm để chọn ngay trên bảng; lưu sau khi dừng chọn ~0,7 giây. */
export function LinksCell({ value, options, canEdit, empty, onSave }: { value: string[]; options: TagOption[]; canEdit: boolean; empty: string; onSave: (v: string[]) => void }) {
  const [local, setLocal] = React.useState(value);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = (id: string) => options.find((o) => o.value === id)?.label ?? "?";
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!canEdit) {
    return value.length ? (
      <span className="flex gap-1 overflow-hidden">
        {value.map((id) => (
          <span key={id} className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
            {label(id)}
          </span>
        ))}
      </span>
    ) : (
      <span className="text-muted-foreground/70">{empty}</span>
    );
  }
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <TagMultiSelect
        value={local}
        onChange={(v) => {
          setLocal(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onSave(v), 700);
        }}
        options={options}
        placeholder={empty}
        className="min-h-7 border-transparent bg-transparent py-0.5 hover:border-input"
      />
    </div>
  );
}
