import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import {
  STAGE_RANK,
  leadInteractions,
  leadStageHistory,
  leads,
  notifications,
} from "@/lib/db/schema";
import { vnDayStr } from "@/lib/time";
import { nextLeadCode } from "./codes";
import { ServiceError } from "./errors";
import { LOST_REMARKETING_DAYS } from "./escalate";
import type { AnyDb } from "./metrics";
import { assertNotLocked } from "./period-lock";
import { normalizeName, normalizePhone } from "./text-normalize";
import { addDaysStr } from "@/lib/time";

type Stage = keyof typeof STAGE_RANK;
type Outcome = "OPEN" | "WON" | "LOST" | "DISQUALIFIED";
type Source = (typeof leads.source.enumValues)[number];

const PAID_FORBIDDEN_SOURCES: Source[] = ["ORGANIC", "REFERRAL", "HOTLINE"];

export function stageRank(s: Stage): number {
  return STAGE_RANK[s];
}
export function maxStage(a: Stage, b: Stage): Stage {
  return stageRank(a) >= stageRank(b) ? a : b;
}

export interface CreateLeadInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  fbProfile?: string | null;
  productId: string;
  productRaw?: string | null;
  source: Source;
  campaignId?: string | null;
  stage?: Stage;
  assignedTo?: string | null;
  nextContactDate?: string | null;
  consultNote?: string | null;
  receivedAt?: Date;
  migrated?: boolean;
}

export interface Actor {
  id: string;
  role: string;
}

/** Tạo lead mới — SPEC Mục 11.3. Validate V05/V07. */
export async function createLead(
  db: AnyDb,
  input: CreateLeadInput,
  actor: Actor,
): Promise<{ id: string; code: string }> {
  const stage: Stage = input.stage ?? "NEW";

  // V05 — nguồn organic/referral/hotline không được gán campaign trả phí.
  if (input.campaignId && PAID_FORBIDDEN_SOURCES.includes(input.source)) {
    throw new ServiceError(
      "Lead nguồn Organic / Giới thiệu / Hotline không được gán campaign trả phí (V05).",
      "V05",
    );
  }
  // V07 — stage != NEW mà thiếu người phụ trách.
  if (stage !== "NEW" && !input.assignedTo) {
    throw new ServiceError(
      "Lead không ở giai đoạn 'Mới' thì bắt buộc có người phụ trách (V07).",
      "V07",
    );
  }

  const receivedAt = input.receivedAt ?? new Date();
  const code = await nextLeadCode(db, receivedAt);
  const now = new Date();

  const [row] = await db
    .insert(leads)
    .values({
      code,
      receivedAt,
      fullName: input.fullName.trim(),
      nameNormalized: normalizeName(input.fullName),
      phone: normalizePhone(input.phone),
      phoneNormalized: normalizePhone(input.phone),
      email: input.email?.trim() || null,
      fbProfile: input.fbProfile?.trim() || null,
      productId: input.productId,
      productRaw: input.productRaw?.trim() || null,
      source: input.source,
      campaignId: input.campaignId || null,
      stage,
      maxStage: stage,
      outcome: "OPEN",
      assignedTo: input.assignedTo || null,
      originallyAssignedTo: input.assignedTo || null,
      nextContactDate: input.nextContactDate || null,
      consultNote: input.consultNote?.trim() || null,
      mqlAt: stageRank(stage) >= STAGE_RANK.MQL ? now : null,
      sqlAt: stageRank(stage) >= STAGE_RANK.SQL ? now : null,
      migrated: input.migrated ?? false,
      createdBy: actor.id,
      updatedBy: actor.id,
    })
    .returning({ id: leads.id, code: leads.code });

  await db.insert(leadStageHistory).values({
    leadId: row.id,
    fromStage: null,
    toStage: stage,
    fromOutcome: null,
    toOutcome: "OPEN",
    changedBy: actor.id,
    reason: "Tạo lead",
  });

  await writeAudit(db, {
    actorId: actor.id,
    entity: "leads",
    entityId: row.id,
    action: "CREATE",
    changes: {
      stage: { from: null, to: stage },
      source: { from: null, to: input.source },
      assigned_to: { from: null, to: input.assignedTo ?? null },
    },
  });

  return row;
}

