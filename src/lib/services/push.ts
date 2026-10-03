import { eq } from "drizzle-orm";
import webpush from "web-push";
import type { DB } from "@/lib/db";
import { appSettings, pushSubscriptions, users } from "@/lib/db/schema";

const VAPID_PUBLIC_KEY = "vapid_public_key";
const VAPID_PRIVATE_KEY = "vapid_private_key";

/**
 * SPEC Mục 11.1 — Web push (P2). Không cần dịch vụ ngoài: cặp khoá VAPID tự
 * sinh và lưu trong `app_settings` ở lần chạy đầu (giống self-host friendly).
 */
export async function getOrCreateVapidKeys(db: DB): Promise<{ publicKey: string; privateKey: string }> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, VAPID_PUBLIC_KEY));
  if (rows[0]) {
    const [priv] = await db.select().from(appSettings).where(eq(appSettings.key, VAPID_PRIVATE_KEY));
    return { publicKey: rows[0].value as string, privateKey: priv.value as string };
  }
  const keys = webpush.generateVAPIDKeys();
  await db.insert(appSettings).values([
    { key: VAPID_PUBLIC_KEY, value: keys.publicKey, description: "Web push VAPID public key (tự sinh)" },
    { key: VAPID_PRIVATE_KEY, value: keys.privateKey, description: "Web push VAPID private key (tự sinh)" },
  ]);
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

async function configureWebpush(db: DB) {
  const { publicKey, privateKey } = await getOrCreateVapidKeys(db);
  const subject = process.env.APP_URL ? `mailto:admin@${new URL(process.env.APP_URL).hostname}` : "mailto:admin@vmg.edu.vn";
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function subscribePush(
  db: DB,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    });
}

export async function unsubscribePush(db: DB, endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Gửi push cho 1 user (mọi thiết bị đã đăng ký). Tự gỡ subscription hết hạn (410/404). */
export async function sendPushToUser(db: DB, userId: string, payload: { title: string; body?: string; url?: string }) {
  await configureWebpush(db);
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      }
    }
  }
  return sent;
}

export async function hasAnySubscription(db: DB, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
  return !!row;
}

export async function activeUserIds(db: DB): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.active, true));
  return rows.map((r) => r.id);
}
