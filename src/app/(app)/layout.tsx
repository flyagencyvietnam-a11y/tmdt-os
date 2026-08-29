import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listNotifications, unreadCount } from "@/lib/services/notifications";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  let notifItems: Awaited<ReturnType<typeof listNotifications>> = [];
  let unread = 0;
  try {
    [notifItems, unread] = await Promise.all([
      listNotifications(db, user.id, { limit: 12 }),
      unreadCount(db, user.id),
    ]);
  } catch {
    // DB chưa sẵn sàng — vẫn render shell
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-bold text-brand-foreground">
            VMG
          </span>
          <span className="text-sm font-semibold">TMĐT OS</span>
        </div>
        <SidebarNav role={user.role} />
        <div className="border-t p-3">
          <div className="truncate text-sm font-medium">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="text-sm text-muted-foreground md:hidden">VMG TMĐT OS</div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell
              unread={unread}
              items={notifItems.map((n) => ({
                id: n.id,
                type: n.type,
                severity: n.severity,
                title: n.title,
                body: n.body,
                linkUrl: n.linkUrl,
                readAt: n.readAt ? n.readAt.toISOString() : null,
                createdAt: n.createdAt.toISOString(),
              }))}
            />
            <UserMenu fullName={user.fullName} email={user.email} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
