import type { NextAuthConfig } from "next-auth";
import type { Role } from "./permissions";

/**
 * Cấu hình edge-safe (KHÔNG import DB / bcrypt) — dùng cho middleware.
 * Provider thật + authorize nằm ở auth.ts (Node runtime).
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12h — SPEC Mục 18.3
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: Role }).role;
        token.fullName = (user as { fullName: string }).fullName;
        token.mustChangePassword = (
          user as { mustChangePassword: boolean }
        ).mustChangePassword;
      }
      // Sau khi đổi mật khẩu thành công (server action gọi update()).
      if (trigger === "update" && session && "mustChangePassword" in session) {
        token.mustChangePassword = Boolean(session.mustChangePassword);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.fullName = token.fullName as string;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isAuthed = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico";
      if (isPublic) return true;
      return isAuthed;
    },
  },
} satisfies NextAuthConfig;
