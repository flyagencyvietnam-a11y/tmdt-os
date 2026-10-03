"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const roleSchema = z.enum(["admin", "manager", "member", "center_contributor", "viewer"]);

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  role: roleSchema,
  sbuId: z.string().uuid().optional().or(z.literal("")),
  canAssign: z.enum(["on"]).optional(),
});

function randomTempPassword() {
  return `Vmg@${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;
}

export async function createUser(fd: FormData) {
  const admin = await requireRole("admin");
  const parsed = createSchema.safeParse({
    email: fd.get("email"),
    fullName: fd.get("fullName"),
    role: fd.get("role"),
    sbuId: fd.get("sbuId") ?? "",
    canAssign: fd.get("canAssign") ?? undefined,
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
      role: d.role,
      sbuId: d.sbuId || null,
      canAssign: d.canAssign === "on",
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
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
  role: roleSchema,
  sbuId: z.string().uuid().optional().or(z.literal("")),
  canAssign: z.enum(["on"]).optional(),
});

export async function updateUser(fd: FormData) {
  const admin = await requireRole("admin");
  const parsed = updateSchema.safeParse({
    id: fd.get("id"),
    fullName: fd.get("fullName"),
    role: fd.get("role"),
    sbuId: fd.get("sbuId") ?? "",
    canAssign: fd.get("canAssign") ?? undefined,
  });
  if (!parsed.success) return { error: "Dữ liệu không hợp lệ." };
  const d = parsed.data;

  const [before] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
  if (!before) return { error: "Không tìm thấy người dùng." };

  await db
    .update(users)
    .set({
      fullName: d.fullName.trim(),
      role: d.role,
      sbuId: d.sbuId || null,
      canAssign: d.canAssign === "on",
    })
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

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireRole("admin");
  if (id === admin.id) return { error: "Không thể tự khóa tài khoản của mình." };
  await db.update(users).set({ active }).where(eq(users.id, id));
  await writeAudit(db, {
    actorId: admin.id,
    entity: "users",
    entityId: id,
    action: "UPDATE",
    changes: { active: { from: !active, to: active } },
  });
  revalidatePath("/nguoi-dung");
  return { ok: true };
}

export async function resetUserPassword(id: string) {
  const admin = await requireRole("admin");
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
