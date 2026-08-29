import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authConfig } from "./auth.config";

// Chấp nhận email HOẶC tên đăng nhập ngắn (ví dụ "admin" cho tài khoản demo).
const credsSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase().trim()))
          .limit(1);
        if (!user || !user.isActive) return null;

        // Khóa tạm sau nhiều lần sai — SPEC Mục 18.3
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          const failed = (user.failedLoginCount ?? 0) + 1;
          await db
            .update(users)
            .set({
              failedLoginCount: failed,
              lockedUntil:
                failed >= MAX_FAILED
                  ? new Date(Date.now() + LOCK_MINUTES * 60_000)
                  : null,
            })
            .where(eq(users.id, user.id));
          return null;
        }

        await db
          .update(users)
          .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
          .where(eq(users.id, user.id));

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          fullName: user.fullName,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
