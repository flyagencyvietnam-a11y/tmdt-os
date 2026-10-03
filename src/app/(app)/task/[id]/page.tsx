import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  activityLog,
  brands,
  campaigns,
  checklistItems,
  comments,
  recurringRules,
  tasks,
  users,
} from "@/lib/db/schema";
import { TaskDetail } from "./task-detail";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task) notFound();

  const [allUsers, checklist, taskComments, activity, campaign, brand, rule] = await Promise.all([
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
      currentUserId={user.id}
      canAssignOthers={user.canAssign || user.role === "admin" || user.role === "manager"}
    />
  );
}
