import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

// Chạy ở edge — chỉ dùng authConfig (không DB/bcrypt). Next 16: file `proxy.ts`.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Bỏ qua static assets; còn lại đều qua auth.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
