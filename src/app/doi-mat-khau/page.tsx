import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Đổi mật khẩu — VMG TMĐT OS" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">Đổi mật khẩu</h1>
          <p className="text-sm text-muted-foreground">
            {user.mustChangePassword
              ? "Đây là lần đăng nhập đầu — bắt buộc đặt mật khẩu mới."
              : "Đặt mật khẩu mới cho tài khoản của bạn."}
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
