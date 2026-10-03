import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { taskConfirmationTokens } from "@/lib/db/schema";

/** SPEC Mục 3.3 / 11.4 — liên kết ký số một lần, hết hạn 7 ngày, dùng 1 lần. */
export async function createConfirmationToken(
  db: DB,
  taskId: string,
  recipient: { email?: string; name?: string },
) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);
  await db.insert(taskConfirmationTokens).values({
    taskId,
    token,
    recipientEmail: recipient.email ?? null,
    recipientName: recipient.name ?? null,
    expiresAt,
  });
  return token;
}

export async function getConfirmationToken(db: DB, token: string) {
  const [row] = await db.select().from(taskConfirmationTokens).where(eq(taskConfirmationTokens.token, token)).limit(1);
  return row ?? null;
}

export async function consumeConfirmationToken(db: DB, token: string) {
  await db.update(taskConfirmationTokens).set({ usedAt: new Date() }).where(eq(taskConfirmationTokens.token, token));
}
