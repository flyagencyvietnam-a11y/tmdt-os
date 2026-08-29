/**
 * Kéo spend/messages tự động từ Meta Marketing API — QĐ08 / SPEC Mục 21 (Phase 4).
 *
 * TRẠNG THÁI: stub. Bảng `campaign_daily_metrics` đã sẵn cột `source` (MANUAL | API).
 * Khi có Meta app + access token + ad account id, hoàn thiện `fetchInsights` rồi
 * lên lịch trong `src/lib/cron.ts`.
 */
import { and, eq } from "drizzle-orm";
import { campaignDailyMetrics, campaigns } from "@/lib/db/schema";
import type { AnyDb } from "./metrics";

export function isMetaConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

interface Insight {
  externalId: string; // campaign id trên Meta
  date: string; // YYYY-MM-DD
  spend: number;
  messages: number; // messaging_conversation_started + lead
}

/** TODO: gọi Graph API /{ad_account}/insights, level=campaign, breakdown theo ngày. */
async function fetchInsights(range: { from: string; to: string }): Promise<Insight[]> {
  if (!isMetaConfigured()) return [];
  throw new Error(
    `Meta sync chưa được cài đặt (QĐ08 — Phase 4). range=${range.from}..${range.to}`,
  );
}

/**
 * Đồng bộ 1 khoảng ngày: chỉ ghi đè các dòng có source = 'API' (không đụng số nhập tay).
 */
export async function syncMetaMetrics(
  db: AnyDb,
  range: { from: string; to: string },
): Promise<{ synced: number; skipped: number }> {
  const insights = await fetchInsights(range);
  const camps = await db
    .select({ id: campaigns.id, externalId: campaigns.externalId })
    .from(campaigns);
  const idByExt = new Map(
    camps.filter((c) => c.externalId).map((c) => [c.externalId as string, c.id]),
  );

  let synced = 0;
  let skipped = 0;
  for (const ins of insights) {
    const campaignId = idByExt.get(ins.externalId);
    if (!campaignId) {
      skipped++;
      continue;
    }
    const [existing] = await db
      .select({ id: campaignDailyMetrics.id, source: campaignDailyMetrics.source })
      .from(campaignDailyMetrics)
      .where(
        and(
          eq(campaignDailyMetrics.campaignId, campaignId),
          eq(campaignDailyMetrics.metricDate, ins.date),
        ),
      )
      .limit(1);
    if (existing && existing.source === "MANUAL") {
      skipped++; // tôn trọng số nhập tay
      continue;
    }
    if (existing) {
      await db
        .update(campaignDailyMetrics)
        .set({ spend: Math.round(ins.spend), messages: Math.round(ins.messages) })
        .where(eq(campaignDailyMetrics.id, existing.id));
    } else {
      await db.insert(campaignDailyMetrics).values({
        campaignId,
        metricDate: ins.date,
        spend: Math.round(ins.spend),
        messages: Math.round(ins.messages),
        source: "API",
        note: "Meta API",
      });
    }
    synced++;
  }
  return { synced, skipped };
}
