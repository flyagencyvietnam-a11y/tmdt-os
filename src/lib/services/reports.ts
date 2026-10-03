import { and, desc, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  campaigns,
  recurringRules,
  reportExports,
  requests,
  sbuCatalogItems,
  sbuItemStatus,
  sbus,
  tasks,
  users,
  type ReportExport,
} from "@/lib/db/schema";
import { buildXlsx, type XlsxSheetSpec } from "@/lib/export-xlsx";
import { overdueSqlFragment } from "./tasks";
import { getManagerIds, notifyMany } from "./notifications";
import { monthBounds, todayVnDayStr } from "@/lib/time";

/** SPEC Mục 12.2/12.3 — các chỉ số Dashboard quản lý, dùng chung cho trang /bao-cao và báo cáo xuất định kỳ. */
export async function computeManagementMetrics(db: DB, period: string) {
  const today = todayVnDayStr();

  const overdueRows = await db
    .select({ assigneeId: tasks.assigneeId, title: tasks.title, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), overdueSqlFragment(today)));
  const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);
  const userName = (id: string | null) => allUsers.find((u) => u.id === id)?.fullName ?? "(chưa giao)";
  const overdueByPersonMap = new Map<string, number>();
  for (const r of overdueRows) {
    const name = userName(r.assigneeId);
    overdueByPersonMap.set(name, (overdueByPersonMap.get(name) ?? 0) + 1);
  }
  const overdueByPerson = [...overdueByPersonMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const campaignRows = await db.select().from(campaigns).where(isNull(campaigns.deletedAt));
  const campaignProgress: { code: string; name: string; status: string; total: number; done: number; overdue: number; pctDone: number }[] = [];
  for (const c of campaignRows) {
    const cTasks = await db.select({ status: tasks.status, dueDate: tasks.dueDate }).from(tasks).where(and(eq(tasks.campaignId, c.id), isNull(tasks.deletedAt)));
    const total = cTasks.length;
    const done = cTasks.filter((t) => t.status === "done" || t.status === "cancelled").length;
    const overdue = cTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "cancelled").length;
    campaignProgress.push({ code: c.code, name: c.name, status: c.status, total, done, overdue, pctDone: total ? Math.round((done / total) * 100) : 0 });
  }

  const allSbus = await db.select().from(sbus).where(eq(sbus.active, true));
  const allCatalog = await db.select({ id: sbuCatalogItems.id }).from(sbuCatalogItems);
  const statuses = await db.select().from(sbuItemStatus).where(eq(sbuItemStatus.period, period));
  const sbuRows: { code: string; name: string; totalCatalogItems: number; done: number; pctDone: number }[] = [];
  for (const s of allSbus) {
    const mine = statuses.filter((st) => st.sbuId === s.id);
    const done = mine.filter((st) => st.status === "done").length;
    sbuRows.push({
      code: s.code,
      name: s.name,
      totalCatalogItems: allCatalog.length,
      done,
      pctDone: allCatalog.length ? Math.round((done / allCatalog.length) * 100) : 0,
    });
  }

  const requestRows = await db.select({ status: requests.status, receivedDate: requests.receivedDate, completedDate: requests.completedDate }).from(requests).where(isNull(requests.deletedAt));
  const requestStats = {
    total: requestRows.length,
    new: requestRows.filter((r) => r.status === "new").length,
    inProgress: requestRows.filter((r) => r.status === "in_progress" || r.status === "accepted" || r.status === "in_review").length,
    done: requestRows.filter((r) => r.status === "done").length,
    overdue: requestRows.filter((r) => r.status !== "done" && r.status !== "rejected" && r.receivedDate < today).length,
  };

  // Tỷ lệ đúng hạn (Mục 12.3) — trong tháng của `period` (YYYY-MM), theo người và theo loại task.
  const [monthStart, monthEnd] = monthBounds(`${period}-01`);
  const doneThisMonth = await db
    .select({ assigneeId: tasks.assigneeId, type: tasks.type, dueDate: tasks.dueDate, completedAt: tasks.completedAt, recurringRuleId: tasks.recurringRuleId })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), eq(tasks.status, "done")));
  const inMonth = doneThisMonth.filter((t) => t.completedAt && todayVnDayStr(t.completedAt) >= monthStart && todayVnDayStr(t.completedAt) <= monthEnd);
  const onTime = (t: (typeof inMonth)[number]) => !t.dueDate || !t.completedAt || todayVnDayStr(t.completedAt) <= t.dueDate;

  const onTimeByPersonMap = new Map<string, { total: number; onTime: number }>();
  const onTimeByTypeMap = new Map<string, { total: number; onTime: number }>();
  for (const t of inMonth) {
    const pKey = userName(t.assigneeId);
    const pAgg = onTimeByPersonMap.get(pKey) ?? { total: 0, onTime: 0 };
    pAgg.total++;
    if (onTime(t)) pAgg.onTime++;
    onTimeByPersonMap.set(pKey, pAgg);

    const tAgg = onTimeByTypeMap.get(t.type) ?? { total: 0, onTime: 0 };
    tAgg.total++;
    if (onTime(t)) tAgg.onTime++;
    onTimeByTypeMap.set(t.type, tAgg);
  }
  const onTimeByPerson = [...onTimeByPersonMap.entries()].map(([name, a]) => ({ name, total: a.total, pct: a.total ? Math.round((a.onTime / a.total) * 100) : 0 }));
  const onTimeByType = [...onTimeByTypeMap.entries()].map(([type, a]) => ({ type, total: a.total, pct: a.total ? Math.round((a.onTime / a.total) * 100) : 0 }));

  const recurringDone = inMonth.filter((t) => t.recurringRuleId);
  const allRules = await db.select({ id: recurringRules.id, name: recurringRules.name }).from(recurringRules);
  const recurringByRuleMap = new Map<string, { total: number; onTime: number }>();
  for (const t of recurringDone) {
    const agg = recurringByRuleMap.get(t.recurringRuleId!) ?? { total: 0, onTime: 0 };
    agg.total++;
    if (onTime(t)) agg.onTime++;
    recurringByRuleMap.set(t.recurringRuleId!, agg);
  }
  const recurringOnTime = [...recurringByRuleMap.entries()].map(([ruleId, a]) => ({
    ruleName: allRules.find((r) => r.id === ruleId)?.name ?? ruleId,
    total: a.total,
    pct: a.total ? Math.round((a.onTime / a.total) * 100) : 0,
  }));

  return { overdueByPerson, campaignProgress, sbuRows, requestStats, onTimeByPerson, onTimeByType, recurringOnTime };
}

