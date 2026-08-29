"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const roleSchema = z.enum(["ADMIN", "MANAGER", "MARKETING", "EC", "VIEWER"]);

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  jobTitle: z.string().min(2),
  role: roleSchema,
  aliasNames: z.string().optional(),
});

function randomTempPassword() {
  return `Vmg@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
}

export async function createUser(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = createSchema.safeParse({
    email: fd.get("email"),
    fullName: fd.get("fullName"),
    jobTitle: fd.get("jobTitle"),
    role: fd.get("role"),
    aliasNames: fd.get("aliasNames"),
  });
  if (!parsed.success) return { error: "Dữ liệu không hợp lệ." };
  const d = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, d.email.toLowerCase().trim()))
    .limit(1);
  if (existing.length) return { error: "Email đã tồn tại." };

  const tempPassword = randomTempPassword();
  const [row] = await db
    .insert(users)
    .values({
      email: d.email.toLowerCase().trim(),
      fullName: d.fullName.trim(),
      jobTitle: d.jobTitle.trim(),
      role: d.role,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
      aliasNames: d.aliasNames
        ? d.aliasNames.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    })
    .returning({ id: users.id });

  await writeAudit(db, {
    actorId: admin.id,
    entity: "users",
    entityId: row.id,
    action: "CREATE",
    changes: { email: { from: null, to: d.email }, role: { from: null, to: d.role } },
  });
  revalidatePath("/nguoi-dung");
  return { ok: true, tempPassword };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(2),
  jobTitle: z.string().min(2),
  role: roleSchema,
});

export async function updateUser(fd: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = updateSchema.safeParse({
    id: fd.get("id"),
    fullName: fd.get("fullName"),
    jobTitle: fd.get("jobTitle"),
    role: fd.get("role"),
  });
  if (!parsed.success) return { error: "Dữ liệu không hợp lệ." };
  const d = parsed.data;

  const [before] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
  if (!before) return { error: "Không tìm thấy người dùng." };

  await db
    .update(users)
    .set({ fullName: d.fullName.trim(), jobTitle: d.jobTitle.trim(), role: d.role })
    .where(eq(users.id, d.id));

  await writeAudit(db, {
    actorId: admin.id,
    entity: "users",
    entityId: d.id,
    action: "UPDATE",
    changes: {
      fullName: { from: before.fullName, to: d.fullName },
      role: { from: before.role, to: d.role },
    },
  });
  revalidatePath("/nguoi-dung");
  return { ok: true };
}

export async function setUserActive(id: string, isActive: boolean) {
  const admin = await requireRole("ADMIN");
  if (id === admin.id) return { error: "Không thể tự khóa tài khoản của mình." };
  await db.update(users).set({ isActive }).where(eq(users.id, id));
  await writeAudit(db, {
    actorId: admin.id,
    entity: "users",
    entityId: id,
    action: "UPDATE",
    changes: { isActive: { from: !isActive, to: isActive } },
  });
  revalidatePath("/nguoi-dung");
  return { ok: true };
}

export async function resetUserPassword(id: string) {
  const admin = await requireRole("ADMIN");
  const tempPassword = randomTempPassword();
  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, id));
  await writeAudit(db, {
    actorId: admin.id,
    entity: "users",
    entityId: id,
    action: "UPDATE",
    changes: { passwordHash: { from: "***", to: "reset" } },
  });
  return { ok: true, tempPassword };
}
