import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  activityLog,
  brands,
  campaigns,
  checklistItems,
  comments,
  contentItems,
  recurringRules,
  sbus,
  taskSbus,
  tasks,
  users,
} from "@/lib/db/schema";
import { TaskDetail } from "./task-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t] = await db.select({ code: tasks.code, title: tasks.title }).from(tasks).where(eq(tasks.id, id)).limit(1);
  return { title: t ? `${t.code} · ${t.title} — VMG MKT OS` : "Task — VMG MKT OS" };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task) notFound();

  // Content liên kết: task này là task cha của 1 content_item, hoặc 1 bước con (Soạn/Thiết kế/Duyệt/Đăng bài) của nó.
  const contentParentId = task.sourceType === "content_item" ? (task.parentId ?? task.id) : null;

  const [allUsers, checklist, taskComments, activity, campaign, brand, rule, contentItem, allSbus, myLinks] = await Promise.all([
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select().from(checklistItems).where(eq(checklistItems.taskId, id)).orderBy(asc(checklistItems.sortOrder)),
    db
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, authorName: users.fullName })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.taskId, id))
      .orderBy(asc(comments.createdAt)),
    db
      .select({ id: activityLog.id, field: activityLog.field, fromValue: activityLog.fromValue, toValue: activityLog.toValue, occurredAt: activityLog.occurredAt, actorName: users.fullName })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.actorId))
      .where(eq(activityLog.taskId, id))
      .orderBy(asc(activityLog.occurredAt)),
    task.campaignId ? db.select().from(campaigns).where(eq(campaigns.id, task.campaignId)).limit(1).then((r) => r[0]) : null,
    task.brandId ? db.select().from(brands).where(eq(brands.id, task.brandId)).limit(1).then((r) => r[0]) : null,
    task.recurringRuleId ? db.select().from(recurringRules).where(eq(recurringRules.id, task.recurringRuleId)).limit(1).then((r) => r[0]) : null,
    contentParentId
      ? db
          .select({ id: contentItems.id, topic: contentItems.topic, status: contentItems.status, publishDate: contentItems.publishDate, parentTaskId: contentItems.parentTaskId })
          .from(contentItems)
          .where(and(eq(contentItems.parentTaskId, contentParentId), isNull(contentItems.deletedAt)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind }).from(sbus).where(eq(sbus.active, true)).orderBy(asc(sbus.code)),
    db.select({ sbuId: taskSbus.sbuId }).from(taskSbus).where(eq(taskSbus.taskId, id)),
  ]);

  return (
    <TaskDetail
      task={task}
      users={allUsers}
      checklist={checklist}
      comments={taskComments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      activity={activity.map((a) => ({ ...a, occurredAt: a.occurredAt.toISOString() }))}
      campaign={campaign ?? null}
      brand={brand ?? null}
      recurringRuleName={rule?.name ?? null}
      contentItem={contentItem ?? null}
      sbus={allSbus}
      sbuIds={myLinks.map((l) => l.sbuId)}
      currentUserId={user.id}
      canAssignOthers={user.canAssign || user.role === "admin" || user.role === "manager"}
    />
  );
}
