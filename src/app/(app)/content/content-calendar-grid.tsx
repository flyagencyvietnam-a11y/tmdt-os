"use client";

import { format, getDay, parse, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import * as React from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { colorForBrand } from "./content-colors";

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
  event: "Content",
  noEventsInRange: "Không có content trong khoảng này.",
  showMore: (total: number) => `+${total} nữa`,
};

export interface ContentCalendarRow {
  id: string;
  brandId: string;
  /** Mọi brand, nối bằng " · " — chỉ để hiển thị. */
  brandCode: string;
  /** Brand chính — quyết định màu ô. */
  primaryBrandCode: string;
  /** Mọi kênh, nối bằng ", ". */
  channel: string;
  late?: boolean;
  topic: string;
  status: string;
  publishDate: string;
}

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  item: ContentCalendarRow;
}

export function ContentCalendarGrid({
  items,
  brandColorIndex,
  onSelect,
}: {
  items: ContentCalendarRow[];
  brandColorIndex: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = React.useState<View>("month");
  const [date, setDate] = React.useState(new Date());

  const events: CalEvent[] = React.useMemo(
    () =>
      items.map((i) => {
        const d = new Date(`${i.publishDate}T00:00:00`);
        return { id: i.id, title: `${i.late ? "⚠ " : ""}${i.topic} · ${i.channel}`, start: d, end: d, allDay: true, item: i };
      }),
    [items],
  );

  return (
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
        views={["month", "week", "agenda"]}
        culture="vi"
        messages={MESSAGES}
        popup
        onSelectEvent={(e: CalEvent) => onSelect(e.id)}
        eventPropGetter={(e: CalEvent) => {
          const color = TAG_BG[colorForBrand(e.item.primaryBrandCode, brandColorIndex[e.item.brandId] ?? 0)];
          return {
            style: {
              backgroundColor: color,
              borderRadius: 4,
              border: e.item.late ? "2px solid #dc2626" : "none",
              fontSize: 12,
              opacity: e.item.status === "published" ? 0.65 : 1,
              textDecoration: e.item.status === "cancelled" ? "line-through" : undefined,
            },
          };
        }}
      />
    </div>
  );
}

/** Màu nền hex khớp với bảng TagColor của data-grid (dùng cho react-big-calendar, chỉ nhận style thô). */
const TAG_BG: Record<string, string> = {
  slate: "#64748b",
  gray: "#6b7280",
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  yellow: "#ca8a04",
  lime: "#65a30d",
  green: "#16a34a",
  emerald: "#059669",
  teal: "#0d9488",
  cyan: "#0891b2",
  sky: "#0284c7",
  blue: "#2563eb",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  purple: "#9333ea",
  pink: "#db2777",
  rose: "#e11d48",
};
