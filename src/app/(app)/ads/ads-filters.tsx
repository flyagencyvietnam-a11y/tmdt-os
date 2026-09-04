"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_RANGE, PeriodSelects } from "@/components/period-selects";
import { cn } from "@/lib/utils";

/** Bộ lọc thời gian cho trang Theo dõi Ads — cùng bộ Năm/Quý/Tháng/Tuần với Dashboard. */
export function AdsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const spStr = sp.toString();
  const [pending, startTransition] = React.useTransition();
  const [opt, setOpt] = React.useState<{ spStr: string; range: string } | null>(
    null,
  );
  const range =
    opt && opt.spStr === spStr ? opt.range : (sp.get("range") ?? DEFAULT_RANGE);

  function setRange(next: string) {
    setOpt({ spStr, range: next });
    const qs = next && next !== DEFAULT_RANGE ? `?range=${next}` : "";
    try {
      localStorage.setItem("vmg.ads.range", next);
    } catch {}
    startTransition(() => router.push(`/ads${qs}`));
  }

  React.useEffect(() => {
    if (sp.toString()) return;
    try {
      const saved = localStorage.getItem("vmg.ads.range");
      if (saved && saved !== DEFAULT_RANGE) router.replace(`/ads?range=${saved}`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-busy={pending}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <PeriodSelects range={range} onRange={setRange} />
      {range !== DEFAULT_RANGE && (
        <Button variant="ghost" size="sm" onClick={() => setRange(DEFAULT_RANGE)}>
          Xóa lọc
        </Button>
      )}
      {pending && <span className="text-xs text-muted-foreground">đang tải…</span>}
    </div>
  );
}
