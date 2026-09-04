import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { fmtInt, fmtVnd } from "@/lib/format";
import { todayVnDayStr } from "@/lib/time";
import { getAdsMonitorCached } from "../dashboard-cache";

export const dynamic = "force-dynamic";
export const metadata = { title: "Theo dõi Ads — VMG TMĐT OS" };

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export default async function Page() {
  const user = await requireUser();
  if (!["ADMIN", "MANAGER", "MARKETING"].includes(user.role))
    return <p className="text-sm">Không có quyền xem trang này.</p>;

  const today = todayVnDayStr();
  const { entry, alerts, campaignWeeks } = await getAdsMonitorCached();

  const kill = alerts.filter((a) => a.rule === "R1" || a.rule === "R2");
  const warn = alerts.filter((a) => a.rule === "R3" || a.rule === "R4");
  const good = alerts.filter((a) => a.rule === "R5");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Theo dõi Ads</h1>
          <p className="text-sm text-muted-foreground">
            Tình trạng nhập liệu, cảnh báo campaign, hiệu suất theo tuần.
          </p>
        </div>
        <Link
          href={`/campaign?date=${today}`}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Nhập số liệu hôm nay
        </Link>
      </div>

      {/* Tình trạng nhập liệu hôm nay */}
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

      {/* Cảnh báo R1–R5 */}
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
                          "h-4 w-4 " +
                          (g.tone === "crit" ? "text-crit" : "text-warn")
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

      {/* Hiệu suất campaign theo tuần */}
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
