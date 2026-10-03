import { and, desc, eq, isNull, like } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  contentItems,
  contentWorkflowTemplates,
  tasks,
  users,
  type ContentItem,
} from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { createTask, updateTask } from "./tasks";
import { loadDeptWorkDays, loadHolidaySet, addWorkdays } from "./workdays";
import { ServiceError } from "./errors";

export interface ContentWorkflowStep {
  label: string;
  /** Số ngày làm việc TRƯỚC publish_date (dương = trước, 0 = đúng ngày đăng). */
  offsetWorkdaysBeforePublish: number;
  /** "owner" dùng content_item.owner_id; "designer"/"approver" tra theo vai trò mặc định; "fixed" dùng assigneeId. */
  roleHint: "owner" | "designer" | "approver" | "fixed";
  assigneeId?: string;
}

const DEFAULT_STEPS: ContentWorkflowStep[] = [
  { label: "Soạn nội dung", offsetWorkdaysBeforePublish: 3, roleHint: "owner" },
  { label: "Thiết kế", offsetWorkdaysBeforePublish: 2, roleHint: "designer" },
  { label: "Duyệt", offsetWorkdaysBeforePublish: 1, roleHint: "approver" },
  { label: "Đăng bài", offsetWorkdaysBeforePublish: 0, roleHint: "owner" },
];

/** SPEC Mục 16.2 quyết định #5 — mặc định Trân thiết kế, Trưởng phòng duyệt (dò theo tên/role khi chưa cấu hình rõ assigneeId). */
async function resolveRoleAssignee(
  db: DB,
  roleHint: ContentWorkflowStep["roleHint"],
  ownerId: string | null,
  fixedId?: string,
): Promise<string | null> {
  if (roleHint === "fixed") return fixedId ?? null;
  if (roleHint === "owner") return ownerId;
  if (roleHint === "approver") {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)))
      .limit(1);
    return admin?.id ?? null;
  }
  // designer — mặc định dò người tên "Trân" (SPEC 16.2 #5); không bắt buộc tồn tại.
  const [designer] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(like(users.fullName, "%Trân%"), eq(users.active, true)))
    .limit(1);
  return designer?.id ?? null;
}

async function loadWorkflowSteps(
  db: DB,
  brandId: string,
  channel: string,
): Promise<ContentWorkflowStep[]> {
  const rows = await db.select().from(contentWorkflowTemplates);
  const specific = rows.find((r) => r.brandId === brandId && r.channel === channel);
  const brandOnly = rows.find((r) => r.brandId === brandId && !r.channel);
  const channelOnly = rows.find((r) => !r.brandId && r.channel === channel);
  const global = rows.find((r) => !r.brandId && !r.channel);
  const picked = specific ?? brandOnly ?? channelOnly ?? global;
  return (picked?.steps as ContentWorkflowStep[] | undefined) ?? DEFAULT_STEPS;
}

export interface CreateContentItemInput {
  brandId: string;
  campaignId?: string | null;
  sbuId?: string | null;
  publishDate: string;
  publishTime?: string | null;
  channel: string;
  contentPillar?: string | null;
  topic: string;
  targetAudience?: string | null;
  keyMessage?: string | null;
  format?: string | null;
  resourceSource?: string | null;
  ownerId?: string | null;
  cta?: string | null;
  targetMetric?: string | null;
  supportNeeded?: string | null;
  /** false = chỉ 1 task không task con (Mục 7.2 "tuỳ chọn chỉ 1 task"). */
  generateSubtasks?: boolean;
}

