import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { fmtInt, fmtPct, fmtRatioX, fmtVnd } from "@/lib/format";
import { resolveRange, todayVnDayStr } from "@/lib/time";
import {
  getAdsPeriodCached,
  getAdsTodayCached,
  getCampaignAlertsCached,
} from "../dashboard-cache";
import { AdsDailyChart } from "./ads-daily-chart";
import { AdsFilters } from "./ads-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Theo dõi Ads — VMG TMĐT OS" };

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const CHANNEL_LABEL: Record<string, string> = {
  FB: "Facebook",
  GOOGLE: "Google",
  TIKTOK: "TikTok",
  KHAC: "Khác",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  if (!["ADMIN", "MANAGER", "MARKETING"].includes(user.role))
    return <p className="text-sm">Không có quyền xem trang này.</p>;

  const today = todayVnDayStr();
  const sp = await searchParams;
  const { from, to, label } = resolveRange(sp.range ?? "this_month");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Theo dõi Ads</h1>
          <p className="text-sm text-muted-foreground">
            {label}: {from} → {to} · so với kỳ liền trước
          </p>
        </div>
        <Link
          href={`/campaign?date=${today}`}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Nhập số liệu hôm nay
        </Link>
      </div>

      <AdsFilters />

      {/* "Hôm nay" — không phụ thuộc bộ lọc, thường lấy từ cache */}
      <Suspense key="today" fallback={<Skel rows={2} label="Đang tải tình trạng hôm nay…" />}>
        <TodayBlock today={today} />
      </Suspense>

      {/* Số theo kỳ — chảy vào sau khi tính xong */}
      <Suspense
        key={`p-${from}-${to}`}
        fallback={<Skel rows={6} label="Đang tính số theo kỳ…" />}
      >
        <PeriodBlock from={from} to={to} />
      </Suspense>
    </div>
  );
}

