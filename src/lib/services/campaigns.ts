import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { campaignBrands, campaigns, tasks, type Campaign } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { createTask } from "./tasks";
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
