import { and, arrayContains, desc, eq, isNull, like } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  contentItems,
  contentWorkflowTemplates,
  tasks,
  users,
  type ContentItem,
} from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { createTask, isPostStepTitle, updateTask } from "./tasks";
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
  /** Brand chính. Có thể bỏ trống nếu truyền brandIds (lấy phần tử đầu). */
  brandId?: string;
  /** Nhiều brand cho 1 post (tag). Phần tử đầu = brand chính. */
  brandIds?: string[];
  campaignId?: string | null;
  sbuId?: string | null;
  publishDate: string;
  publishTime?: string | null;
  /** Kênh chính. Có thể bỏ trống nếu truyền channels (lấy phần tử đầu). */
  channel?: string;
  /** Nhiều kênh đăng chéo. Phần tử đầu = kênh chính. */
  channels?: string[];
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

/**
 * Chuẩn hoá brand/kênh: hợp nhất trường đơn (brandId/channel — tương thích
 * import T6 cũ) với mảng (brandIds/channels), bỏ trùng, giữ thứ tự; phần tử
 * đầu là brand/kênh CHÍNH. Trả null cho phần không được truyền (khi update).
 */
export function normalizeTags(single: string | undefined, many: string[] | undefined): string[] | null {
  if (single === undefined && many === undefined) return null;
  const out: string[] = [];
  for (const v of [...(single ? [single] : []), ...(many ?? [])]) {
    const t = v.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Tiêu đề task cha — liệt kê mọi kênh (vd. "Đăng: Khai giảng — Fanpage, TikTok"). */
function parentTitle(topic: string, channels: string[]): string {
  return `Đăng: ${topic} — ${channels.join(", ")}`;
}

/** SPEC Mục 7.2 — tạo content_item + task cha "Đăng: {chủ đề} - {kênh}" (+ task con theo workflow). */
export async function createContentItem(
  db: DB,
  input: CreateContentItemInput,
  actorId: string | null,
): Promise<ContentItem> {
  // brandIds/channels: ưu tiên mảng nếu có (brand chính = phần tử đầu).
  const brandIds = normalizeTags(input.brandIds?.length ? undefined : input.brandId, input.brandIds) ?? [];
  const channels = normalizeTags(input.channels?.length ? undefined : input.channel, input.channels) ?? [];
  if (brandIds.length === 0) throw new ServiceError("Cần chọn ít nhất 1 brand.", "VALIDATION");
  if (channels.length === 0) throw new ServiceError("Cần chọn ít nhất 1 kênh.", "VALIDATION");
  const brandId = brandIds[0];
  const channel = channels[0];

  const parentTask = await createTask(
    db,
    {
      title: parentTitle(input.topic, channels),
      type: "content",
      assigneeId: input.ownerId ?? null,
      dueDate: input.publishDate,
      dueTime: input.publishTime ?? null,
      campaignId: input.campaignId ?? null,
      brandId,
      channel,
      sourceType: "content_item",
    },
    actorId,
  );

  const [item] = await db
    .insert(contentItems)
    .values({
      brandId,
      brandIds,
      campaignId: input.campaignId ?? null,
      sbuId: input.sbuId ?? null,
      publishDate: input.publishDate,
      publishTime: input.publishTime ?? null,
      channel,
      channels,
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

  // brand/kênh xử lý riêng bên dưới (chuẩn hoá mảng + brand/kênh chính).
  const rest: Record<string, unknown> = { ...patch };
  for (const k of ["brandId", "brandIds", "channel", "channels", "generateSubtasks"]) delete rest[k];
  const set: Partial<typeof contentItems.$inferInsert> = { ...rest, updatedBy: actorId };
  const brandIds = normalizeTags(patch.brandIds?.length ? undefined : patch.brandId, patch.brandIds);
  if (brandIds) {
    if (brandIds.length === 0) throw new ServiceError("Cần chọn ít nhất 1 brand.", "VALIDATION");
    set.brandIds = brandIds;
    set.brandId = brandIds[0];
  }
  const channels = normalizeTags(patch.channels?.length ? undefined : patch.channel, patch.channels);
  if (channels) {
    if (channels.length === 0) throw new ServiceError("Cần chọn ít nhất 1 kênh.", "VALIDATION");
    set.channels = channels;
    set.channel = channels[0];
  }

  const [after] = await db.update(contentItems).set(set).where(eq(contentItems.id, id)).returning();

  if (before.parentTaskId && (patch.publishDate || patch.topic || channels || brandIds)) {
    await updateTask(
      db,
      before.parentTaskId,
      {
        title: parentTitle(after.topic, after.channels.length ? after.channels : [after.channel]),
        dueDate: after.publishDate,
        brandId: after.brandId,
        channel: after.channel,
      },
      actorId,
      { trackManualEdit: false },
    );
  }

  // "Đăng bài" task done ⇄ content_item.status = published (đồng bộ 2 chiều, Mục 7.2).
  // Tick "Đã đăng" nghĩa là toàn bộ quy trình đã xong — đóng luôn các task con
  // (Soạn nội dung/Thiết kế/Duyệt/Đăng bài) đang mở, không chỉ riêng task cha,
  // để task "Đăng bài: ..." không bị kẹt ở "Cần làm" trong khi content đã published.
  if (patch.status === "published" && before.parentTaskId) {
    const openChildren = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.parentId, before.parentTaskId), isNull(tasks.deletedAt)));
    for (const child of openChildren) {
      if (child.status !== "done" && child.status !== "cancelled") {
        await updateTask(db, child.id, { status: "done" }, actorId, { trackManualEdit: false });
      }
    }
    await updateTask(db, before.parentTaskId, { status: "done" }, actorId, { trackManualEdit: false });
  }

  // Bỏ tick "Đã đăng" (published → trạng thái khác, không phải huỷ): mở lại bước "Đăng bài" + task cha để 2 bên khớp nhau.
  if (before.status === "published" && patch.status && patch.status !== "published" && patch.status !== "cancelled" && before.parentTaskId) {
    const children = await db.select({ id: tasks.id, title: tasks.title, status: tasks.status }).from(tasks).where(and(eq(tasks.parentId, before.parentTaskId), isNull(tasks.deletedAt)));
    for (const child of children.filter((x) => isPostStepTitle(x.title) && x.status === "done")) {
      await updateTask(db, child.id, { status: "todo" }, actorId, { trackManualEdit: false });
    }
    const [parent] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, before.parentTaskId)).limit(1);
    if (parent?.status === "done") await updateTask(db, before.parentTaskId, { status: "in_progress" }, actorId, { trackManualEdit: false });
  }

  await writeAudit(db, { actorId, entity: "content_items", entityId: id, action: "UPDATE", changes: patch });
  return after;
}

export async function listContentItems(db: DB, filters: { brandId?: string } = {}) {
  return db
    .select()
    .from(contentItems)
    .where(and(isNull(contentItems.deletedAt), filters.brandId ? arrayContains(contentItems.brandIds, [filters.brandId]) : undefined))
    .orderBy(desc(contentItems.publishDate));
}
