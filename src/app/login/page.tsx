import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập — VMG TMĐT OS" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            VMG
          </div>
          <h1 className="text-lg font-semibold">TMĐT OS — Đăng nhập</h1>
          <p className="text-sm text-muted-foreground">
            Hệ thống quản trị vận hành Thương mại điện tử.
          </p>
        </div>
        <LoginForm />
        <p className="text-xs text-muted-foreground">
          Quên mật khẩu? Liên hệ Trưởng phòng để đặt lại.{" "}
          <Link href="/" className="underline">
            Về trang chủ
          </Link>
        </p>
      </div>
    </div>
  );
}
