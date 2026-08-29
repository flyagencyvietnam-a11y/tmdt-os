"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const str = (v: unknown) => (v == null ? "" : String(v));

const RANGES = [
  { v: "today", l: "Hôm nay" },
  { v: "7d", l: "7 ngày" },
  { v: "14d", l: "14 ngày" },
  { v: "this_month", l: "Tháng này" },
  { v: "last_month", l: "Tháng trước" },
  { v: "this_quarter", l: "Quý này" },
];
const COMPARE = [
  { v: "prev", l: "Kỳ liền trước" },
  { v: "yoy", l: "Cùng kỳ năm trước" },
  { v: "none", l: "Không so sánh" },
];

export function DashboardFilters({
  products,
  channels,
}: {
  products: { id: string; code: string }[];
  channels: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const range = sp.get("range") ?? "this_month";
  const cmp = sp.get("cmp") ?? "prev";
  const selProducts = new Set((sp.get("products") ?? "").split(",").filter(Boolean));
  const selChannels = new Set((sp.get("channels") ?? "").split(",").filter(Boolean));

  function push(next: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    try {
      localStorage.setItem("vmg.dashboard.filters", qs);
    } catch {}
  }

  // khôi phục bộ lọc đã lưu nếu vào trang không kèm tham số
  React.useEffect(() => {
    if (sp.toString()) return;
    try {
      const saved = localStorage.getItem("vmg.dashboard.filters");
      if (saved) router.replace(`${pathname}?${saved}`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSet(key: "products" | "channels", value: string) {
    const cur = key === "products" ? selProducts : selChannels;
    const nextSet = new Set(cur);
    if (nextSet.has(value)) nextSet.delete(value);
    else nextSet.add(value);
    push({ [key]: [...nextSet].join(",") });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <Select value={range} onValueChange={(v) => push({ range: str(v) })}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((r) => (
            <SelectItem key={r.v} value={r.v}>
              {r.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={cmp} onValueChange={(v) => push({ cmp: str(v) })}>
        <SelectTrigger className="h-8 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMPARE.map((c) => (
            <SelectItem key={c.v} value={c.v}>
              So với: {c.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Sản phẩm{selProducts.size ? ` (${selProducts.size})` : ""}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-52">
          <div className="space-y-1">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selProducts.has(p.id)}
                  onCheckedChange={() => toggleSet("products", p.id)}
                />
                {p.code}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Kênh{selChannels.size ? ` (${selChannels.size})` : ""}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40">
          <div className="space-y-1">
            {channels.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selChannels.has(c)}
                  onCheckedChange={() => toggleSet("channels", c)}
                />
                {c}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {(selProducts.size > 0 || selChannels.size > 0 || range !== "this_month") && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => push({ range: null, cmp: null, products: null, channels: null })}
        >
          Xóa lọc
        </Button>
      )}
    </div>
  );
}
