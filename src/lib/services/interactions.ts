import { eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import {
  STAGE_RANK,
  leadInteractions,
  leadStageHistory,
  leads,
} from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import { ServiceError } from "./errors";
import {
  COLD_LOST_REASON,
  COLD_SILENCE_THRESHOLD,
  nextSilenceCount,
  suggestNextContactDate,
} from "./escalate";
import { completeLeadCareTasks } from "./lead-care-tasks";
import { maxStage, stageRank, type Actor } from "./leads";
import type { AnyDb } from "./metrics";

type Stage = keyof typeof STAGE_RANK;

export interface RecordInteractionInput {
  leadId: string;
  channel: "CALL" | "ZALO" | "MESSENGER" | "EMAIL" | "SMS" | "MEET";
  direction: "OUTBOUND" | "INBOUND";
  result: "RESPONDED" | "NO_RESPONSE" | "REFUSED" | "RESCHEDULED";
  content?: string | null;
  /** Giai đoạn mới sau lần chăm sóc (tùy chọn). */
  stageAfter?: Stage;
  stageChangeReason?: string;
  /** EC sửa Ngày LH lại đề xuất — bắt buộc kèm lý do (SPEC 8.2). */
  nextContactDateOverride?: string | null;
  overrideReason?: string;
  occurredAt?: Date;
}

export interface RecordInteractionResult {
  interactionId: string;
  silenceCount: number;
  nextContactDate: string | null;
  becameCold: boolean;
  suggestedNextContactDate: string | null;
}

/**
 * Ghi một tương tác chăm sóc và chạy cỗ máy escalate — SPEC Mục 8.2.
 */
export async function recordInteraction(
  db: AnyDb,
  input: RecordInteractionInput,
  actor: Actor,
): Promise<RecordInteractionResult> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, input.leadId))
    .limit(1);
  if (!lead) throw new ServiceError("Không tìm thấy lead.", "NOT_FOUND");
  if (lead.deletedAt) throw new ServiceError("Lead đã bị xóa.", "DELETED");

  const occurredAt = input.occurredAt ?? new Date();
  const today = todayVnDayStr(occurredAt);
  const newSilence = nextSilenceCount(lead.silenceCount, input.result);
  const becameCold = newSilence >= COLD_SILENCE_THRESHOLD;

  // Khách phản hồi lại một lead đang Cold / LOST -> gỡ Cold, mở lại theo dõi (SPEC 8.2).
  const warmBack =
    (lead.isCold || lead.outcome === "LOST") &&
    (input.result === "RESPONDED" || input.result === "RESCHEDULED");

  const suggested = becameCold
    ? null
    : await suggestNextContactDate(db, newSilence, today);

  let chosenNext: string | null = suggested;
  if (!becameCold && input.nextContactDateOverride !== undefined) {
    if (
      input.nextContactDateOverride !== suggested &&
      !input.overrideReason?.trim()
    ) {
      throw new ServiceError(
        "Sửa Ngày LH lại đề xuất thì phải ghi lý do một dòng (SPEC 8.2).",
        "NEED_OVERRIDE_REASON",
      );
    }
    chosenNext = input.nextContactDateOverride;
  }

  // ---- giai đoạn ----
  const stageBefore = lead.stage as Stage;
  let stageAfter = stageBefore;
  if (input.stageAfter && input.stageAfter !== stageBefore) {
    if (
      stageRank(input.stageAfter) < stageRank(stageBefore) &&
      !input.stageChangeReason?.trim()
    ) {
      throw new ServiceError("Hạ giai đoạn phải kèm lý do (SPEC 8.1).", "NEED_REASON");
    }
    if (input.stageAfter === "WON") {
      throw new ServiceError("Chốt HV chỉ qua tạo doanh thu (V04).", "V04");
    }
    stageAfter = input.stageAfter;
  }

  // ---- insert interaction ----
  const [ir] = await db
    .insert(leadInteractions)
    .values({
      leadId: lead.id,
      occurredAt,
      channel: input.channel,
      direction: input.direction,
      result: input.result,
      content: input.content?.trim() || null,
      stageBefore,
      stageAfter,
      nextContactDateSet: chosenNext,
      createdBy: actor.id,
    })
    .returning({ id: leadInteractions.id });

  // ---- cập nhật lead ----
  const set: Partial<typeof leads.$inferInsert> = {
    silenceCount: newSilence,
    lastContactedAt: occurredAt,
    updatedBy: actor.id,
  };
  const now = new Date();
  const audit: Record<string, { from: unknown; to: unknown }> = {};

  if (stageAfter !== stageBefore) {
    set.stage = stageAfter;
    const newMax = maxStage(lead.maxStage as Stage, stageAfter);
    if (newMax !== lead.maxStage) set.maxStage = newMax;
    if (stageRank(newMax) >= STAGE_RANK.MQL && !lead.mqlAt) set.mqlAt = now;
    if (stageRank(newMax) >= STAGE_RANK.SQL && !lead.sqlAt) set.sqlAt = now;
    audit.stage = { from: stageBefore, to: stageAfter };
  }

  if (becameCold) {
    set.isCold = true;
    set.outcome = "LOST";
    set.lostReason = COLD_LOST_REASON;
    set.nextContactDate = null;
    audit.outcome = { from: lead.outcome, to: "LOST" };
    audit.next_contact_date = { from: lead.nextContactDate, to: null };
  } else {
    set.nextContactDate = chosenNext;
    if (chosenNext !== lead.nextContactDate)
      audit.next_contact_date = { from: lead.nextContactDate, to: chosenNext };
    if (warmBack) {
      set.isCold = false;
      set.outcome = "OPEN";
      set.lostReason = null;
      audit.is_cold = { from: lead.isCold, to: false };
      audit.outcome = { from: lead.outcome, to: "OPEN" };
    }
  }

  await db.update(leads).set(set).where(eq(leads.id, lead.id));

  if (set.stage !== undefined || set.outcome !== undefined) {
    await db.insert(leadStageHistory).values({
      leadId: lead.id,
      fromStage: stageBefore,
      toStage: set.stage ?? stageBefore,
      fromOutcome: lead.outcome,
      toOutcome: set.outcome ?? lead.outcome,
      changedBy: becameCold ? null : actor.id,
      reason: becameCold
        ? "Tự chuyển Cold Data sau 5 phiên chăm sóc liên tiếp không phản hồi"
        : warmBack
          ? "Khách phản hồi lại — gỡ Cold, mở lại theo dõi (SPEC 8.2)"
          : (input.stageChangeReason ?? null),
    });
  }

  if (Object.keys(audit).length > 0) {
    await writeAudit(db, {
      actorId: actor.id,
      entity: "leads",
      entityId: lead.id,
      action: "UPDATE",
      changes: audit,
    });
  }

  // 1 task LEAD_CARE = 1 phiên chăm sóc: ghi tương tác xong -> đóng task đang mở.
  await completeLeadCareTasks(db, lead.id, actor, "Đã ghi nhận 1 phiên chăm sóc");

  return {
    interactionId: ir.id,
    silenceCount: newSilence,
    nextContactDate: becameCold ? null : chosenNext,
    becameCold,
    suggestedNextContactDate: suggested,
  };
}

/** Danh sách tương tác của lead, mới nhất trước. */
export async function listInteractions(db: AnyDb, leadId: string) {
  return db
    .select()
    .from(leadInteractions)
    .where(eq(leadInteractions.leadId, leadId))
    .orderBy(leadInteractions.occurredAt);
}