export interface UpdateLeadPatch {
  stage?: Stage;
  outcome?: Outcome;
  assignedTo?: string | null;
  nextContactDate?: string | null;
  silenceCount?: number;
  mqlAt?: Date | null;
  lostReason?: string | null;
  disqualifyReason?:
    | "SPAM"
    | "WRONG_TARGET"
    | "COMPETITOR"
    | "DUPLICATE"
    | "KHAC"
    | null;
  isCold?: boolean;
  source?: Source;
  consultNote?: string | null;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  fbProfile?: string | null;
  productId?: string | null;
  campaignId?: string | null;
  productRaw?: string | null;
  placementTestResult?: string | null;
  classAssigned?: string | null;
  preferredSchedule?: string | null;
  desiredStartDate?: string | null;
  emsStatus?: "CHUA" | "DA_NHAP";
  emsLink?: string | null;
  /** lý do khi hạ giai đoạn / đổi WON — SPEC 8.1. */
  reason?: string;
  /** nội bộ: cho phép đặt WON (chỉ enrollments.ts gọi). */
  _fromEnrollment?: boolean;
}

/**
 * Cập nhật lead — máy trạng thái SPEC Mục 8.1.
 *  - max_stage = GREATEST(cũ, mới), chỉ tăng.
 *  - mql_at/sql_at ghi lần đầu đạt giai đoạn (cho sửa mql_at về quá khứ, có audit).
 *  - outcome LOST: bắt buộc lost_reason >=10 ký tự (V03), tự đặt next_contact_date +45 ngày.
 *  - outcome DISQUALIFIED: bắt buộc disqualify_reason, xóa next_contact_date (V02).
 *  - Không cho đặt WON trực tiếp (V04) — chỉ qua enrollment.
 *  - WON -> khác: chỉ MANAGER/ADMIN, bắt buộc lý do.
 *  - V01: outcome OPEN + đã có interaction -> bắt buộc next_contact_date.
 *  - V13: chặn nếu ngày liên quan thuộc kỳ đã khóa (trừ ADMIN).
 */
