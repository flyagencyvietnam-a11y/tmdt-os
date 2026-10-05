"use client";

import { format, getDay, parse, startOfWeek } from "date-fns";
import { useSessionState } from "@/lib/use-session-state";
import { vi } from "date-fns/locale";
import { Link as LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Button } from "@/components/ui/button";
import type { TaskItem } from "./task-board";
import { EVENT_TONE_COLOR, taskTone } from "./task-style";
import { todayVnDayStr } from "@/lib/time";

const locales = { vi };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const FORMATS = {
  agendaDateFormat: (d: Date) => format(d, "EEE dd/MM/yyyy", { locale: vi }),
  dayHeaderFormat: (d: Date) => format(d, "EEEE dd/MM/yyyy", { locale: vi }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) => `${format(start, "dd/MM/yyyy")} – ${format(end, "dd/MM/yyyy")}`,
  monthHeaderFormat: (d: Date) => format(d, "'Tháng' MM/yyyy"),
};

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

export function TaskCalendar({ tasks, icsUrl }: { tasks: TaskItem[]; icsUrl?: string }) {
  const router = useRouter();
  const [view, setView] = useSessionState<View>("cal:task:view", "month");
  const [dateIso, setDateIso] = useSessionState<string>("cal:task:date", "");
  const date = React.useMemo(() => (dateIso ? new Date(dateIso) : new Date()), [dateIso]);
  const setDate = React.useCallback((d: Date) => setDateIso(d.toISOString()), [setDateIso]);
  const today = todayVnDayStr();

  const events: CalEvent[] = React.useMemo(
    () =>
      tasks
        .filter((t) => t.dueDate)
        .map((t) => {
          const d = new Date(`${t.dueDate}T00:00:00`);
          const tone = taskTone(t, today);
          const prefix = tone === "overdue" ? "⚠ " : t.sourceType === "recurring" ? "↻ " : "";
          return { id: t.id, title: prefix + t.title, start: d, end: d, allDay: true, task: t };
        }),
    [tasks, today],
  );

  return (
    <div className="space-y-2">
      {icsUrl && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const full = `${window.location.origin}${icsUrl}`;
              navigator.clipboard.writeText(full).then(
                () => toast.success("Đã sao chép link — dán vào Google Calendar › Thêm lịch › Từ URL."),
                () => toast.error("Không sao chép được link."),
              );
            }}
          >
            <LinkIcon className="mr-1 h-4 w-4" /> Lấy link đăng ký (ICS)
          </Button>
        </div>
      )}
      <div className="vmg-cal rounded-xl border bg-card p-3 shadow-xs" style={{ height: 700 }}>
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
        formats={FORMATS}
        popup
        onSelectEvent={(e) => router.push(`/task/${e.id}`)}
        eventPropGetter={(e: CalEvent) => ({
          style: {
            backgroundColor: (() => {
              const tone = taskTone(e.task, today);
              return tone === "normal" ? (STATUS_BG[e.task.status] ?? "#64748b") : EVENT_TONE_COLOR[tone];
            })(),
            borderRadius: 4,
            border: "none",
            opacity: e.task.status === "done" || e.task.status === "cancelled" ? 0.6 : 1,
          },
        })}
        />
      </div>
    </div>
  );
}