export type ManagementMetrics = Awaited<ReturnType<typeof computeManagementMetrics>>;

/**
 * SPEC Mục 12.2/12.3 + 14.4 "Báo cáo xuất định kỳ" (Phase 3) — gộp các chỉ số
 * Dashboard quản lý thành 1 workbook, lưu vào `report_exports` (không có kho
 * lưu trữ ngoài ở đợt này — Mục 13.2) để tải lại sau, kèm thông báo cho quản lý.
 */
export async function generatePeriodicReport(
  db: DB,
  kind: ReportExport["kind"],
  period: string,
  actorId: string | null = null,
): Promise<ReportExport> {
  const { overdueByPerson, campaignProgress, sbuRows, requestStats, onTimeByPerson, onTimeByType, recurringOnTime } = await computeManagementMetrics(db, period);

  const sheets: XlsxSheetSpec[] = [
    {
      name: "Trễ hạn theo người",
      columns: [
        { header: "Người phụ trách", key: "name", width: 24 },
        { header: "Số task trễ", key: "count", width: 14 },
      ],
      rows: overdueByPerson,
    },
    {
      name: "Tiến độ campaign",
      columns: [
        { header: "Mã", key: "code", width: 14 },
        { header: "Tên", key: "name", width: 28 },
        { header: "Trạng thái", key: "status", width: 14 },
        { header: "Tổng task", key: "total", width: 10 },
        { header: "Đã xong", key: "done", width: 10 },
        { header: "Trễ hạn", key: "overdue", width: 10 },
        { header: "% xong", key: "pctDone", width: 10 },
      ],
      rows: campaignProgress,
    },
    {
      name: "Ma trận SBU",
      columns: [
        { header: "Mã SBU", key: "code", width: 12 },
        { header: "Tên", key: "name", width: 24 },
        { header: "Tổng hạng mục", key: "totalCatalogItems", width: 14 },
        { header: "Đã xong", key: "done", width: 10 },
        { header: "% xong", key: "pctDone", width: 10 },
      ],
      rows: sbuRows,
    },
    {
      name: "Request",
      columns: [
        { header: "Chỉ số", key: "label", width: 20 },
        { header: "Giá trị", key: "value", width: 12 },
      ],
      rows: [
        { label: "Tổng", value: requestStats.total },
        { label: "Mới", value: requestStats.new },
        { label: "Đang xử lý", value: requestStats.inProgress },
        { label: "Đã xong", value: requestStats.done },
        { label: "Trễ hạn", value: requestStats.overdue },
      ],
    },
    {
      name: "Tỷ lệ đúng hạn theo người",
      columns: [
        { header: "Người phụ trách", key: "name", width: 24 },
        { header: "Tổng task done trong kỳ", key: "total", width: 20 },
        { header: "% đúng hạn", key: "pct", width: 14 },
      ],
      rows: onTimeByPerson,
    },
    {
      name: "Tỷ lệ đúng hạn theo loại",
      columns: [
        { header: "Loại task", key: "type", width: 20 },
        { header: "Tổng task done trong kỳ", key: "total", width: 20 },
        { header: "% đúng hạn", key: "pct", width: 14 },
      ],
      rows: onTimeByType,
    },
    {
      name: "Việc lặp đúng hạn",
      columns: [
        { header: "Quy tắc", key: "ruleName", width: 28 },
        { header: "Tổng lần hoàn thành trong kỳ", key: "total", width: 22 },
        { header: "% đúng hạn", key: "pct", width: 14 },
      ],
      rows: recurringOnTime,
    },
  ];

  const buf = await buildXlsx(sheets);
  const fileName = `${kind}-${period}.xlsx`;
  const [row] = await db
    .insert(reportExports)
    .values({
      kind,
      period,
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dataBase64: buf.toString("base64"),
      createdBy: actorId,
    })
    .returning();

  const managers = await getManagerIds(db);
  await notifyMany(db, managers, {
    kind: "digest_weekly",
    title: `Báo cáo định kỳ đã sẵn sàng: ${fileName}`,
    body: `Xem/tải tại Cài đặt → Báo cáo đã xuất.`,
    dedupeKey: `report-export:${row.id}`,
  });

  return row;
}

export async function listReportExports(db: DB, limit = 30) {
  return db
    .select({ id: reportExports.id, kind: reportExports.kind, period: reportExports.period, fileName: reportExports.fileName, createdAt: reportExports.createdAt })
    .from(reportExports)
    .orderBy(desc(reportExports.createdAt))
    .limit(limit);
}
