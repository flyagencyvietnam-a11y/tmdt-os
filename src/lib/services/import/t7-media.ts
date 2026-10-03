import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brands, campaigns, importBatches, importRows, mediaShoots, sbus, users } from "@/lib/db/schema";
import { addMediaDeliverable, createMediaShoot } from "../media";
import type { ParsedRow } from "./parse";

const SHOOT_STATUSES = new Set(["planned", "prepared", "shot", "editing", "done", "cancelled"]);

function parseDate(s: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export interface T7ShootRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  shootCode: string;
  result: "created" | "updated" | "error";
  existingId?: string;
}
export interface T7DeliverableRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  shootCode: string;
  result: "created" | "error";
}

/** SPEC Mục 10.4 / Phụ lục B6 — T7 Media production plan (SHOOTS + DELIVERABLES). */
export async function validateT7(
  db: DB,
  shootRows: ParsedRow[],
  deliverableRows: ParsedRow[],
): Promise<{ shoots: T7ShootRow[]; deliverables: T7DeliverableRow[] }> {
  const brandCodes = new Set((await db.select({ code: brands.code }).from(brands)).map((b) => b.code));
  const sbuCodes = new Set((await db.select({ code: sbus.code }).from(sbus)).map((s) => s.code));
  const campaignCodes = new Set((await db.select({ code: campaigns.code }).from(campaigns)).map((c) => c.code));
  const userEmails = new Set((await db.select({ email: users.email }).from(users)).map((u) => u.email.toLowerCase()));
  const existingShoots = await db.select({ id: mediaShoots.id, code: mediaShoots.code }).from(mediaShoots);
  const existingByCode = new Map(existingShoots.map((s) => [s.code, s.id]));

  const seenShoot = new Set<string>();
  const shoots: T7ShootRow[] = [];
  for (const r of shootRows) {
    const errors: string[] = [];
    const shootCode = r.data.shoot_code?.trim();
    const shootDate = parseDate(r.data.shoot_date);
    if (!shootCode) errors.push("Thiếu shoot_code");
    else if (seenShoot.has(shootCode)) errors.push("shoot_code trùng trong file");
    else seenShoot.add(shootCode);
    if (!r.data.shoot_date) errors.push("Thiếu shoot_date");
    else if (!shootDate) errors.push(`shoot_date sai định dạng: ${r.data.shoot_date}`);
    if (r.data.sbu_code && !sbuCodes.has(r.data.sbu_code.trim())) errors.push(`sbu_code không tồn tại: ${r.data.sbu_code}`);
    if (r.data.brand_code && !brandCodes.has(r.data.brand_code.trim())) errors.push(`brand_code không tồn tại: ${r.data.brand_code}`);
    if (r.data.status && !SHOOT_STATUSES.has(r.data.status.trim().toLowerCase())) errors.push(`status không hợp lệ: ${r.data.status}`);

    const existingId = shootCode ? existingByCode.get(shootCode) : undefined;
    shoots.push({
      rowNumber: r.rowNumber,
      raw: r.data,
      errors,
      shootCode: shootCode ?? "",
      result: errors.length ? "error" : existingId ? "updated" : "created",
      existingId,
    });
  }

  const validShootCodes = new Set(shoots.filter((s) => s.result !== "error").map((s) => s.shootCode));
  const deliverables: T7DeliverableRow[] = [];
  for (const r of deliverableRows) {
    const errors: string[] = [];
    const shootCode = r.data.shoot_code?.trim();
    const deliverableType = r.data.deliverable_type?.trim();
    if (!shootCode) errors.push("Thiếu shoot_code");
    else if (!validShootCodes.has(shootCode) && !existingByCode.has(shootCode)) errors.push(`shoot_code không tồn tại (SHOOTS): ${shootCode}`);
    if (!deliverableType) errors.push("Thiếu deliverable_type");
    if (r.data.brand_code && !brandCodes.has(r.data.brand_code.trim())) errors.push(`brand_code không tồn tại: ${r.data.brand_code}`);
    if (r.data.campaign_code && !campaignCodes.has(r.data.campaign_code.trim())) errors.push(`campaign_code không tồn tại: ${r.data.campaign_code}`);
    if (r.data.editor_email && !userEmails.has(r.data.editor_email.trim().toLowerCase())) errors.push(`editor_email không tồn tại: ${r.data.editor_email}`);
    deliverables.push({ rowNumber: r.rowNumber, raw: r.data, errors, shootCode: shootCode ?? "", result: errors.length ? "error" : "created" });
  }

  return { shoots, deliverables };
}

