"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { duplicateCampaign } from "@/lib/services/campaigns";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["brand_theme", "product_gtm", "business_program", "rebrand", "data_program", "internal_program", "other"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  tagline: z.string().optional(),
  objective: z.string().optional(),
  heroActivity: z.string().optional(),
  cta: z.string().optional(),
  channels: z.string().optional(),
  notes: z.string().optional(),
});

async function requireManagerLike() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
  return user;
}

export async function createCampaignAction(input: z.infer<typeof schema>) {
  const user = await requireManagerLike();
  if (!user) return { ok: false as const, error: "Chỉ admin/manager được tạo campaign." };
  try {
    const d = schema.parse(input);
    const [row] = await db
      .insert(campaigns)
      .values({ ...d, createdBy: user.id })
      .returning();
    await writeAudit(db, { actorId: user.id, entity: "campaigns", entityId: row.id, action: "CREATE" });
    revalidatePath("/campaign");
    return { ok: true as const, id: row.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}

const updateSchema = schema.partial().extend({ id: z.string().uuid(), status: z.string().optional() });

export async function updateCampaignAction(input: z.infer<typeof updateSchema>) {
  const user = await requireManagerLike();
  if (!user) return { ok: false as const, error: "Chỉ admin/manager được sửa campaign." };
  try {
    const d = updateSchema.parse(input);
    const { id, ...patch } = d;
    await db
      .update(campaigns)
      .set({ ...patch, status: patch.status as never, updatedBy: user.id })
      .where(eq(campaigns.id, id));
    await writeAudit(db, { actorId: user.id, entity: "campaigns", entityId: id, action: "UPDATE", changes: patch });
    revalidatePath("/campaign");
    revalidatePath(`/campaign/${id}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Lỗi không xác định." };
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
  if (!user) return { ok: false as const, error: "Chỉ admin/manager được nhân bản campaign." };
  try {
    const d = duplicateSchema.parse(input);
    const created = await duplicateCampaign(db, d.campaignId, { newCode: d.newCode, dayOffset: d.dayOffset, newName: d.newName }, user.id);
    revalidatePath("/campaign");
    return { ok: true as const, id: created.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
