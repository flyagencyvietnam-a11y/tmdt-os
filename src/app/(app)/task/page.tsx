import { eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { campaigns, users } from "@/lib/db/schema";
import { calendarToken } from "@/lib/services/ics";
import { clampLimit, defaultTaskView, listTasksScoped, PAGE_SIZE, parseTaskView, taskViewCounts, type TaskScope } from "@/lib/services/task-lists";
import { todayVnDayStr } from "@/lib/time";
import { TaskBoard } from "./task-board";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Tất cả task — VMG MKT OS" };
export const dynamic = "force-dynamic";

/**
 * Danh sách task tải THEO PHẠM VI (view + người phụ trách + giới hạn) từ server — không tải cả nghìn task.
 * Mặc định theo vai trò: nhân viên → "Của tôi"; quản lý/admin → "Đang làm việc" (việc mở + vừa xong 30 ngày).
 */
export default async function TaskListPage({ searchParams }: { searchParams: Promise<{ view?: string; assignee?: string; limit?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!canSee(user.role, "task")) redirect("/khong-co-quyen");

  const view = parseTaskView(sp.view) ?? defaultTaskView(user.role);
  const limit = clampLimit(sp.limit);
  const scope: TaskScope = {
    userId: user.id,
    sbuId: user.role === "center_contributor" ? (user.sbuId ?? "none") : null,
    today: todayVnDayStr(),
  };
  // `assignee` đi thẳng vào truy vấn uuid → chỉ nhận đúng định dạng uuid (tránh lỗi 500 khi URL bị sửa tay).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const assigneeId = view === "mine" ? null : sp.assignee && UUID.test(sp.assignee) ? sp.assignee : null;

  const [{ rows, total }, counts, allUsers, allCampaigns] = await Promise.all([
    listTasksScoped(db, scope, { view, assigneeId, limit }),
    taskViewCounts(db, scope),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns).where(isNull(campaigns.deletedAt)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Tất cả task" description="Xem toàn bộ công việc của phòng dưới dạng danh sách, Kanban hoặc lịch — dùng chung bộ lọc." />
      <TaskBoard
        tasks={rows.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          type: t.type,
          status: t.status,
          priority: t.priority,
          assigneeId: t.assigneeId,
          dueDate: t.dueDate,
          campaignId: t.campaignId,
          blockedReason: t.blockedReason,
          sourceType: t.sourceType,
          channel: t.channel,
        }))}
        total={total}
        counts={counts}
        view={view}
        defaultView={defaultTaskView(user.role)}
        assigneeId={assigneeId}
        pageSize={PAGE_SIZE}
        users={allUsers}
        campaigns={allCampaigns}
        currentUserId={user.id}
        canAssignOthers={user.canAssign || user.role === "admin" || user.role === "manager"}
        icsUrl={`/api/export/ics?user=${user.id}&token=${calendarToken(user.id)}`}
      />
    </div>
  );
}