export async function updateLead(
  db: AnyDb,
  id: string,
  patch: UpdateLeadPatch,
  actor: Actor,
): Promise<void> {
  const [before] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
    .limit(1);
  if (!before) throw new ServiceError("Không tìm thấy lead.", "NOT_FOUND");

  // V13 — kỳ khóa sổ: chặn nếu lead đã WON và won_at thuộc kỳ khóa.
  if (before.wonAt) {
    await assertNotLocked(db, vnDayStr(before.wonAt), actor.role);
  }

  const now = new Date();
  const set: Partial<typeof leads.$inferInsert> = { updatedBy: actor.id };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const auditTouched = [
    "stage",
    "outcome",
    "assigned_to",
    "next_contact_date",
    "full_name",
    "phone",
    "email",
    "source",
    "product_id",
    "consult_note",
    "campaign_id",
    "ems_status",
    "ems_link",
  ];

  let curStage = before.stage as Stage;
  let curOutcome = before.outcome as Outcome;

  // ---- đổi giai đoạn ----
  if (patch.stage && patch.stage !== curStage) {
    const goingDown = stageRank(patch.stage) < stageRank(curStage);
    if (goingDown && !patch.reason) {
      throw new ServiceError("Hạ giai đoạn phải kèm lý do (SPEC 8.1).", "NEED_REASON");
    }
    if (patch.stage === "WON" && !patch._fromEnrollment) {
      throw new ServiceError(
        "Chỉ có thể lên 'Chốt HV' qua việc tạo doanh thu (enrollment) — V04.",
        "V04",
      );
    }
    changes.stage = { from: curStage, to: patch.stage };
    set.stage = patch.stage;
    const newMax = maxStage(before.maxStage as Stage, patch.stage);
    if (newMax !== before.maxStage) set.maxStage = newMax;
    curStage = patch.stage;

    // mốc thời gian lần đầu đạt
    if (
      stageRank(newMax) >= STAGE_RANK.MQL &&
      !before.mqlAt &&
      !patch.mqlAt
    )
      set.mqlAt = now;
    if (stageRank(newMax) >= STAGE_RANK.SQL && !before.sqlAt) set.sqlAt = now;
  }

  // cho phép sửa mql_at về quá khứ (nhập trễ) — SPEC 8.1
  if (patch.mqlAt !== undefined) {
    set.mqlAt = patch.mqlAt;
    changes.mql_at = { from: before.mqlAt, to: patch.mqlAt };
  }

  // ---- đổi kết quả ----
  if (patch.outcome && patch.outcome !== curOutcome) {
    if (curOutcome === "WON" && !["ADMIN", "MANAGER"].includes(actor.role)) {
      throw new ServiceError(
        "Chỉ MANAGER trở lên mới đổi trạng thái của lead đã chốt (SPEC 8.1).",
        "WON_LOCKED",
      );
    }
    if (curOutcome === "WON" && !patch.reason) {
      throw new ServiceError("Đổi trạng thái lead đã chốt phải kèm lý do.", "NEED_REASON");
    }
    if (patch.outcome === "WON" && !patch._fromEnrollment) {
      throw new ServiceError("Chốt HV chỉ qua tạo enrollment (V04).", "V04");
    }

    if (patch.outcome === "LOST") {
      const reason = (patch.lostReason ?? "").trim();
      if (reason.length < 10) {
        throw new ServiceError("Lý do không chốt phải từ 10 ký tự (V03).", "V03");
      }
      set.lostReason = reason;
      // SPEC 8.1 — KHÔNG xóa next_contact_date, tự đặt +45 ngày remarketing
      set.nextContactDate = addDaysStr(vnDayStr(now), LOST_REMARKETING_DAYS);
      changes.next_contact_date = {
        from: before.nextContactDate,
        to: set.nextContactDate,
      };
    }
    if (patch.outcome === "DISQUALIFIED") {
      if (!patch.disqualifyReason) {
        throw new ServiceError("Phải chọn lý do 'Không nhu cầu / Spam' (V02).", "V02");
      }
      set.disqualifyReason = patch.disqualifyReason;
      set.nextContactDate = null; // V02
      changes.next_contact_date = { from: before.nextContactDate, to: null };
    }
    changes.outcome = { from: curOutcome, to: patch.outcome };
    set.outcome = patch.outcome;
    curOutcome = patch.outcome;
  }

  // ---- phân công ----
  if (patch.assignedTo !== undefined && patch.assignedTo !== before.assignedTo) {
    set.assignedTo = patch.assignedTo;
    changes.assigned_to = { from: before.assignedTo, to: patch.assignedTo };
  }

  // ---- ngày LH lại (nếu chưa bị các nhánh trên xử lý) ----
  if (
    patch.nextContactDate !== undefined &&
    set.nextContactDate === undefined &&
    patch.nextContactDate !== before.nextContactDate
  ) {
    set.nextContactDate = patch.nextContactDate;
    changes.next_contact_date = {
      from: before.nextContactDate,
      to: patch.nextContactDate,
    };
  }

  if (patch.silenceCount !== undefined) set.silenceCount = patch.silenceCount;
  if (patch.isCold !== undefined) set.isCold = patch.isCold;

  // ---- các trường tự do khác ----
  for (const f of [
    "productRaw",
    "placementTestResult",
    "classAssigned",
    "preferredSchedule",
  ] as const) {
    if (patch[f] !== undefined) set[f] = patch[f] as never;
  }
  if (patch.consultNote !== undefined) {
    const to = patch.consultNote?.trim() || null;
    if (to !== before.consultNote) {
      set.consultNote = to;
      changes.consult_note = { from: before.consultNote, to };
    }
  }
  if (patch.desiredStartDate !== undefined)
    set.desiredStartDate = patch.desiredStartDate;
  if (patch.emsStatus !== undefined && patch.emsStatus !== before.emsStatus) {
    set.emsStatus = patch.emsStatus;
    changes.ems_status = { from: before.emsStatus, to: patch.emsStatus };
  }
  if (patch.emsLink !== undefined) {
    const to = patch.emsLink?.trim() || null;
    if (to !== before.emsLink) {
      set.emsLink = to;
      changes.ems_link = { from: before.emsLink, to };
    }
  }
  if (patch.fullName) {
    const to = patch.fullName.trim();
    if (to && to !== before.fullName) {
      set.fullName = to;
      set.nameNormalized = normalizeName(patch.fullName);
      changes.full_name = { from: before.fullName, to };
    }
  }
  if (patch.phone !== undefined) {
    const to = normalizePhone(patch.phone);
    if (to !== before.phone) {
      set.phone = to;
      set.phoneNormalized = to;
      changes.phone = { from: before.phone, to };
    }
  }
  if (patch.email !== undefined) {
    const to = patch.email?.trim() || null;
    if (to !== before.email) {
      set.email = to;
      changes.email = { from: before.email, to };
    }
  }
  if (patch.fbProfile !== undefined) set.fbProfile = patch.fbProfile?.trim() || null;
  if (patch.productId && patch.productId !== before.productId) {
    set.productId = patch.productId;
    changes.product_id = { from: before.productId, to: patch.productId };
  }

  // Nguồn hiện tại (sau khi tính patch.source) — dùng cho kiểm tra V05.
  const nextSource: Source =
    patch.source && patch.source !== before.source
      ? patch.source
      : (before.source as Source);
  if (patch.source && patch.source !== before.source) {
    const keepsCampaign =
      patch.campaignId !== undefined
        ? patch.campaignId != null
        : before.campaignId != null;
    if (keepsCampaign && PAID_FORBIDDEN_SOURCES.includes(patch.source)) {
      throw new ServiceError(
        "Nguồn này không được gắn campaign trả phí — bỏ campaign trước khi đổi nguồn (V05).",
        "V05",
      );
    }
    set.source = patch.source;
    changes.source = { from: before.source, to: patch.source };
  }

  if (patch.campaignId !== undefined && patch.campaignId !== before.campaignId) {
    // V05 — nguồn không được phép gắn campaign trả phí
    if (patch.campaignId && PAID_FORBIDDEN_SOURCES.includes(nextSource)) {
      throw new ServiceError("Nguồn hiện tại không được gán campaign trả phí (V05).", "V05");
    }
    set.campaignId = patch.campaignId;
    changes.campaign_id = { from: before.campaignId, to: patch.campaignId };
  }

  // ---- V01: OPEN + đã có interaction -> phải có next_contact_date ----
  const finalOutcome = curOutcome;
  const finalNext =
    set.nextContactDate !== undefined
      ? set.nextContactDate
      : before.nextContactDate;
  if (finalOutcome === "OPEN" && !finalNext) {
    const [ic] = await db
      .select({ c: sql<number>`count(*)` })
      .from(leadInteractions)
      .where(eq(leadInteractions.leadId, id));
    if (Number(ic?.c ?? 0) > 0) {
      throw new ServiceError(
        "Lead đang theo và đã có tương tác thì bắt buộc có Ngày LH lại (V01).",
        "V01",
      );
    }
  }

  if (Object.keys(set).length <= 1) return; // chỉ có updatedBy

  await db.update(leads).set(set).where(eq(leads.id, id));

  if (set.stage !== undefined || set.outcome !== undefined) {
    await db.insert(leadStageHistory).values({
      leadId: id,
      fromStage: before.stage,
      toStage: (set.stage as Stage) ?? before.stage,
      fromOutcome: before.outcome,
      toOutcome: (set.outcome as Outcome) ?? before.outcome,
      changedBy: actor.id,
      reason: patch.reason ?? null,
    });
  }

  const audited = Object.fromEntries(
    Object.entries(changes).filter(([k]) => auditTouched.includes(k) || k === "mql_at"),
  );
  if (Object.keys(audited).length > 0) {
    await writeAudit(db, {
      actorId: actor.id,
      entity: "leads",
      entityId: id,
      action: "UPDATE",
      changes: audited,
    });
  }

  // Lead chuyển sang trạng thái đóng -> không cần chăm sóc nữa: đóng task LEAD_CARE.
  if (
    set.outcome !== undefined &&
    ["WON", "LOST", "DISQUALIFIED"].includes(set.outcome as string)
  ) {
    const { completeLeadCareTasks } = await import("./lead-care-tasks");
    await completeLeadCareTasks(db, id, actor, `Lead chuyển ${set.outcome}`);
  }
}

