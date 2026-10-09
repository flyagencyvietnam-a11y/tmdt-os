import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { campaigns, contentItems, mediaDeliverables, mediaShoots, monitoringItems, requests, sbus, taskCollaborators, tasks } from "@/lib/db/schema";
import { isManagerLike, isStaff, type Role } from "@/lib/auth/permissions";
import { makeBadge, type NavBadges } from "@/lib/nav-badge";
import { isIncomplete, monitoringIssues } from "@/lib/monitoring-health";
import { todayVnDayStr } from "@/lib/time";
import { computeAlert } from "./monitoring";
import { overdueSqlFragment } from "./tasks";

/**
 * Badge "điểm nóng" trên menu, tính riêng cho từng tài khoản (layout gọi 1 lần mỗi lần render).
 * Quy tắc phạm vi chung: admin/manager thấy cả phòng, nhân sự (member) chỉ thấy phần của mình.
 * Mỗi mục là 1 truy vấn gọn; mục nào lỗi thì bỏ qua mục đó, không làm hỏng cả menu.
 */
export async function getNavBadges(db: DB, user: { id: string; role: Role }): Promise<NavBadges> {
  const today = todayVnDayStr();
  const wide = isManagerLike(user.role);
  const staff = isStaff(user.role);

  const safe = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

  const [mine, team, request, campaign, content, media, monitoring] = await Promise.all([
    safe(myTasks(db, user.id, today)),
    staff ? safe(teamTasks(db, user, wide, today)) : null,
    staff ? safe(requestBadge(db, user, wide, today)) : null,
    staff ? safe(campaignBadge(db, user, wide, today)) : null,
    staff ? safe(contentBadge(db, user, wide, today)) : null,
    staff ? safe(mediaBadge(db, user, wide, today)) : null,
    staff ? safe(monitoringBadge(db, user, wide, today)) : null,
  ]);

  const out: NavBadges = {};
  const put = (href: string, b: ReturnType<typeof makeBadge> | null | undefined) => {
    if (b) out[href] = b;
  };
  put("/", mine);
  put("/task", team);
  put("/request", request);
  put("/campaign", campaign);
  put("/content", content);
  put("/quay-chup", media);
  put("/giam-sat", monitoring);
  return out;
}

const OPEN_TASK = sql`${tasks.status} not in ('done','cancelled')`;

/** Việc của tôi: task giao cho tôi — quá hạn (đỏ) + đến hạn hôm nay (vàng). */
async function myTasks(db: DB, userId: string, today: string) {
  const [r] = await db
    .select({
      overdue: sql<number>`(count(*) filter (where ${overdueSqlFragment(today)}))::int`,
      dueToday: sql<number>`(count(*) filter (where ${OPEN_TASK} and ${tasks.dueDate} = ${today}))::int`,
    })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), isNull(tasks.archivedAt), eq(tasks.assigneeId, userId)));
  return makeBadge(r?.overdue ?? 0, r?.dueToday ?? 0, [
    [r?.overdue ?? 0, "quá hạn"],
    [r?.dueToday ?? 0, "đến hạn hôm nay"],
  ]);
}

/** Tất cả task: quản lý = quá hạn toàn phòng; nhân sự = quá hạn của việc tôi tham gia (không tính việc của chính tôi — đã ở "Việc của tôi"). */
async function teamTasks(db: DB, user: { id: string }, wide: boolean, today: string) {
  const scope = wide
    ? undefined
    : sql`exists (select 1 from ${taskCollaborators} where ${taskCollaborators.taskId} = ${tasks.id} and ${taskCollaborators.userId} = ${user.id}) and (${tasks.assigneeId} is distinct from ${user.id})`;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), isNull(tasks.archivedAt), overdueSqlFragment(today), scope));
  const n = r?.n ?? 0;
  return makeBadge(n, 0, [[n, wide ? "task quá hạn toàn phòng" : "task quá hạn bạn đang tham gia"]]);
}

/** Request: quá hạn (đỏ). Quản lý thấy cả phòng, nhân sự chỉ thấy request mình thực hiện. */
async function requestBadge(db: DB, user: { id: string; role: Role }, wide: boolean, today: string) {
  if (user.role === "center_contributor") return null;
  const open = notInArray(requests.status, ["done", "rejected", "postponed"]);
  const overdue = and(open, lt(requests.committedDate, today));
  const mineOnly = wide
    ? undefined
    : or(
        eq(requests.acceptedById, user.id),
        sql`exists (select 1 from ${tasks} where ${tasks.id} = ${requests.taskId} and ${tasks.assigneeId} = ${user.id})`,
      );
  const [r] = await db
    .select({ overdue: sql<number>`(count(*) filter (where ${overdue}))::int` })
    .from(requests)
    .where(and(isNull(requests.deletedAt), mineOnly));
  const o = r?.overdue ?? 0;
  return makeBadge(o, 0, [[o, "request quá hạn"]]);
}

