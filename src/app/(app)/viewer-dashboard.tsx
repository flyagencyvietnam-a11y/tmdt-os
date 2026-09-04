import type { breakdownByUser } from "@/lib/services/dashboard";
import { fmtPct, fmtRatioX, fmtVnd } from "@/lib/format";
import { TeamProgressTable } from "./team-progress-table";
import { TrendChart } from "./trend-chart";

interface Props {
  quarterLabel: string;
  from: string;
  to: string;
  revenueGross: number;
  hvm: number;
  roas: number | null;
  revenueTarget: number | null;
  hvmTarget: number | null;
  byProduct: { code: string; roas: number | null; revenue: number }[];
  trend: {
    weekStart: string;
    spend: number;
    mql: number;
    won: number;
    cpmql: number | null;
  }[];
  teamProgress: Awaited<ReturnType<typeof breakdownByUser>>;
}

/** Dashboard rút gọn cho VIEWER (BOD) — SPEC Mục 12.6. Một màn hình, không dữ liệu cá nhân. */
export function ViewerDashboard(p: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Tổng quan — {p.quarterLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {p.from} → {p.to}. Số lũy kế so với chỉ tiêu quý.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Progress
          label="Doanh thu gộp lũy kế"
          value={p.revenueGross}
          target={p.revenueTarget}
          fmt={fmtVnd}
        />
        <Progress label="HVM lũy kế" value={p.hvm} target={p.hvmTarget} fmt={(v) => String(Math.round(v))} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="ROAS tổng" value={fmtRatioX(p.roas)} />
        {p.byProduct
          .filter((x) => x.revenue > 0)
          .slice(0, 3)
          .map((x) => (
            <Tile key={x.code} label={`ROAS ${x.code}`} value={fmtRatioX(x.roas)} />
          ))}
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold">Xu hướng 12 tuần</h2>
        <TrendChart data={p.trend} />
      </div>

      {p.teamProgress.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Tiến độ đội — quý {p.quarterLabel}
          </h2>
          <TeamProgressTable rows={p.teamProgress} />
        </div>
      )}
    </div>
  );
}

function Progress({
  label,
  value,
  target,
  fmt,
}: {
  label: string;
  value: number;
  target: number | null;
  fmt: (v: number) => string;
}) {
  const pct = target && target > 0 ? value / target : null;
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{fmt(value)}</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={
            pct != null && pct >= 1
              ? "h-full rounded-full bg-ok"
              : "h-full rounded-full bg-brand"
          }
          style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {target ? `Chỉ tiêu ${fmt(target)} · ${fmtPct(pct)}` : "Chưa giao chỉ tiêu quý"}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
