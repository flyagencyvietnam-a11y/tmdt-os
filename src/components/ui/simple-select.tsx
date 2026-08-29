"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

/**
 * Select đơn giản: nhận `options`, tự truyền `items` cho Base UI để trigger hiển
 * thị NHÃN (không phải giá trị thô) ngay cả khi chưa mở dropdown.
 */
export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const items = React.useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.label])),
    [options],
  );
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v == null ? "" : String(v))}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger className={triggerClassName ?? "w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