/** Phân công lại — SPEC Mục 11.5. Ghi audit + thông báo cả hai bên. */
export async function reassignLead(
  db: AnyDb,
  id: string,
  toUserId: string,
  actor: Actor,
  reason?: string,
): Promise<void> {
  const [lead] = await db
    .select({ id: leads.id, code: leads.code, assignedTo: leads.assignedTo })
    .from(leads)
    .where(eq(leads.id, id))
    .limit(1);
  if (!lead) throw new ServiceError("Không tìm thấy lead.", "NOT_FOUND");
  if (lead.assignedTo === toUserId) return;

  await db.update(leads).set({ assignedTo: toUserId, updatedBy: actor.id }).where(eq(leads.id, id));

  await writeAudit(db, {
    actorId: actor.id,
    entity: "leads",
    entityId: id,
    action: "UPDATE",
    changes: { assigned_to: { from: lead.assignedTo, to: toUserId } },
  });

  const notifRows = [
    {
      userId: toUserId,
      type: "ASSIGNMENT" as const,
      severity: "INFO" as const,
      title: `Bạn được giao lead ${lead.code}`,
      body: reason ?? null,
      linkUrl: `/lead/${id}`,
    },
  ];
  if (lead.assignedTo && lead.assignedTo !== actor.id) {
    notifRows.push({
      userId: lead.assignedTo,
      type: "ASSIGNMENT" as const,
      severity: "INFO" as const,
      title: `Lead ${lead.code} đã chuyển sang người khác`,
      body: reason ?? null,
      linkUrl: `/lead/${id}`,
    });
  }
  await db.insert(notifications).values(notifRows);
}

/** Lịch sử chuyển giai đoạn của một lead. */
export async function getStageHistory(db: AnyDb, leadId: string) {
  return db
    .select()
    .from(leadStageHistory)
    .where(eq(leadStageHistory.leadId, leadId))
    .orderBy(desc(leadStageHistory.changedAt));
}
