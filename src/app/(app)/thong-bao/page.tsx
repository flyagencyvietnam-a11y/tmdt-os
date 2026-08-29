import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listNotifications } from "@/lib/services/notifications";
import { fmtDateTime } from "@/lib/format";
import { MarkAllRead } from "./mark-all-read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thông báo — VMG TMĐT OS" };

export default async function Page() {
  const user = await requireUser();
  const items = await listNotifications(db, user.id, { limit: 100 });

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Thông báo</h1>
        <MarkAllRead />
      </div>
      <div className="divide-y rounded-lg border">
        {items.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Chưa có thông báo.
          </p>
        )}
        {items.map((n) => (
          <div
            key={n.id}
            className={n.readAt ? "px-3 py-2" : "bg-brand/5 px-3 py-2"}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={
                  n.severity === "CRITICAL"
                    ? "h-1.5 w-1.5 rounded-full bg-crit"
                    : n.severity === "WARNING"
                      ? "h-1.5 w-1.5 rounded-full bg-warn"
                      : "h-1.5 w-1.5 rounded-full bg-muted-foreground"
                }
              />
              <span className="flex-1 text-sm font-medium">{n.title}</span>
              <span className="text-[10px] text-muted-foreground">
                {fmtDateTime(n.createdAt)}
              </span>
            </div>
            {n.body && (
              <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
            )}
            {n.linkUrl && (
              <Link
                href={n.linkUrl}
                className="mt-0.5 inline-block text-xs text-brand hover:underline"
              >
                Mở
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