/** SPEC Mục 7.2 — tạo content_item + task cha "Đăng: {chủ đề} - {kênh}" (+ task con theo workflow). */
export async function createContentItem(
  db: DB,
  input: CreateContentItemInput,
  actorId: string | null,
): Promise<ContentItem> {
  const parentTask = await createTask(
    db,
    {
      title: `Đăng: ${input.topic} — ${input.channel}`,
      type: "content",
      assigneeId: input.ownerId ?? null,
      dueDate: input.publishDate,
      dueTime: input.publishTime ?? null,
      campaignId: input.campaignId ?? null,
      brandId: input.brandId,
      channel: input.channel,
      sourceType: "content_item",
    },
    actorId,
  );

  const [item] = await db
    .insert(contentItems)
    .values({
      brandId: input.brandId,
      campaignId: input.campaignId ?? null,
      sbuId: input.sbuId ?? null,
      publishDate: input.publishDate,
      publishTime: input.publishTime ?? null,
      channel: input.channel,
      contentPillar: input.contentPillar ?? null,
      topic: input.topic,
      targetAudience: input.targetAudience ?? null,
      keyMessage: input.keyMessage ?? null,
      format: input.format ?? null,
      resourceSource: input.resourceSource ?? null,
      ownerId: input.ownerId ?? null,
      cta: input.cta ?? null,
      targetMetric: input.targetMetric ?? null,
      supportNeeded: input.supportNeeded ?? null,
      parentTaskId: parentTask.id,
      createdBy: actorId,
    })
    .returning();

  // Gắn ngược task cha -> content_item để đồng bộ 2 chiều (Mục 7.2).
  await updateTask(db, parentTask.id, {}, actorId, { trackManualEdit: false });
  await db.update(tasks).set({ sourceId: item.id }).where(eq(tasks.id, parentTask.id));

  if (input.generateSubtasks !== false) {
    await generateSubtasksForContentItem(db, item, actorId);
  }

  await writeAudit(db, { actorId, entity: "content_items", entityId: item.id, action: "CREATE" });
  return item;
}

async function generateSubtasksForContentItem(db: DB, item: ContentItem, actorId: string | null) {
  const workDays = await loadDeptWorkDays(db);
  const holidaySet = await loadHolidaySet(db);
  const steps = await loadWorkflowSteps(db, item.brandId, item.channel);

  for (const step of steps) {
    const dueDate = addWorkdays(item.publishDate, -Math.abs(step.offsetWorkdaysBeforePublish), workDays, holidaySet);
    const assigneeId = await resolveRoleAssignee(db, step.roleHint, item.ownerId, step.assigneeId);
    await createTask(
      db,
      {
        title: `${step.label}: ${item.topic}`,
        type: "content",
        assigneeId,
        dueDate,
        parentId: item.parentTaskId,
        campaignId: item.campaignId,
        brandId: item.brandId,
        channel: item.channel,
        sourceType: "content_item",
        sourceId: item.id,
      },
      actorId,
    );
  }
}

export async function updateContentItem(
  db: DB,
  id: string,
  patch: Partial<CreateContentItemInput> & { status?: ContentItem["status"]; postUrl?: string | null },
  actorId: string | null,
) {
  const [before] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  if (!before) throw new ServiceError("Không tìm thấy content item.", "NOT_FOUND");

  const [after] = await db
    .update(contentItems)
    .set({ ...patch, updatedBy: actorId })
    .where(eq(contentItems.id, id))
    .returning();

  if (before.parentTaskId && (patch.publishDate || patch.topic || patch.channel)) {
    await updateTask(
      db,
      before.parentTaskId,
      {
        title: `Đăng: ${after.topic} — ${after.channel}`,
        dueDate: after.publishDate,
      },
      actorId,
      { trackManualEdit: false },
    );
  }

  // "Đăng bài" task done ⇄ content_item.status = published (đồng bộ 2 chiều, Mục 7.2).
  if (patch.status === "published" && before.parentTaskId) {
    await updateTask(db, before.parentTaskId, { status: "done" }, actorId, { trackManualEdit: false });
  }

  await writeAudit(db, { actorId, entity: "content_items", entityId: id, action: "UPDATE", changes: patch });
  return after;
}

/** Gọi khi task con/cha của content_item chuyển done — đồng bộ ngược trạng thái (Mục 7.2). */
export async function syncContentItemFromParentTask(db: DB, parentTaskId: string, actorId: string | null) {
  const [item] = await db.select().from(contentItems).where(eq(contentItems.parentTaskId, parentTaskId)).limit(1);
  if (!item) return;
  const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, parentTaskId)).limit(1);
  if (task?.status === "done" && item.status !== "published") {
    await db.update(contentItems).set({ status: "published", updatedBy: actorId }).where(eq(contentItems.id, item.id));
  }
}

export async function listContentItems(db: DB, filters: { brandId?: string } = {}) {
  return db
    .select()
    .from(contentItems)
    .where(and(isNull(contentItems.deletedAt), filters.brandId ? eq(contentItems.brandId, filters.brandId) : undefined))
    .orderBy(desc(contentItems.publishDate));
}
