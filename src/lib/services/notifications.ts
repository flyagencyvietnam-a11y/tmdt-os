import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notifications, users } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import type { AnyDb } from "./metrics";

type NotifType =
  | "OVERDUE_LEADS"
  | "CAMPAIGN_ALERT"
  | "TASK_DUE"
  | "KPI_RISK"
  | "DATA_GAP"
  | "ASSIGNMENT";
type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface NotifyInput {
  userId: string;
  type: NotifType;
  severity?: Severity;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  /** Khóa idempotency cho cron — cùng key trong ngày sẽ không tạo trùng. */
  dedupeKey?: string;
}

export async function notify(db: AnyDb, input: NotifyInput): Promise<boolean> {
  if (input.dedupeKey) {
    const [dup] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.dedupeKey, input.dedupeKey),
        ),
      )
      .limit(1);
    if (dup) return false;
  }
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    severity: input.severity ?? "INFO",
    title: input.title,
    body: input.body ?? null,
    linkUrl: input.linkUrl ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });
  return true;
}

/** Gửi cùng một thông báo cho nhiều user (ví dụ tất cả ADMIN/MANAGER). */
export async function notifyMany(
  db: AnyDb,
  userIds: string[],
  input: Omit<NotifyInput, "userId">,
): Promise<number> {
  let n = 0;
  for (const uid of userIds) {
    if (
      await notify(db, {
        ...input,
        userId: uid,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${uid}` : undefined,
      })
    )
      n++;
  }
  return n;
}

export async function getManagerIds(db: AnyDb): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.isActive, true), sql`${users.role} in ('ADMIN','MANAGER')`),
    );
  return rows.map((r) => r.id);
}

export async function listNotifications(
  db: AnyDb,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        opts.unreadOnly ? isNull(notifications.readAt) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 50);
}

export async function unreadCount(db: AnyDb, userId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(r?.c ?? 0);
}

export async function markRead(db: AnyDb, id: string, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllRead(db: AnyDb, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export { todayVnDayStr };
