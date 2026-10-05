import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { monitoringItems, requests, sbuCatalogItems, sbuItemStatus, taskSbus, tasks } from "@/lib/db/schema";
import { overdueSqlFragment } from "./tasks";
import { computeAlert } from "./monitoring";

export interface SbuStats {
  campaigns: number;
  taskTotal: number;
  taskDone: number;
  taskOverdue: number;
  /** Hạng mục SBU (ma trận) của kỳ hiện tại: số đã xong / số hạng mục áp dụng cho SBU. */
  itemsDone: number;
  itemsApplicable: number;
  requestsOpen: number;
  monitoringTotal: number;
  monitoringOverdue: number;
  monitoringDueSoon: number;
}

const EMPTY: SbuStats = {
  campaigns: 0,
  taskTotal: 0,
  taskDone: 0,
  taskOverdue: 0,
  itemsDone: 0,
  itemsApplicable: 0,
  requestsOpen: 0,
  monitoringTotal: 0,
  monitoringOverdue: 0,
  monitoringDueSoon: 0,
};

/**
 * Chỉ số tổng quan cho từng SBU (danh sách SBU): campaign liên quan, tiến độ task, hạng mục SBU kỳ này,
 * request đang mở, cảnh báo giám sát. Mọi con số suy ra tại truy vấn — không lưu cột.
 */
export async function getSbuStats(db: DB, today: string): Promise<{ stats: Map<string, SbuStats>; catalogCount: number }> {
  const period = today.slice(0, 7);
  const [taskRows, itemRows, [{ catalogCount }], reqRows, monRows] = await Promise.all([
    db
      .select({
        sbuId: taskSbus.sbuId,
        campaigns: sql<number>`count(distinct ${tasks.campaignId})::int`,
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${tasks.status} in ('done','cancelled')))::int`,
        overdue: sql<number>`(count(*) filter (where ${overdueSqlFragment(today)}))::int`,
      })
      .from(taskSbus)
      .innerJoin(tasks, eq(tasks.id, taskSbus.taskId))
      .where(and(isNull(tasks.deletedAt), isNull(tasks.archivedAt)))
      .groupBy(taskSbus.sbuId),
    db
      .select({
        sbuId: sbuItemStatus.sbuId,
        done: sql<number>`(count(*) filter (where ${sbuItemStatus.status} = 'done'))::int`,
        na: sql<number>`(count(*) filter (where ${sbuItemStatus.status} = 'not_applicable'))::int`,
      })
      .from(sbuItemStatus)
      .where(eq(sbuItemStatus.period, period))
      .groupBy(sbuItemStatus.sbuId),
    db.select({ catalogCount: sql<number>`count(*)::int` }).from(sbuCatalogItems),
    db
      .select({ sbuId: requests.requesterSbuId, n: sql<number>`count(*)::int` })
      .from(requests)
      .where(and(isNull(requests.deletedAt), sql`${requests.status} not in ('done','rejected')`))
      .groupBy(requests.requesterSbuId),
    db.select().from(monitoringItems),
  ]);

  const out = new Map<string, SbuStats>();
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) {
      s = { ...EMPTY };
      out.set(id, s);
    }
    return s;
  };
  for (const r of taskRows) {
    const s = get(r.sbuId);
    s.campaigns = Number(r.campaigns);
    s.taskTotal = Number(r.total);
    s.taskDone = Number(r.done);
    s.taskOverdue = Number(r.overdue);
  }
  for (const r of itemRows) {
    const s = get(r.sbuId);
    s.itemsDone = Number(r.done);
    s.itemsApplicable = Math.max(0, Number(catalogCount) - Number(r.na));
  }
  for (const r of reqRows) if (r.sbuId) get(r.sbuId).requestsOpen = Number(r.n);
  for (const m of monRows) {
    const s = get(m.sbuId);
    s.monitoringTotal++;
    const a = computeAlert(m, today);
    if (a === "overdue") s.monitoringOverdue++;
    else if (a === "due_soon") s.monitoringDueSoon++;
  }
  // SBU chưa có dòng trạng thái hạng mục nào: toàn bộ hạng mục coi là "chưa làm".
  for (const s of out.values()) if (s.itemsApplicable === 0 && Number(catalogCount) > 0) s.itemsApplicable = Number(catalogCount);
  return { stats: out, catalogCount: Number(catalogCount) };
}

export function emptySbuStats(catalogCount = 0): SbuStats {
  return { ...EMPTY, itemsApplicable: catalogCount };
}
