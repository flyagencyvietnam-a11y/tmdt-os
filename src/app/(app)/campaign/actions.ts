"use server";

import { eq } from "drizzle-orm";
import { isStaff } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { deleteCampaigns, duplicateCampaign, setCampaignLinks } from "@/lib/services/campaigns";
import { todayVnDayStr } from "@/lib/time";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["brand_theme", "product_gtm", "business_program", "rebrand", "data_program", "internal_program", "other"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  /** Mỗi campaign PHẢI có 1 người chịu trách nhiệm (campaign owner). */
  ownerId: z.string().uuid("Chọn người chịu trách nhiệm (owner) của campaign."),
  tagline: z.string().optional(),
  objective: z.string().optional(),
  heroActivity: z.string().optional(),
  cta: z.string().optional(),
  channels: z.string().optional(),
  notes: z.string().optional(),
  /** Brand/sản phẩm và trung tâm mà campaign phục vụ (tuỳ chọn, nhiều giá trị). */
  brandIds: z.array(z.string().uuid()).optional(),
  sbuIds: z.array(z.string().uuid()).optional(),
});

async function requireManagerLike() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) return null;
  return user;
}

export async function createCampaignAction(input: z.infer<typeof schema>) {
  const user = await requireManagerLike();
  if (!user) return { ok: false as const, error: "Chỉ nhân sự Marketing được tạo campaign." };
  try {
    const { brandIds, sbuIds, ...d } = schema.parse(input);
    const [row] = await db
      .insert(campaigns)
      .values({ ...d, createdBy: user.id })
      .returning();
    if (brandIds?.length || sbuIds?.length) await setCampaignLinks(db, row.id, { brandIds: brandIds ?? [], sbuIds: sbuIds ?? [] }, user.id);
    await writeAudit(db, { actorId: user.id, entity: "campaigns", entityId: row.id, action: "CREATE" });
    revalidatePath("/campaign");
    return { ok: true as const, id: row.id };
  } catch (e) {
    return { ok: false as const, error: firstIssue(e) };
  }
}

const updateSchema = schema.partial().extend({ id: z.string().uuid(), status: z.string().optional() });

function firstIssue(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
  return e instanceof Error ? e.message : "Lỗi không xác định.";
}

export async function updateCampaignAction(input: z.infer<typeof updateSchema>) {
  const user = await requireManagerLike();
  if (!user) return { ok: false as const, error: "Chỉ nhân sự Marketing được sửa campaign." };
  try {
    const d = updateSchema.parse(input);
    const { id, brandIds, sbuIds, ...patch } = d;
    if (brandIds || sbuIds) await setCampaignLinks(db, id, { brandIds, sbuIds }, user.id);
    await db
      .update(campaigns)
      .set({ ...patch, status: patch.status as never, updatedBy: user.id })
      .where(eq(campaigns.id, id));
    await writeAudit(db, { actorId: user.id, entity: "campaigns", entityId: id, action: "UPDATE", changes: patch });
    revalidatePath("/campaign");
    revalidatePath(`/campaign/${id}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: firstIssue(e) };
  }
}

const duplicateSchema = z.object({
  campaignId: z.string().uuid(),
  newCode: z.string().min(1),
  dayOffset: z.number().int(),
  newName: z.string().optional(),
});

/** SPEC Mục 5.3 / 14.3 — nhân bản campaign (bao gồm task con, dời ngày theo khoảng lệch). */
export async function duplicateCampaignAction(input: z.infer<typeof duplicateSchema>) {
  const user = await requireManagerLike();
  if (!user) return { ok: false as const, error: "Chỉ nhân sự Marketing được nhân bản campaign." };
  try {
    const d = duplicateSchema.parse(input);
    const created = await duplicateCampaign(db, d.campaignId, { newCode: d.newCode, dayOffset: d.dayOffset, newName: d.newName }, user.id);
    revalidatePath("/campaign");
    return { ok: true as const, id: created.id };
  } catch (e) {
    return { ok: false as const, error: firstIssue(e) };
  }
}

/** Xoá (mềm) campaign: gỡ mã, xoá task action plan; task/bài content gắn campaign chỉ gỡ liên kết. */
export async function deleteCampaignsAction(ids: string[]) {
  const user = await requireManagerLike();
  if (!user) return { ok: false as const, error: "Chỉ nhân sự Marketing được xoá campaign." };
  try {
    const r = await deleteCampaigns(db, ids, user.id, todayVnDayStr());
    revalidatePath("/campaign");
    revalidatePath("/task");
    revalidatePath("/content");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: firstIssue(e) };
  }
}
