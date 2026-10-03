import ExcelJS from "exceljs";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { tasks, users } from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";

const WEEKDAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

function weekdayIndex(dayStr: string): number {
  const d = new Date(`${dayStr}T00:00:00Z`).getUTCDay(); // 0=CN..6=T7
  return d === 0 ? 6 : d - 1; // 0=T2..6=CN
}

/**
 * SPEC Mục 10.5 (P2) — xuất lịch tuần gửi BOD: mỗi nhân sự 1 khối, dòng Thứ-ngày,
 * cột Sáng/Chiều, nguồn là `tasks.time_slot` trong tuần `mondayStr..mondayStr+6`.
 */
export async function buildBodWeeklyWorkbook(db: DB, mondayStr: string): Promise<Buffer> {
  const sunday = addDaysStr(mondayStr, 6);

  const activeUsers = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(eq(users.active, true));

  const weekTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      timeSlot: tasks.timeSlot,
      assigneeId: tasks.assigneeId,
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        gte(tasks.dueDate, mondayStr),
        lte(tasks.dueDate, sunday),
        inArray(tasks.status, ["todo", "in_progress", "in_review", "blocked"]),
      ),
    );

  const byUser = new Map<string, typeof weekTasks>();
  for (const t of weekTasks) {
    if (!t.assigneeId) continue;
    if (!byUser.has(t.assigneeId)) byUser.set(t.assigneeId, []);
    byUser.get(t.assigneeId)!.push(t);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Lịch tuần ${mondayStr}`);
  ws.columns = [
    { header: "", key: "day", width: 14 },
    { header: "Sáng", key: "morning", width: 40 },
    { header: "Chiều", key: "afternoon", width: 40 },
  ];

  let r = 1;
  for (const u of activeUsers) {
    const list = byUser.get(u.id) ?? [];
    if (!list.length) continue;

    ws.getCell(r, 1).value = u.fullName;
    ws.getCell(r, 1).font = { bold: true, size: 12 };
    ws.mergeCells(r, 1, r, 3);
    r++;

    const header = ws.getRow(r);
    header.values = ["", "Sáng", "Chiều"];
    header.font = { bold: true };
    r++;

    for (let d = 0; d < 7; d++) {
      const dayStr = addDaysStr(mondayStr, d);
      const morning = list.filter((t) => t.dueDate === dayStr && (t.timeSlot === "morning" || t.timeSlot === "all_day")).map((t) => t.title);
      const afternoon = list.filter((t) => t.dueDate === dayStr && (t.timeSlot === "afternoon" || t.timeSlot === "all_day")).map((t) => t.title);
      ws.getRow(r).values = [`${WEEKDAY_LABELS[weekdayIndex(dayStr)]} ${dayStr.slice(8, 10)}/${dayStr.slice(5, 7)}`, morning.join("; "), afternoon.join("; ")];
      r++;
    }
    r++; // dòng trống giữa các khối
  }

  if (r === 1) {
    ws.getCell(1, 1).value = "Không có task nào có time_slot trong tuần này.";
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
