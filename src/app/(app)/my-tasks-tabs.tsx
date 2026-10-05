"use client";

import { CalendarDays, Columns3, LayoutList } from "lucide-react";
import * as React from "react";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";
import type { TaskItem } from "./task/task-board";
import { TaskCalendar } from "./task/task-calendar";
import { TaskKanban } from "./task/task-kanban";

type Tab = "list" | "kanban" | "calendar";

/**
 * "Việc của tôi": cùng bộ 3 cách xem như trang Tất cả task — Danh sách (các nhóm Hôm nay/Sắp tới/…),
 * Kanban kéo-thả và Lịch. Cách xem đang chọn được nhớ theo tab trình duyệt.
 */
export function MyTasksTabs({ list, tasks, userName, today, icsUrl }: { list: React.ReactNode; tasks: TaskItem[]; userName: string; today: string; icsUrl?: string }) {
  const [tab, setTab] = useSessionState<Tab>("home:tab", "list");
  const tabs: [Tab, string, React.ComponentType<{ className?: string }>][] = [
    ["list", "Danh sách", LayoutList],
    ["kanban", "Kanban", Columns3],
    ["calendar", "Lịch", CalendarDays],
  ];
  return (
    <div className="space-y-4">
      <div className="flex rounded-lg bg-muted p-0.5 text-sm sm:w-fit">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors", tab === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === "list" && list}
      {tab === "kanban" && <TaskKanban tasks={tasks} userName={() => userName} today={today} />}
      {tab === "calendar" && <TaskCalendar tasks={tasks} icsUrl={icsUrl} />}
    </div>
  );
}