function Skel({ rows, label }: { rows: number; label: string }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-muted/60" />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Hôm nay
async function TodayBlock({ today }: { today: string }) {
  const [{ entry, pacing }, alerts] = await Promise.all([
    getAdsTodayCached(),
    getCampaignAlertsCached(),
  ]);
  const pacePct =
    pacing.dailyBudgetOn > 0 ? pacing.spendToday / pacing.dailyBudgetOn : null;
  const kill = alerts.filter((a) => a.rule === "R1" || a.rule === "R2");
  const warn = alerts.filter((a) => a.rule === "R3" || a.rule === "R4");
  const good = alerts.filter((a) => a.rule === "R5");

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
        <Mini label="Ngân sách ngày (ON)" value={fmtVnd(pacing.dailyBudgetOn)} />
        <Mini
          label="Spend hôm nay"
          value={fmtVnd(pacing.spendToday)}
          tone={pacePct != null && pacePct > 1.1 ? "crit" : undefined}
        />
        <Mini label="Spend TB 7 ngày" value={fmtVnd(pacing.spend7dAvg)} />
        <Mini
          label="Nhịp hôm nay / ngân sách"
          value={fmtPct(pacePct)}
          tone={pacePct != null && pacePct > 1.1 ? "crit" : undefined}
        />
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Nhập liệu hôm nay ({dm(today)})
        </h2>
        {entry.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Không có campaign nào đang ON.
          </p>
        ) : entry.missing.length === 0 ? (
          <p className="text-sm text-ok">
            Đã nhập đủ {entry.entered}/{entry.total} campaign ON. ✔
          </p>
        ) : (
          <div className="space-y-1.5 text-sm">
            <p className={entry.entered ? "" : "text-crit"}>
              Đã nhập <b>{entry.entered}</b>/{entry.total} campaign ON —{" "}
              <span className="text-crit">còn thiếu {entry.missing.length}</span>:
            </p>
            <ul className="space-y-0.5">
              {entry.missing.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/campaign?date=${today}`}
                    className="text-brand hover:underline"
                  >
                    {c.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Cảnh báo campaign
        </h2>
        {alerts.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            Không có cảnh báo — mọi campaign đang trong ngưỡng.
          </p>
        ) : (
          <div className="space-y-2">
            {[
              { list: kill, tone: "crit" as const, label: "Đề xuất KILL" },
              { list: warn, tone: "warn" as const, label: "Cần tối ưu / thiếu dữ liệu" },
              { list: good, tone: "ok" as const, label: "Đang tốt" },
            ]
              .filter((g) => g.list.length)
              .map((g) => (
                <div
                  key={g.label}
                  className={
                    "rounded-lg border p-3 " +
                    (g.tone === "crit"
                      ? "border-crit/40 bg-crit/5"
                      : g.tone === "warn"
                        ? "border-warn/40 bg-warn/5"
                        : "border-ok/40 bg-ok/5")
                  }
                >
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                    {g.tone !== "ok" && (
                      <AlertTriangle
                        className={
                          "h-4 w-4 " + (g.tone === "crit" ? "text-crit" : "text-warn")
                        }
                      />
                    )}
                    {g.label} ({g.list.length})
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {g.list.map((a) => (
                      <li key={`${a.campaignId}-${a.rule}`}>
                        <Badge variant="outline" className="mr-1">
                          {a.rule}
                        </Badge>
                        <span className="font-medium">{a.displayName}</span> —{" "}
                        <span className="text-muted-foreground">{a.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Theo kỳ
async function PeriodBlock({ from, to }: { from: string; to: string }) {
  const { tiles, campaignWeeks, daily, byChannel, byProduct } =
    await getAdsPeriodCached(from, to);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <AdTile name="Spend" value={fmtVnd(tiles.spend.v)} delta={tiles.spend.d} />
        <AdTile name="Tin nhắn" value={fmtInt(tiles.messages.v)} delta={tiles.messages.d} />
        <AdTile name="MQL" value={fmtInt(tiles.mql.v)} delta={tiles.mql.d} />
        <AdTile name="CPMQL" value={fmtVnd(tiles.cpmql.v)} delta={tiles.cpmql.d} lowerBetter />
        <AdTile name="CAC" value={fmtVnd(tiles.cac.v)} delta={tiles.cac.d} lowerBetter />
        <AdTile name="ROAS" value={fmtRatioX(tiles.roas.v)} delta={tiles.roas.d} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Xu hướng theo ngày — Spend / Tin nhắn / MQL / CPMQL
        </h2>
        <div className="rounded-lg border p-4">
          <AdsDailyChart data={daily} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="px-3 py-2 text-left text-sm font-semibold">
              Theo kênh
            </caption>
            <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Kênh</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">% NS</th>
                <th className="px-3 py-2 text-right">Tin nhắn</th>
                <th className="px-3 py-2 text-right">MQL</th>
                <th className="px-3 py-2 text-right">CPMQL</th>
              </tr>
            </thead>
            <tbody>
              {byChannel.map((c) => (
                <tr key={c.channel} className="border-b">
                  <td className="px-3 py-1.5 font-medium">
                    {CHANNEL_LABEL[c.channel] ?? c.channel}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtVnd(c.spend)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {c.sharePct == null ? "–" : `${c.sharePct.toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtInt(c.messages)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtInt(c.mql)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtVnd(c.cpmql)}
                  </td>
                </tr>
              ))}
              {byChannel.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="px-3 py-2 text-left text-sm font-semibold">
              Theo sản phẩm
            </caption>
            <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">MQL</th>
                <th className="px-3 py-2 text-right">SQL</th>
                <th className="px-3 py-2 text-right">CPMQL</th>
                <th className="px-3 py-2 text-right">% ngân sách</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((r) => (
                <tr key={r.key} className="border-b">
                  <td className="px-3 py-1.5 font-medium">
                    {r.label.split(" — ")[0]}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtVnd(r.metrics.spend)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtInt(r.metrics.mql)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtInt(r.metrics.sql)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtVnd(r.metrics.cpmql)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.budgetShareActualPct == null
                      ? "–"
                      : `${r.budgetShareActualPct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
              {byProduct.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Hiệu suất theo tuần — CPMQL (8 tuần, tô màu theo target)
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/40 px-3 py-2">Campaign</th>
                <th className="px-3 py-2 text-right">Target</th>
                {campaignWeeks[0]?.weeks.map((w) => (
                  <th key={w.weekStart} className="px-3 py-2 text-right">
                    {dm(w.weekStart)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaignWeeks.map((c) => (
                <tr key={c.campaignId} className="border-b">
                  <td className="sticky left-0 bg-background px-3 py-1.5 font-medium">
                    {c.displayName}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {c.targetCpmql ? fmtVnd(c.targetCpmql) : "–"}
                  </td>
                  {c.weeks.map((w) => {
                    const t = c.targetCpmql;
                    const cls =
                      w.cpmql == null
                        ? "text-muted-foreground"
                        : t == null
                          ? ""
                          : w.cpmql <= t
                            ? "text-ok font-medium"
                            : w.cpmql <= t * 1.5
                              ? "text-warn"
                              : "text-crit font-medium";
                    return (
                      <td
                        key={w.weekStart}
                        className={"px-3 py-1.5 text-right tabular-nums " + cls}
                        title={`Spend ${fmtVnd(w.spend)} · ${fmtInt(w.mql)} MQL`}
                      >
                        {w.cpmql == null
                          ? w.spend > 0
                            ? "0 MQL"
                            : "–"
                          : fmtVnd(w.cpmql)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {campaignWeeks.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Chưa có campaign nào có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ô trống = không có MQL trong tuần. Di chuột lên ô để xem spend / MQL.
        </p>
      </section>
    </div>
  );
}

function AdTile({
  name,
  value,
  delta,
  lowerBetter,
}: {
  name: string;
  value: string;
  delta: number | null;
  lowerBetter?: boolean;
}) {
  const up = delta != null && delta > 0;
  const good = delta == null ? null : lowerBetter ? !up : up;
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{name}</div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
      {delta != null && (
        <div
          className={
            "flex items-center gap-0.5 text-xs " +
            (good == null
              ? "text-muted-foreground"
              : good
                ? "text-ok"
                : "text-crit")
          }
        >
          {up ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {Math.abs(delta) > 5 ? ">500%" : fmtPct(Math.abs(delta))}
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "crit";
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={
          "text-sm font-semibold tabular-nums " + (tone === "crit" ? "text-crit" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
