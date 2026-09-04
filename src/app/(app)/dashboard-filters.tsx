"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recentPeriods } from "@/lib/time";

const FAST_RANGES = [
  { v: "today", l: "Hôm nay" },
  { v: "7d", l: "7 ngày" },
  { v: "14d", l: "14 ngày" },
  { v: "this_month", l: "Tháng này" },
  { v: "last_month", l: "Tháng trước" },
  { v: "this_quarter", l: "Quý này" },
];

const GRAINS = [
  { v: "fast", l: "Nhanh" },
  { v: "week", l: "Tuần" },
  { v: "month", l: "Tháng" },
  { v: "quarter", l: "Quý" },
];

/** Từ giá trị `range` suy ra độ mịn đang chọn. */
function grainOf(range: string): "fast" | "week" | "month" | "quarter" {
  if (range.startsWith("week:") || range === "this_week") return "week";
  if (range.startsWith("month:")) return "month";
  if (range.startsWith("quarter:")) return "quarter";
  return "fast";
}
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
  const spStr = sp.toString();
  const [pending, startTransition] = React.useTransition();

  // Giá trị "lạc quan": select nhảy ngay khi bấm, không chờ server render xong.
  // Gắn với spStr lúc bấm; khi URL cập nhật xong (spStr đổi) thì tự bỏ qua.
  const [opt, setOpt] = React.useState<{ spStr: string; range: string } | null>(null);
  const range =
    opt && opt.spStr === spStr ? opt.range : (sp.get("range") ?? "this_month");
  const grain = grainOf(range);
  const cmp = sp.get("cmp") ?? "prev";

  // Danh sách kỳ cụ thể (12 kỳ gần nhất) cho Tuần / Tháng / Quý.
  const periodOpts = React.useMemo(
    () =>
      grain === "fast"
        ? []
        : recentPeriods(grain, 12).map((p) => ({ value: p.value, label: p.label })),
    [grain],
  );
  const selProducts = new Set((sp.get("products") ?? "").split(",").filter(Boolean));
  const selChannels = new Set((sp.get("channels") ?? "").split(",").filter(Boolean));

  function push(next: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    if ("range" in next) setOpt({ spStr, range: next.range ?? "this_month" });
    try {
      localStorage.setItem("vmg.dashboard.filters", qs);
    } catch {}
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
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
    <div
      aria-busy={pending}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <SimpleSelect
        triggerClassName="h-8 w-24"
        value={grain}
        onValueChange={(g) => {
          if (g === "fast") push({ range: "this_month" });
          else {
            const first = recentPeriods(g as "week" | "month" | "quarter", 1)[0];
            push({ range: first.value });
          }
        }}
        options={GRAINS.map((g) => ({ value: g.v, label: g.l }))}
      />

      {grain === "fast" ? (
        <SimpleSelect
          triggerClassName="h-8 w-36"
          value={range}
          onValueChange={(v) => push({ range: v })}
          options={FAST_RANGES.map((r) => ({ value: r.v, label: r.l }))}
        />
      ) : (
        <SimpleSelect
          triggerClassName="h-8 w-52"
          value={range === "this_week" ? periodOpts[0]?.value : range}
          onValueChange={(v) => push({ range: v })}
          options={periodOpts}
        />
      )}

      <SimpleSelect
        triggerClassName="h-8 w-44"
        value={cmp}
        onValueChange={(v) => push({ cmp: v })}
        options={COMPARE.map((c) => ({ value: c.v, label: `So với: ${c.l}` }))}
      />

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

      {pending && (
        <span className="text-xs text-muted-foreground">đang tải…</span>
      )}
    </div>
  );
}
