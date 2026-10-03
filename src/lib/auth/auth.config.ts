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
        const u = user as {
          id: string;
          role: Role;
          fullName: string;
          mustChangePassword: boolean;
          canAssign: boolean;
          sbuId: string | null;
        };
        token.id = u.id;
        token.role = u.role;
        token.fullName = u.fullName;
        token.mustChangePassword = u.mustChangePassword;
        token.canAssign = u.canAssign;
        token.sbuId = u.sbuId;
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
        session.user.canAssign = token.canAssign as boolean;
        session.user.sbuId = (token.sbuId as string | null) ?? null;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isAuthed = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        pathname === "/api/cron" || // tự bảo vệ bằng CRON_SECRET (Vercel Cron gọi, không có session)
        pathname.startsWith("/xac-nhan") || // magic link không đăng nhập — SPEC Mục 3.3/11.4
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico";
      if (isPublic) return true;
      return isAuthed;
    },
  },
} satisfies NextAuthConfig;
