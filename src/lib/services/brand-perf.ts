import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brandChannels, brandPerfMetrics, sbus } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { CHANNEL_METRICS, METRICS, type ChannelKey, type MetricKey } from "@/lib/brand-perf";
import { ServiceError } from "./errors";

/** Các brand/sản phẩm (SBU kiểu brand) đang hoạt động — thứ tự VMG trước, sau đó theo mã. */
export async function listBrandSbus(db: DB) {
  const rows = await db
    .select({ id: sbus.id, code: sbus.code, name: sbus.name, brandId: sbus.brandId })
    .from(sbus)
    .where(and(eq(sbus.kind, "brand"), eq(sbus.active, true)))
    .orderBy(asc(sbus.code));
  return rows.sort((a, b) => Number(b.code === "VMG") - Number(a.code === "VMG") || a.code.localeCompare(b.code));
}

export async function listBrandPerf(db: DB) {
  const [channels, metrics] = await Promise.all([
    db.select().from(brandChannels).orderBy(asc(brandChannels.sortOrder), asc(brandChannels.createdAt)),
    db.select().from(brandPerfMetrics),
  ]);
  return { channels, metrics };
}

const COLUMN: Record<MetricKey, keyof typeof brandPerfMetrics.$inferInsert> = {
  impressions: "impressions",
  reach: "reach",
  engagements: "engagements",
  videoViews: "videoViews",
  linkClicks: "linkClicks",
  sessions: "sessions",
  posts: "posts",
  followers: "followers",
  newFollowers: "newFollowers",
};

/** Ghi 1 ô của ma trận (brand × kênh × tháng × chỉ số). value null = xoá số. Chỉ ghi đúng 1 trường. */
export async function setBrandPerfValue(
  db: DB,
  input: { sbuId: string; channel: string; period: string; metric: MetricKey; value: number | null },
  actorId: string | null,
) {
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new ServiceError("Kỳ phải dạng tháng (yyyy-mm).", "VALIDATION");
  if (!METRICS.some((m) => m.key === input.metric)) throw new ServiceError("Chỉ số không hợp lệ.", "VALIDATION");
  if (!(CHANNEL_METRICS[input.channel as ChannelKey] ?? CHANNEL_METRICS.other).includes(input.metric)) throw new ServiceError("Chỉ số này không áp dụng cho kênh.", "VALIDATION");
  if (input.value != null && (!Number.isFinite(input.value) || input.value < 0)) throw new ServiceError("Số liệu phải là số ≥ 0.", "VALIDATION");
  const col = COLUMN[input.metric];
  const val = input.value == null ? null : String(Math.round(input.value));
  await db
    .insert(brandPerfMetrics)
    .values({ sbuId: input.sbuId, channel: input.channel, period: input.period, [col]: val, createdBy: actorId })
    .onConflictDoUpdate({
      target: [brandPerfMetrics.sbuId, brandPerfMetrics.channel, brandPerfMetrics.period],
      set: { [col]: val, updatedBy: actorId, updatedAt: new Date() },
    });
  await writeAudit(db, { actorId, entity: "brand_perf_metrics", entityId: null, action: "UPDATE", changes: { ...input } as Record<string, unknown> });
}

export async function addBrandChannel(db: DB, input: { sbuId: string; channel: string; label?: string | null; url?: string | null }, actorId: string | null) {
  if (!CHANNEL_METRICS[input.channel as ChannelKey]) throw new ServiceError("Kênh không hợp lệ.", "VALIDATION");
  const [dup] = await db.select({ id: brandChannels.id }).from(brandChannels).where(and(eq(brandChannels.sbuId, input.sbuId), eq(brandChannels.channel, input.channel))).limit(1);
  if (dup) throw new ServiceError("Brand này đã có kênh đó.", "DUPLICATE");
  const existing = await db.select({ id: brandChannels.id }).from(brandChannels).where(eq(brandChannels.sbuId, input.sbuId));
  const [row] = await db
    .insert(brandChannels)
    .values({ sbuId: input.sbuId, channel: input.channel, label: input.label?.trim() || null, url: input.url?.trim() || null, sortOrder: existing.length, createdBy: actorId })
    .returning();
  await writeAudit(db, { actorId, entity: "brand_channels", entityId: row.id, action: "CREATE" });
  return row;
}

export async function updateBrandChannel(db: DB, id: string, patch: { label?: string | null; url?: string | null }, actorId: string | null) {
  await db
    .update(brandChannels)
    .set({ ...(patch.label !== undefined ? { label: patch.label?.trim() || null } : {}), ...(patch.url !== undefined ? { url: patch.url?.trim() || null } : {}), updatedBy: actorId })
    .where(eq(brandChannels.id, id));
}

/** Bỏ kênh khỏi ma trận của brand. Số liệu các tháng đã nhập được GIỮ NGUYÊN (thêm lại kênh sẽ thấy lại). */
export async function removeBrandChannel(db: DB, id: string, actorId: string | null) {
  await db.delete(brandChannels).where(eq(brandChannels.id, id));
  await writeAudit(db, { actorId, entity: "brand_channels", entityId: id, action: "DELETE" });
}
