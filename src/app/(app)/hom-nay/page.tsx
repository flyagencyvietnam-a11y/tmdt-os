import Link from "next/link";
import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { leads, products } from "@/lib/db/schema";
import { getOpsDiscipline } from "@/lib/services/metrics";
import { todayVnDayStr } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hôm nay — VMG TMĐT OS" };

export default async function Page() {
  const user = await requireRole("EC", "ADMIN", "MANAGER");
  const today = todayVnDayStr();
  const mineOnly = user.role === "EC";
  const scope = mineOnly ? [eq(leads.assignedTo, user.id)] : [];

  const base = and(
    isNull(leads.deletedAt),
    isNull(leads.duplicateOf),
    eq(leads.outcome, "OPEN"),
    ...scope,
  );

  const sel = {
    id: leads.id,
    code: leads.code,
    fullName: leads.fullName,
    productCode: products.code,
    stage: leads.stage,
    silenceCount: leads.silenceCount,
    nextContactDate: leads.nextContactDate,
    receivedAt: leads.receivedAt,
    consultNote: leads.consultNote,
  };

  const [overdue, dueToday, fresh, ops] = await Promise.all([
    db
      .select(sel)
      .from(leads)
      .leftJoin(products, eq(products.id, leads.productId))
      .where(and(base, lt(leads.nextContactDate, today)))
      .orderBy(asc(leads.nextContactDate)),
    db
      .select(sel)
      .from(leads)
      .leftJoin(products, eq(products.id, leads.productId))
      .where(and(base, eq(leads.nextContactDate, today)))
      .orderBy(desc(leads.silenceCount)),
    db
      .select(sel)
      .from(leads)
      .leftJoin(products, eq(products.id, leads.productId))
      .where(and(base, eq(leads.stage, "NEW")))
      .orderBy(asc(leads.receivedAt)),
    getOpsDiscipline(db, {
      assignedTo: mineOnly ? [user.id] : undefined,
      from: todayVnDayStr(),
      to: todayVnDayStr(),
    }),
  ]);

  const clearedToday = ops.dailyClearRate;
  const dueCount = dueToday.length;
  // Server Component render một lần / request — Date.now() ở đây là an toàn.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Hôm nay</h1>
          <p className="text-sm text-muted-foreground">
            {mineOnly ? "Hàng đợi chăm sóc của bạn." : "Toàn đội."} SPEC Mục 11.1.
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">Tiến độ ngày</div>
          <div className="font-semibold">
            {clearedToday == null
              ? "–"
              : `${Math.round(clearedToday * 100)}% (${dueCount} đến hẹn)`}
          </div>
        </div>
      </div>

      <QueueBlock
        title={`Trễ hẹn chăm sóc: ${overdue.length} khách`}
        tone="crit"
        rows={overdue}
        today={today}
        nowMs={now}
        emptyText="Không có lead trễ hẹn. 👏"
      />
      <QueueBlock
        title={`Đến hẹn hôm nay: ${dueToday.length} khách`}
        tone="warn"
        rows={dueToday}
        today={today}
        nowMs={now}
        emptyText="Không có lead đến hẹn hôm nay."
      />
      <QueueBlock
        title={`Lead mới chưa xử lý: ${fresh.length}`}
        tone="plain"
        rows={fresh}
        today={today}
        nowMs={now}
        showClock
        emptyText="Không có lead mới."
      />
    </div>
  );
}

type QRow = {
  id: string;
  code: string;
  fullName: string;
  productCode: string | null;
  stage: string;
  silenceCount: number;
  nextContactDate: string | null;
  receivedAt: Date;
  consultNote: string | null;
};

function QueueBlock({
  title,
  tone,
  rows,
  today,
  nowMs,
  emptyText,
  showClock,
}: {
  title: string;
  tone: "crit" | "warn" | "plain";
  rows: QRow[];
  today: string;
  nowMs: number;
  emptyText: string;
  showClock?: boolean;
}) {
  const border =
    tone === "crit"
      ? "border-crit/40 bg-crit/5"
      : tone === "warn"
        ? "border-warn/40 bg-warn/5"
        : "border-border";
  return (
    <section className={`rounded-lg border ${border} p-4`}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const daysOverdue = r.nextContactDate
              ? Math.round(
                  (Date.parse(`${today}T00:00:00Z`) -
                    Date.parse(`${r.nextContactDate}T00:00:00Z`)) /
                    86_400_000,
                )
              : 0;
            const hrsSince = Math.round(
              (nowMs - new Date(r.receivedAt).getTime()) / 3_600_000,
            );
            return (
              <li key={r.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/lead/${r.id}`}
                    className="font-medium hover:underline"
                  >
                    {r.fullName}
                  </Link>
                  <div className="flex items-center gap-1 text-xs">
                    <Badge variant="secondary">{r.productCode}</Badge>
                    <Badge variant="outline">im lặng {r.silenceCount}</Badge>
                    {tone === "crit" && (
                      <Badge variant="outline" className="text-crit">
                        trễ {daysOverdue} ngày
                      </Badge>
                    )}
                    {showClock && (
                      <Badge
                        variant="outline"
                        className={hrsSince >= 24 ? "text-crit" : ""}
                      >
                        {hrsSince}h chưa xử lý
                      </Badge>
                    )}
                  </div>
                </div>
                {r.consultNote && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {r.consultNote}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
