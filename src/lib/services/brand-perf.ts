import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { brandChannels, brandPerfMetrics, sbus } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { accountKeyFromUrl, CHANNEL_METRICS, METRICS, type ChannelKey, type MetricKey } from "@/lib/brand-perf";
import { ServiceError } from "./errors";

/** Các brand/sản phẩm (SBU kiểu brand) đang hoạt động — VMG rồi VMG English (kênh trung tâm) trước, sau đó theo mã. */
export async function listBrandSbus(db: DB) {
  const rows = await db
    .select({ id: sbus.id, code: sbus.code, name: sbus.name, brandId: sbus.brandId })
    .from(sbus)
    .where(and(eq(sbus.kind, "brand"), eq(sbus.active, true)))
    .orderBy(asc(sbus.code));
  const first = ["VMG", "VMG_ENGLISH"];
  const rank = (c: string) => (first.includes(c) ? first.indexOf(c) : first.length);
  return rows.sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
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
  input: { sbuId: string; channel: string; /** Khoá tài khoản của kênh (brand_channels.account); bỏ trống = tài khoản mặc định. */ account?: string; period: string; metric: MetricKey; value: number | null },
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
    .values({ sbuId: input.sbuId, channel: input.channel, account: input.account ?? "", period: input.period, [col]: val, createdBy: actorId })
    .onConflictDoUpdate({
      target: [brandPerfMetrics.sbuId, brandPerfMetrics.channel, brandPerfMetrics.account, brandPerfMetrics.period],
      set: { [col]: val, updatedBy: actorId, updatedAt: new Date() },
    });
  await writeAudit(db, { actorId, entity: "brand_perf_metrics", entityId: null, action: "UPDATE", changes: { ...input } as Record<string, unknown> });
}

/**
 * Thêm 1 kênh (tài khoản) cho brand. Một brand có thể có NHIỀU tài khoản cùng nền tảng (vd. 10 fanpage trung tâm) — mỗi tài khoản có
 * khoá `account` riêng, mặc định sinh từ link (ổn định khi nạp lại); không có link thì sinh khoá ngẫu nhiên.
 */
export async function addBrandChannel(
  db: DB,
  input: { sbuId: string; channel: string; account?: string; label?: string | null; url?: string | null; active?: boolean },
  actorId: string | null,
) {
  if (!CHANNEL_METRICS[input.channel as ChannelKey]) throw new ServiceError("Kênh không hợp lệ.", "VALIDATION");
  const existing = await db.select({ account: brandChannels.account, channel: brandChannels.channel }).from(brandChannels).where(eq(brandChannels.sbuId, input.sbuId));
  const taken = new Set(existing.filter((e) => e.channel === input.channel).map((e) => e.account));
  let account = input.account ?? accountKeyFromUrl(input.url);
  if (!input.account && !account && taken.has("")) account = `a-${Math.random().toString(36).slice(2, 8)}`;
  if (taken.has(account)) throw new ServiceError("Brand này đã có kênh/tài khoản đó (cùng nền tảng và cùng link).", "DUPLICATE");
  const [row] = await db
    .insert(brandChannels)
    .values({
      sbuId: input.sbuId,
      channel: input.channel,
      account,
      label: input.label?.trim() || null,
      url: input.url?.trim() || null,
      active: input.active ?? true,
      sortOrder: existing.length,
      createdBy: actorId,
    })
    .returning();
  await writeAudit(db, { actorId, entity: "brand_channels", entityId: row.id, action: "CREATE" });
  return row;
}

export async function updateBrandChannel(db: DB, id: string, patch: { label?: string | null; url?: string | null; active?: boolean }, actorId: string | null) {
  await db
    .update(brandChannels)
    .set({
      ...(patch.label !== undefined ? { label: patch.label?.trim() || null } : {}),
      ...(patch.url !== undefined ? { url: patch.url?.trim() || null } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedBy: actorId,
    })
    .where(eq(brandChannels.id, id));
  await writeAudit(db, { actorId, entity: "brand_channels", entityId: id, action: "UPDATE", changes: patch as Record<string, unknown> });
}

/** Bỏ kênh khỏi ma trận của brand. Số liệu các tháng đã nhập được GIỮ NGUYÊN (thêm lại kênh sẽ thấy lại). */
export async function removeBrandChannel(db: DB, id: string, actorId: string | null) {
  await db.delete(brandChannels).where(eq(brandChannels.id, id));
  await writeAudit(db, { actorId, entity: "brand_channels", entityId: id, action: "DELETE" });
}
