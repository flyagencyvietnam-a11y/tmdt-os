import { and, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { campaignDailyMetrics } from "@/lib/db/schema";
import { addDaysStr } from "@/lib/time";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import type { AnyDb } from "./metrics";
import { assertNotLocked } from "./period-lock";

export interface UpsertMetricInput {
  campaignId: string;
  metricDate: string; // YYYY-MM-DD
  spend: number;
  messages: number;
  note?: string | null;
}

/**
 * Nhập / sửa số liệu ads một ngày — SPEC Mục 7.4 / 10.2.
 * UNIQUE(campaign_id, metric_date): sửa thì cập nhật dòng cũ + ghi audit spend/messages.
 * V13: chặn nếu ngày thuộc kỳ đã khóa (trừ ADMIN).
 */
export async function upsertDailyMetric(
  db: AnyDb,
  input: UpsertMetricInput,
  actor: Actor,
): Promise<{ created: boolean }> {
  const spend = Math.round(input.spend);
  const messages = Math.round(input.messages);
  if (spend < 0 || messages < 0)
    throw new ServiceError("Spend và messages không được âm.", "NONNEG");

  await assertNotLocked(db, input.metricDate, actor.role);

  const [existing] = await db
    .select()
    .from(campaignDailyMetrics)
    .where(
      and(
        eq(campaignDailyMetrics.campaignId, input.campaignId),
        eq(campaignDailyMetrics.metricDate, input.metricDate),
      ),
    )
    .limit(1);

  if (!existing) {
    const [row] = await db
      .insert(campaignDailyMetrics)
      .values({
        campaignId: input.campaignId,
        metricDate: input.metricDate,
        spend,
        messages,
        note: input.note?.trim() || null,
        enteredBy: actor.id,
      })
      .returning({ id: campaignDailyMetrics.id });
    await writeAudit(db, {
      actorId: actor.id,
      entity: "campaign_daily_metrics",
      entityId: row.id,
      action: "CREATE",
      changes: {
        spend: { from: null, to: spend },
        messages: { from: null, to: messages },
      },
    });
    return { created: true };
  }

  if (existing.spend === spend && existing.messages === messages) return { created: false };

  await db
    .update(campaignDailyMetrics)
    .set({ spend, messages, note: input.note?.trim() ?? existing.note, enteredBy: actor.id })
    .where(eq(campaignDailyMetrics.id, existing.id));

  await writeAudit(db, {
    actorId: actor.id,
    entity: "campaign_daily_metrics",
    entityId: existing.id,
    action: "UPDATE",
    changes: {
      spend: { from: existing.spend, to: spend },
      messages: { from: existing.messages, to: messages },
    },
  });
  return { created: false };
}

/** "Sao chép từ hôm qua" cho campaign có ngân sách ổn định — SPEC Mục 10.2. */
export async function copyMetricFromPreviousDay(
  db: AnyDb,
  campaignId: string,
  targetDate: string,
  actor: Actor,
): Promise<boolean> {
  const prev = addDaysStr(targetDate, -1);
  const [row] = await db
    .select()
    .from(campaignDailyMetrics)
    .where(
      and(
        eq(campaignDailyMetrics.campaignId, campaignId),
        eq(campaignDailyMetrics.metricDate, prev),
      ),
    )
    .limit(1);
  if (!row) return false;
  await upsertDailyMetric(
    db,
    { campaignId, metricDate: targetDate, spend: row.spend, messages: row.messages },
    actor,
  );
  return true;
}
