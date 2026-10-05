import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { campaignBrands, campaignSbus, campaigns, contentItems, tasks, type Campaign } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { createTask, softDeleteTasks } from "./tasks";
import { ServiceError } from "./errors";
import { addDaysStr } from "@/lib/time";

/**
 * SPEC Mục 5.3 / 14.3 — nhân bản campaign: tạo campaign mới + toàn bộ task con
 * (action plan), dời ngày theo khoảng lệch người dùng chọn (`dayOffset`).
 * Task con cấp 2 (`parentId`) được ánh xạ lại để vẫn lồng đúng cây task mới.
 */
export async function duplicateCampaign(
  db: DB,
  campaignId: string,
  opts: { newCode: string; dayOffset: number; newName?: string },
  actorId: string | null,
): Promise<Campaign> {
  const [src] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!src) throw new ServiceError("Không tìm thấy campaign.", "NOT_FOUND");

  const shift = (d: string | null) => (d ? addDaysStr(d, opts.dayOffset) : d);

  const [created] = await db
    .insert(campaigns)
    .values({
      code: opts.newCode,
      name: opts.newName ?? `${src.name} (bản sao)`,
      type: src.type,
      tagline: src.tagline,
      occasion: src.occasion,
      startDate: shift(src.startDate) as string,
      endDate: shift(src.endDate) as string,
      status: "planned",
      ownerId: src.ownerId,
      targetAudience: src.targetAudience,
      insightMessage: src.insightMessage,
      objective: src.objective,
      heroActivity: src.heroActivity,
      cta: src.cta,
      channels: src.channels,
      roleSplit: src.roleSplit,
      budgetNote: src.budgetNote,
      kpiNote: src.kpiNote,
      sourceNote: `Nhân bản từ ${src.code}`,
      createdBy: actorId,
    })
    .returning();

  const srcBrandLinks = await db.select().from(campaignBrands).where(eq(campaignBrands.campaignId, campaignId));
  if (srcBrandLinks.length) {
    await db.insert(campaignBrands).values(srcBrandLinks.map((b) => ({ campaignId: created.id, brandId: b.brandId })));
  }

  const srcSbuLinks = await db.select().from(campaignSbus).where(eq(campaignSbus.campaignId, campaignId));
  if (srcSbuLinks.length) {
    await db.insert(campaignSbus).values(srcSbuLinks.map((l) => ({ campaignId: created.id, sbuId: l.sbuId })));
  }

  const srcTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.campaignId, campaignId), isNull(tasks.deletedAt)));

  // Map task gốc -> task mới, để gán lại parentId cho task con cấp 2.
  const idMap = new Map<string, string>();
  const topLevel = srcTasks.filter((t) => !t.parentId);
  const children = srcTasks.filter((t) => t.parentId);

  for (const t of topLevel) {
    const nt = await createTask(
      db,
      {
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        assigneeId: t.assigneeId,
        startDate: shift(t.startDate),
        dueDate: shift(t.dueDate),
        dueTime: t.dueTime,
        timeSlot: t.timeSlot,
        campaignId: created.id,
        brandId: t.brandId,
        workstream: t.workstream,
        channel: t.channel,
        isMilestone: t.isMilestone,
        sourceType: "campaign_template",
        sourceId: src.id,
      },
      actorId,
    );
    idMap.set(t.id, nt.id);
  }
  for (const t of children) {
    const newParentId = t.parentId ? idMap.get(t.parentId) : undefined;
    const nt = await createTask(
      db,
      {
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        assigneeId: t.assigneeId,
        startDate: shift(t.startDate),
        dueDate: shift(t.dueDate),
        dueTime: t.dueTime,
        timeSlot: t.timeSlot,
        parentId: newParentId ?? null,
        campaignId: created.id,
        brandId: t.brandId,
        workstream: t.workstream,
        channel: t.channel,
        isMilestone: t.isMilestone,
        sourceType: "campaign_template",
        sourceId: src.id,
      },
      actorId,
    );
    idMap.set(t.id, nt.id);
  }

  await writeAudit(db, {
    actorId,
    entity: "campaigns",
    entityId: created.id,
    action: "CREATE",
    changes: { duplicatedFrom: src.code, dayOffset: opts.dayOffset, taskCount: srcTasks.length },
  });

  return created;
}

/**
 * Xoá (mềm) campaign: đổi mã thành `<mã>~xoa-<yyyymmdd>` (cột `code` unique — giải phóng mã để tạo/nạp lại),
 * xoá mềm các task action plan của campaign (qua `softDeleteTasks`), còn task/bài content gắn campaign
 * thì chỉ gỡ liên kết (nội dung đăng bài vẫn giữ). Trả về số campaign và số task đã xử lý.
 */
export async function deleteCampaigns(db: DB, ids: string[], actorId: string | null, today: string): Promise<{ campaigns: number; tasks: number }> {
  if (ids.length === 0) return { campaigns: 0, tasks: 0 };
  const rows = await db.select({ id: campaigns.id, code: campaigns.code }).from(campaigns).where(and(inArray(campaigns.id, ids), isNull(campaigns.deletedAt)));
  if (rows.length === 0) return { campaigns: 0, tasks: 0 };
  const rowIds = rows.map((r) => r.id);

  const own = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(inArray(tasks.campaignId, rowIds), isNull(tasks.deletedAt), ne(tasks.sourceType, "content_item"), isNull(tasks.parentId)));
  const res = await softDeleteTasks(db, own.map((t) => t.id), actorId);

  // Task/bài content còn lại: gỡ khỏi campaign đã xoá.
  await db.update(tasks).set({ campaignId: null, updatedBy: actorId }).where(and(inArray(tasks.campaignId, rowIds), isNull(tasks.deletedAt)));
  await db.update(contentItems).set({ campaignId: null, updatedBy: actorId }).where(inArray(contentItems.campaignId, rowIds));

  const stamp = today.replaceAll("-", "");
  for (const r of rows) {
    await db
      .update(campaigns)
      .set({ code: `${r.code}~xoa-${stamp}-${r.id.slice(0, 4)}`, deletedAt: new Date(), updatedBy: actorId })
      .where(eq(campaigns.id, r.id));
    await writeAudit(db, { actorId, entity: "campaigns", entityId: r.id, action: "DELETE" });
  }
  return { campaigns: rows.length, tasks: res.deleted + res.archivedRecurring };
}

/** Đặt lại danh sách brand/sản phẩm và/hoặc trung tâm mà campaign phục vụ (thay thế toàn bộ; truyền undefined = giữ nguyên). */
export async function setCampaignLinks(db: DB, campaignId: string, links: { brandIds?: string[]; sbuIds?: string[] }, actorId: string | null) {
  if (links.brandIds) {
    const ids = [...new Set(links.brandIds)];
    await db.delete(campaignBrands).where(eq(campaignBrands.campaignId, campaignId));
    if (ids.length) await db.insert(campaignBrands).values(ids.map((brandId) => ({ campaignId, brandId })));
  }
  if (links.sbuIds) {
    const ids = [...new Set(links.sbuIds)];
    await db.delete(campaignSbus).where(eq(campaignSbus.campaignId, campaignId));
    if (ids.length) await db.insert(campaignSbus).values(ids.map((sbuId) => ({ campaignId, sbuId })));
  }
  await writeAudit(db, { actorId, entity: "campaigns", entityId: campaignId, action: "UPDATE", changes: links as Record<string, unknown> });
}
