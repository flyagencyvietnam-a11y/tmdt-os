import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brands, campaigns, contentItems, importBatches, importRows, sbus, users } from "@/lib/db/schema";
import { createContentItem, updateContentItem } from "../content";
import type { ParsedRow } from "./parse";

const IMPORT_SCOPE = "T6";
const CONTENT_STATUSES = new Set(["brief", "drafting", "designing", "in_review", "approved", "published", "cancelled"]);

function parseDate(s: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export interface T6Row {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  contentKey: string;
  result: "created" | "updated" | "error";
  existingId?: string;
}

/** SPEC Mục 10.4 / Phụ lục B5 — T6 Content calendar. */
export async function validateT6(db: DB, rows: ParsedRow[]): Promise<T6Row[]> {
  const brandCodes = new Set((await db.select({ code: brands.code }).from(brands)).map((b) => b.code));
  const sbuCodes = new Set((await db.select({ code: sbus.code }).from(sbus)).map((s) => s.code));
  const campaignCodes = new Set((await db.select({ code: campaigns.code }).from(campaigns)).map((c) => c.code));
  const userEmails = new Set((await db.select({ email: users.email }).from(users)).map((u) => u.email.toLowerCase()));
  const existing = await db
    .select({ id: contentItems.id, externalKey: contentItems.externalKey })
    .from(contentItems)
    .where(and(eq(contentItems.importScope, IMPORT_SCOPE), isNull(contentItems.deletedAt)));
  const existingByKey = new Map(existing.map((r) => [r.externalKey, r.id]));

  const seen = new Set<string>();
  const out: T6Row[] = [];
  for (const r of rows) {
    const errors: string[] = [];
    const contentKey = r.data.content_key?.trim();
    const brandCode = r.data.brand_code?.trim();
    const publishDate = parseDate(r.data.publish_date);
    const channel = r.data.channel?.trim();
    const topic = r.data.topic?.trim();
    const ownerEmail = r.data.owner_email?.trim().toLowerCase();
    const status = r.data.status?.trim().toLowerCase();

    if (!contentKey) errors.push("Thiếu content_key");
    else if (seen.has(contentKey)) errors.push("content_key trùng trong file");
    else seen.add(contentKey);
    if (!brandCode) errors.push("Thiếu brand_code");
    else {
      const unknown = splitMulti(brandCode).filter((c) => !brandCodes.has(c));
      if (unknown.length) errors.push(`brand_code không tồn tại: ${unknown.join(", ")}`);
    }
    if (!r.data.publish_date) errors.push("Thiếu publish_date");
    else if (!publishDate) errors.push(`publish_date sai định dạng: ${r.data.publish_date}`);
    if (!channel) errors.push("Thiếu channel");
    if (!topic) errors.push("Thiếu topic");
    if (!ownerEmail) errors.push("Thiếu owner_email");
    else if (!userEmails.has(ownerEmail)) errors.push(`owner_email không tồn tại: ${ownerEmail}`);
    if (r.data.sbu_code && !sbuCodes.has(r.data.sbu_code.trim())) errors.push(`sbu_code không tồn tại: ${r.data.sbu_code}`);
    if (r.data.campaign_code && !campaignCodes.has(r.data.campaign_code.trim())) errors.push(`campaign_code không tồn tại: ${r.data.campaign_code}`);
    if (status && !CONTENT_STATUSES.has(status)) errors.push(`status không hợp lệ: ${status}`);

    const existingId = contentKey ? existingByKey.get(contentKey) : undefined;
    out.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      contentKey: contentKey ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }
  return out;
}

export async function createPendingBatchT6(db: DB, fileName: string, uploadedBy: string, rows: T6Row[]) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T6",
      fileName,
      uploadedBy,
      createdCount: rows.filter((r) => r.result === "created").length,
      updatedCount: rows.filter((r) => r.result === "updated").length,
      errorCount: rows.filter((r) => r.result === "error").length,
    })
    .returning();
  await db.insert(importRows).values(
    rows.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: "CONTENT",
      rawData: r.raw,
      result: r.result,
      entityType: "content_item",
      entityId: r.existingId ?? null,
      message: r.errors.join("; ") || null,
    })),
  );
  return batch;
}

export async function confirmT6Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const allBrands = await db.select({ id: brands.id, code: brands.code }).from(brands);
  const allSbus = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  const allCampaigns = await db.select({ id: campaigns.id, code: campaigns.code }).from(campaigns);
  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

  let created = 0;
  let updated = 0;
  for (const row of rows.filter((r) => r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const brandIds = splitMulti(raw.brand_code).map((code) => allBrands.find((b) => b.code === code)!.id);
    const sbu = raw.sbu_code ? allSbus.find((s) => s.code === raw.sbu_code.trim()) : undefined;
    const campaign = raw.campaign_code ? allCampaigns.find((c) => c.code === raw.campaign_code.trim()) : undefined;
    const owner = allUsers.find((u) => u.email.toLowerCase() === raw.owner_email.trim().toLowerCase());

    const input = {
      brandIds,
      campaignId: campaign?.id ?? null,
      sbuId: sbu?.id ?? null,
      publishDate: parseDate(raw.publish_date) as string,
      publishTime: raw.publish_time || null,
      channels: splitMulti(raw.channel),
      contentPillar: raw.content_pillar || null,
      topic: raw.topic.trim(),
      targetAudience: raw.target_audience || null,
      keyMessage: raw.key_message || null,
      format: raw.format || null,
      resourceSource: raw.resource_source || null,
      ownerId: owner?.id ?? null,
      cta: raw.cta || null,
      targetMetric: raw.target_metric || null,
      supportNeeded: raw.support_needed || null,
    };

    if (row.entityId) {
      await updateContentItem(
        db,
        row.entityId,
        { ...input, status: (raw.status?.trim().toLowerCase() as never) || undefined, postUrl: raw.post_url || null },
        actorId,
      );
      updated++;
    } else {
      const item = await createContentItem(db, input, actorId);
      await db
        .update(contentItems)
        .set({ externalKey: raw.content_key.trim(), importScope: IMPORT_SCOPE })
        .where(eq(contentItems.id, item.id));
      await db.update(importRows).set({ entityId: item.id }).where(eq(importRows.id, row.id));
      created++;
    }
  }
  await db.update(importBatches).set({ summary: { created, updated } }).where(eq(importBatches.id, batchId));
  return { created, updated };
}

/** 1 ô có thể chứa nhiều brand/kênh: "VMG, VMP" hoặc "Fanpage; TikTok" hoặc "A|B". */
function splitMulti(v: string | undefined): string[] {
  return [...new Set((v ?? "").split(/[,;|]/).map((x) => x.trim()).filter(Boolean))];
}
