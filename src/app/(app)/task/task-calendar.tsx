"use client";

import { format, getDay, parse, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import type { TaskItem } from "./task-board";

const locales = { vi };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const MESSAGES = {
  today: "Hôm nay",
  previous: "←",
  next: "→",
  month: "Tháng",
  week: "Tuần",
  day: "Ngày",
  agenda: "Danh sách",
  date: "Ngày",
  time: "Giờ",
  event: "Task",
  noEventsInRange: "Không có task trong khoảng này.",
  showMore: (total: number) => `+${total} nữa`,
};

const STATUS_BG: Record<string, string> = {
  todo: "#64748b",
  in_progress: "#2563eb",
  in_review: "#d97706",
  blocked: "#dc2626",
  done: "#059669",
  cancelled: "#9ca3af",
};

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  task: TaskItem;
}

export function TaskCalendar({ tasks }: { tasks: TaskItem[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<View>("month");
  const [date, setDate] = React.useState(new Date());

  const events: CalEvent[] = React.useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate)
        .map((t) => {
          const d = new Date(`${t.dueDate}T00:00:00`);
          return { id: t.id, title: t.title, start: d, end: d, allDay: true, task: t };
        }),
    [tasks],
  );

  return (
    <div className="rounded-md border bg-background p-2" style={{ height: 650 }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        views={["month", "week", "day", "agenda"]}
        culture="vi"
        messages={MESSAGES}
        popup
        onSelectEvent={(e) => router.push(`/task/${e.id}`)}
        eventPropGetter={(e: CalEvent) => ({
          style: {
            backgroundColor: STATUS_BG[e.task.status] ?? "#64748b",
            borderRadius: 4,
            border: "none",
            opacity: e.task.status === "done" || e.task.status === "cancelled" ? 0.6 : 1,
          },
        })}
      />
    </div>
  );
}
