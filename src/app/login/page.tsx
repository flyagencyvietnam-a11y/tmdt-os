import { BarChart3, CalendarCheck, ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập — VMG MKT OS" };

/** Chỉ chấp nhận đường dẫn nội bộ (chống open-redirect qua ?callbackUrl=https://...). */
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/";
  try {
    const u = new URL(raw, "http://local");
    const path = `${u.pathname}${u.search}${u.hash}`;
    if (u.origin !== "http://local" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.origin) && u.origin !== process.env.APP_URL) return "/";
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return "/";
    return path;
  } catch {
    return "/";
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const next = safeCallback(callbackUrl);
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[1fr_minmax(420px,520px)]">
      <aside className="relative hidden overflow-hidden bg-brand p-10 text-brand-foreground lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-black/10" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-xs font-bold text-brand">VMG</span>
          <span className="text-lg font-semibold">MKT OS</span>
        </div>
        <div className="relative mt-auto max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">Một nơi cho toàn bộ kế hoạch & công việc của Phòng Marketing.</h2>
          <ul className="space-y-3 text-sm text-white/85">
            <li className="flex items-center gap-3">
              <ClipboardList className="h-4 w-4 shrink-0" /> Task, việc lặp định kỳ, request từ trung tâm
            </li>
            <li className="flex items-center gap-3">
              <CalendarCheck className="h-4 w-4 shrink-0" /> Content calendar, quay chụp, campaign
            </li>
            <li className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 shrink-0" /> Số liệu Ads & báo cáo quản lý
            </li>
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-foreground lg:hidden">VMG</span>
            <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập</h1>
            <p className="text-sm text-muted-foreground">Hệ thống quản lý task &amp; kế hoạch Phòng Marketing VMG.</p>
          </div>
          <LoginForm next={next} />
          <p className="text-xs text-muted-foreground">Quên mật khẩu? Liên hệ Trưởng phòng để được đặt lại.</p>
        </div>
      </main>
    </div>
  );
}
