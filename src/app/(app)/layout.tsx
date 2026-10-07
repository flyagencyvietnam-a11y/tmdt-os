import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listNotificationsWithUnread } from "@/lib/services/notifications";
import { NotificationBell } from "@/components/shell/notification-bell";
import { BrandMark, MobileNav, SidebarNav } from "@/components/shell/sidebar-nav";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /** Slot popup (@modal) — Task/Campaign/SBU mở dạng popup đè lên trang hiện tại. */
  modal: React.ReactNode;
}) {
  const user = await requireUser();

  let notifItems: Awaited<ReturnType<typeof listNotificationsWithUnread>>["items"] = [];
  let unread = 0;
  try {
    ({ items: notifItems, unread } = await listNotificationsWithUnread(db, user.id, 12));
  } catch {
    // DB chưa sẵn sàng — vẫn render shell
  }

  return (
    <div className="flex min-h-full flex-1 bg-muted/40">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandMark />
        </div>
        <SidebarNav role={user.role} />
        <div className="border-t px-4 py-3">
          <div className="truncate text-sm font-medium">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-backdrop-filter:bg-background/70 md:px-6">
          <MobileNav role={user.role} />
          <div className="md:hidden">
            <BrandMark />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell
              unread={unread}
              items={notifItems.map((n) => ({
                id: n.id,
                kind: n.kind,
                title: n.title,
                body: n.body,
                taskId: n.taskId,
                readAt: n.readAt ? n.readAt.toISOString() : null,
                createdAt: n.createdAt.toISOString(),
              }))}
            />
            <UserMenu fullName={user.fullName} email={user.email} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6">{children}</main>
        {modal}
      </div>
    </div>
  );
}
