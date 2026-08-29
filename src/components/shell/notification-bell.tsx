"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/actions";

export interface NotifItem {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({
  items,
  unread,
}: {
  items: NotifItem[];
  unread: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "relative",
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await markAllNotificationsReadAction();
                  router.refresh();
                })
              }
            >
              Đánh dấu đã đọc hết
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Chưa có thông báo.
            </p>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              className={cn(
                "block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-muted/40",
                !n.readAt && "bg-brand/5",
              )}
              onClick={() =>
                start(async () => {
                  if (!n.readAt) await markNotificationReadAction(n.id);
                  if (n.linkUrl) router.push(n.linkUrl);
                  else router.refresh();
                })
              }
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    n.severity === "CRITICAL"
                      ? "bg-crit"
                      : n.severity === "WARNING"
                        ? "bg-warn"
                        : "bg-muted-foreground",
                  )}
                />
                <span className="flex-1 text-sm font-medium">{n.title}</span>
              </div>
              {n.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {n.body}
                </p>
              )}
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {fmtDateTime(n.createdAt)}
              </p>
            </button>
          ))}
        </div>
        <div className="border-t px-3 py-2 text-center">
          <Link href="/thong-bao" className="text-xs text-brand hover:underline">
            Xem tất cả
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