export async function createPendingBatchT7(
  db: DB,
  fileName: string,
  uploadedBy: string,
  data: { shoots: T7ShootRow[]; deliverables: T7DeliverableRow[] },
) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      template: "T7",
      fileName,
      uploadedBy,
      createdCount: data.shoots.filter((r) => r.result === "created").length + data.deliverables.filter((r) => r.result === "created").length,
      updatedCount: data.shoots.filter((r) => r.result === "updated").length,
      errorCount: data.shoots.filter((r) => r.result === "error").length + data.deliverables.filter((r) => r.result === "error").length,
    })
    .returning();
  await db.insert(importRows).values([
    ...data.shoots.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: "SHOOTS",
      rawData: r.raw,
      result: r.result,
      entityType: "media_shoot",
      entityId: r.existingId ?? null,
      message: r.errors.join("; ") || null,
    })),
    ...data.deliverables.map((r) => ({
      batchId: batch.id,
      rowNumber: r.rowNumber,
      sheet: "DELIVERABLES",
      rawData: r.raw,
      result: r.result,
      entityType: "media_deliverable",
      entityId: null,
      message: r.errors.join("; ") || null,
    })),
  ]);
  return batch;
}

export async function confirmT7Import(db: DB, batchId: string, actorId: string) {
  const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
  const allBrands = await db.select({ id: brands.id, code: brands.code }).from(brands);
  const allSbus = await db.select({ id: sbus.id, code: sbus.code }).from(sbus);
  const allCampaigns = await db.select({ id: campaigns.id, code: campaigns.code }).from(campaigns);
  const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

  let shootsCreated = 0;
  let shootsUpdated = 0;
  let deliverablesCreated = 0;

  const shootCodeToId = new Map<string, string>();
  for (const row of rows.filter((r) => r.sheet === "SHOOTS" && r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const sbu = raw.sbu_code ? allSbus.find((s) => s.code === raw.sbu_code.trim()) : undefined;
    const brand = raw.brand_code ? allBrands.find((b) => b.code === raw.brand_code.trim()) : undefined;
    if (row.entityId) {
      await db
        .update(mediaShoots)
        .set({
          shootDate: parseDate(raw.shoot_date) as string,
          location: raw.location || null,
          sbuId: sbu?.id ?? null,
          brandId: brand?.id ?? null,
          purpose: raw.purpose || null,
          crew: raw.crew || null,
          equipment: raw.equipment || null,
          scriptUrl: raw.script_url || null,
          status: (raw.status?.trim().toLowerCase() as never) || undefined,
          notes: raw.notes || null,
          updatedBy: actorId,
        })
        .where(eq(mediaShoots.id, row.entityId));
      shootCodeToId.set(raw.shoot_code.trim(), row.entityId);
      shootsUpdated++;
    } else {
      const shoot = await createMediaShoot(
        db,
        {
          shootDate: parseDate(raw.shoot_date) as string,
          location: raw.location || null,
          sbuId: sbu?.id ?? null,
          brandId: brand?.id ?? null,
          purpose: raw.purpose || null,
          crew: raw.crew || null,
          equipment: raw.equipment || null,
          scriptUrl: raw.script_url || null,
          notes: raw.notes || null,
        },
        actorId,
      );
      // createMediaShoot tự sinh code riêng — ghi đè bằng code người dùng chỉ định trong file để khớp DELIVERABLES.
      await db.update(mediaShoots).set({ code: raw.shoot_code.trim() }).where(eq(mediaShoots.id, shoot.id));
      shootCodeToId.set(raw.shoot_code.trim(), shoot.id);
      await db.update(importRows).set({ entityId: shoot.id }).where(eq(importRows.id, row.id));
      shootsCreated++;
    }
  }

  // Shoot_code đã tồn tại từ trước (không nằm trong sheet SHOOTS của lần nạp này).
  const existingShoots = await db.select({ id: mediaShoots.id, code: mediaShoots.code }).from(mediaShoots);
  for (const s of existingShoots) if (!shootCodeToId.has(s.code)) shootCodeToId.set(s.code, s.id);

  for (const row of rows.filter((r) => r.sheet === "DELIVERABLES" && r.result !== "error")) {
    const raw = row.rawData as Record<string, string>;
    const shootId = shootCodeToId.get(raw.shoot_code.trim());
    if (!shootId) continue;
    const brand = raw.brand_code ? allBrands.find((b) => b.code === raw.brand_code.trim()) : undefined;
    const campaign = raw.campaign_code ? allCampaigns.find((c) => c.code === raw.campaign_code.trim()) : undefined;
    const editor = raw.editor_email ? allUsers.find((u) => u.email.toLowerCase() === raw.editor_email.trim().toLowerCase()) : undefined;
    await addMediaDeliverable(
      db,
      {
        shootId,
        deliverableType: raw.deliverable_type.trim(),
        quantity: raw.quantity ? Number(raw.quantity) : 1,
        channel: raw.channel || null,
        brandId: brand?.id ?? null,
        campaignId: campaign?.id ?? null,
        editorId: editor?.id ?? null,
        dueDate: raw.due_date ? parseDate(raw.due_date) : null,
      },
      actorId,
    );
    deliverablesCreated++;
  }

  const summary = { shootsCreated, shootsUpdated, deliverablesCreated };
  await db.update(importBatches).set({ summary }).where(eq(importBatches.id, batchId));
  return summary;
}
