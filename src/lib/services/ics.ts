import { createHmac, timingSafeEqual } from "node:crypto";

/** SPEC Mục 8.3/10.5 — xuất lịch .ics đăng ký vào Google Calendar (chỉ due_date, không đồng bộ ngược). */

/**
 * Token đăng ký lịch ổn định cho 1 user, suy ra bằng HMAC (không cần bảng mới):
 * Google Calendar tải định kỳ URL này KHÔNG kèm cookie đăng nhập, nên cần 1
 * token xác thực riêng, nhưng không hết hạn như magic link xác nhận task
 * (Mục 3.3) — đây là một luồng khác (đọc lịch, không phải xác nhận task).
 */
export function calendarToken(userId: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`ics:${userId}`).digest("hex").slice(0, 32);
}

export function verifyCalendarToken(userId: string, token: string): boolean {
  const expected = calendarToken(userId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function foldLine(line: string): string {
  // RFC 5545: dòng > 75 octet phải gấp (fold) bằng CRLF + space. Đơn giản hoá cho chuỗi ASCII/UTF-8 ngắn.
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = " " + rest.slice(73);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function dateStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export interface IcsTaskInput {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  description?: string | null;
  code: string;
}

export function buildIcsCalendar(tasksIn: IcsTaskInput[], calendarName = "MKT OS — Việc của tôi"): string {
  const appUrl = process.env.APP_URL ?? "";
  const now = dateStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VMG MKT OS//Export ICS//VI",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const t of tasksIn) {
    if (!t.dueDate) continue;
    const ymd = t.dueDate.replace(/-/g, "");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:task-${t.id}@mkt-os.vmg.edu.vn`);
    lines.push(`DTSTAMP:${now}`);
    if (t.dueTime) {
      const hm = t.dueTime.slice(0, 5).replace(":", "");
      lines.push(`DTSTART;TZID=Asia/Ho_Chi_Minh:${ymd}T${hm}00`);
      lines.push(`DTEND;TZID=Asia/Ho_Chi_Minh:${ymd}T${hm}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`);
    }
    lines.push(foldLine(`SUMMARY:${escapeText(`${t.code} ${t.title}`)}`));
    if (t.description) lines.push(foldLine(`DESCRIPTION:${escapeText(t.description)}`));
    if (appUrl) lines.push(`URL:${appUrl}/task/${t.id}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
