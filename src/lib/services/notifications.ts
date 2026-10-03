import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/email";
import { sendPushToUser } from "./push";
import { todayVnDayStr } from "@/lib/time";

export type NotifKind =
  | "assigned"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "escalation"
  | "mention"
  | "comment"
  | "status_change"
  | "due_change"
  | "assignee_change"
  | "blocked"
  | "dependency_cleared"
  | "request_new"
  | "request_due_soon"
  | "import_done"
  | "digest_daily"
  | "digest_weekly";

export type NotifChannel = "in_app" | "email";

export interface NotifyInput {
  userId: string;
  kind: NotifKind;
  taskId?: string | null;
  title: string;
  body?: string | null;
  channel?: NotifChannel;
  /** Khóa chống trùng Mục 11.3: ví dụ `task:${taskId}:overdue:${ngày}`. */
  dedupeKey?: string;
  /** Gửi kèm email ngay (ngoài bản ghi in-app). */
  alsoEmail?: { to: string; subject: string; text: string };
}

/** Tạo 1 thông báo, chặn trùng theo (user, channel, dedupeKey) — Mục 11.3. */
export async function notify(db: DB, input: NotifyInput): Promise<boolean> {
  const channel = input.channel ?? "in_app";
  if (input.dedupeKey) {
    const [dup] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.channel, channel),
          eq(notifications.dedupeKey, input.dedupeKey),
        ),
      )
      .limit(1);
    if (dup) return false;
  }
  await db.insert(notifications).values({
    userId: input.userId,
    kind: input.kind,
    taskId: input.taskId ?? null,
    title: input.title,
    body: input.body ?? null,
    channel,
    dedupeKey: input.dedupeKey ?? null,
    sentAt: new Date(),
  });
  if (input.alsoEmail) {
    await sendMail({ to: input.alsoEmail.to, subject: input.alsoEmail.subject, text: input.alsoEmail.text });
  }
  // Web push (SPEC Mục 11.1, P2) — best-effort, không chặn luồng thông báo app chính nếu lỗi.
  if (channel === "in_app") {
    sendPushToUser(db, input.userId, {
      title: input.title,
      body: input.body ?? undefined,
      url: input.taskId ? `/task/${input.taskId}` : "/",
    }).catch(() => {});
  }
  return true;
}

export async function notifyMany(
  db: DB,
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

export async function getManagerIds(db: DB): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), sql`${users.role} in ('admin','manager')`));
  return rows.map((r) => r.id);
}

export async function emailsFor(db: DB, userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(sql`${users.id} = any(${userIds})`, eq(users.active, true)));
  return rows.map((r) => r.email);
}

export async function listNotifications(
  db: DB,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channel, "in_app"),
        opts.unreadOnly ? isNull(notifications.readAt) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 50);
}

export async function unreadCount(db: DB, userId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channel, "in_app"),
        isNull(notifications.readAt),
      ),
    );
  return Number(r?.c ?? 0);
}

export async function markRead(db: DB, id: string, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllRead(db: DB, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.channel, "in_app"),
        isNull(notifications.readAt),
      ),
    );
}

export { todayVnDayStr };
