"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { unstable_update } from "@/lib/auth/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function changePassword(
  fd: FormData,
): Promise<{ error?: string } | void> {
  const user = await getCurrentUser();
  if (!user) return { error: "Phiên đăng nhập đã hết hạn." };

  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  if (next.length < 8) return { error: "Mật khẩu mới phải từ 8 ký tự." };
  if (next !== confirm) return { error: "Hai lần nhập mật khẩu không khớp." };

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) return { error: "Không tìm thấy tài khoản." };

  const ok = await bcrypt.compare(current, row.passwordHash);
  if (!ok) return { error: "Mật khẩu hiện tại không đúng." };

  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(next, 12),
      mustChangePassword: false,
    })
    .where(eq(users.id, user.id));

  await writeAudit(db, {
    actorId: user.id,
    entity: "users",
    entityId: user.id,
    action: "UPDATE",
    changes: { passwordHash: { from: "***", to: "***" } },
  });

  // Cập nhật JWT để requireUser() không còn bắt đổi mật khẩu.
  await unstable_update({ mustChangePassword: false } as unknown as Record<
    string,
    unknown
  >);
}