/** Campaign: đã qua ngày kết thúc mà chưa đóng. */
async function campaignBadge(db: DB, user: { id: string }, wide: boolean, today: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(
      and(
        isNull(campaigns.deletedAt),
        notInArray(campaigns.status, ["done", "cancelled"]),
        lt(campaigns.endDate, today),
        wide ? undefined : eq(campaigns.ownerId, user.id),
      ),
    );
  const n = r?.n ?? 0;
  return makeBadge(n, 0, [[n, "campaign quá ngày kết thúc chưa đóng"]]);
}

/** Content: bài trễ lịch đăng (đỏ) + bài đến hạn đăng hôm nay mà chưa đăng (vàng). */
async function contentBadge(db: DB, user: { id: string }, wide: boolean, today: string) {
  const [r] = await db
    .select({
      late: sql<number>`(count(*) filter (where ${contentItems.publishDate} < ${today}))::int`,
      dueToday: sql<number>`(count(*) filter (where ${contentItems.publishDate} = ${today}))::int`,
    })
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.deletedAt),
        notInArray(contentItems.status, ["published", "cancelled"]),
        wide ? undefined : eq(contentItems.ownerId, user.id),
      ),
    );
  return makeBadge(r?.late ?? 0, r?.dueToday ?? 0, [
    [r?.late ?? 0, "bài trễ lịch đăng"],
    [r?.dueToday ?? 0, "bài đến hạn đăng hôm nay"],
  ]);
}

/** Quay chụp: buổi quay đã qua ngày mà chưa quay (chỉ quản lý) + sản phẩm hậu kỳ quá hạn chưa có link kết quả. */
async function mediaBadge(db: DB, user: { id: string }, wide: boolean, today: string) {
  const [shoots, deliverables] = await Promise.all([
    wide
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(mediaShoots)
          .where(and(isNull(mediaShoots.deletedAt), lt(mediaShoots.shootDate, today), inArray(mediaShoots.status, ["planned", "prepared"])))
      : Promise.resolve([{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(mediaDeliverables)
      .innerJoin(mediaShoots, eq(mediaShoots.id, mediaDeliverables.shootId))
      .where(
        and(
          isNull(mediaShoots.deletedAt),
          notInArray(mediaShoots.status, ["cancelled"]),
          lt(mediaDeliverables.dueDate, today),
          sql`coalesce(btrim(${mediaDeliverables.resultUrl}), '') = ''`,
          wide ? undefined : eq(mediaDeliverables.editorId, user.id),
        ),
      ),
  ]);
  const s = shoots[0]?.n ?? 0;
  const d = deliverables[0]?.n ?? 0;
  return makeBadge(s + d, 0, [
    [s, "buổi quay quá ngày chưa quay"],
    [d, "sản phẩm hậu kỳ quá hạn"],
  ]);
}

/**
 * Giám sát: số hạng mục có ít nhất 1 vấn đề ĐỎ (quá hạn / chưa rà soát / thiếu ảnh / thiếu hiện trạng…)
 * + hạng mục sắp đến hạn 30 ngày (vàng). Quản lý: mọi SBU; nhân sự: chỉ SBU mình phụ trách.
 */
async function monitoringBadge(db: DB, user: { id: string }, wide: boolean, today: string) {
  const rows = await db
    .select({
      item: monitoringItems,
      photos: sql<number>`(select count(*)::int from monitoring_photos p where p.item_id = ${monitoringItems.id})`,
    })
    .from(monitoringItems)
    .innerJoin(sbus, eq(sbus.id, monitoringItems.sbuId))
    .where(and(eq(sbus.active, true), wide ? undefined : eq(sbus.hoOwnerId, user.id)));

  let overdue = 0;
  let never = 0;
  let incomplete = 0;
  let red = 0;
  let soon = 0;
  for (const { item, photos } of rows) {
    const alert = computeAlert(item, today);
    const issues = monitoringIssues({ ...item, alert }, Number(photos));
    if (issues.length > 0) {
      red++;
      if (issues.includes("overdue")) overdue++;
      if (issues.includes("never_checked")) never++;
      if (isIncomplete(issues)) incomplete++;
    } else if (alert === "due_soon") soon++;
  }
  return makeBadge(red, soon, [
    [overdue, "quá hạn cập nhật"],
    [never, "chưa rà soát"],
    [incomplete, "thiếu ảnh/thông tin"],
    [soon, "sắp đến hạn"],
  ]);
}
