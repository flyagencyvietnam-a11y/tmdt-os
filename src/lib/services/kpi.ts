import { and, eq, gte, lte } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { kpiAssignments, kpiDefinitions, otherCosts, users } from "@/lib/db/schema";
import { ServiceError } from "./errors";
import type { Actor } from "./leads";
import {
  computeKpiActual,
  type AnyDb,
  type FormulaKey,
  type MetricsFilter,
} from "./metrics";
import { notify } from "./notifications";
import { todayVnDayStr } from "@/lib/time";

// ---------------------------------------------------------------------------
//  Danh mục & giao chỉ tiêu
// ---------------------------------------------------------------------------

export function listKpiDefinitions(db: AnyDb) {
  return db.select().from(kpiDefinitions).orderBy(kpiDefinitions.code);
}

export interface KpiAssignmentInput {
  kpiDefinitionId: string;
  periodType: "MONTH" | "QUARTER" | "YEAR";
  periodStart: string;
  periodEnd: string;
  scopeType: "USER" | "TEAM" | "PRODUCT";
  userId?: string | null;
  productId?: string | null;
  targetValue: number;
  weightPct: number;
  thresholdTiers?: { pct: number }[];
  manualActual?: number | null;
  note?: string | null;
}

export async function createKpiAssignment(
  db: AnyDb,
  input: KpiAssignmentInput,
  actor: Actor,
): Promise<{ id: string }> {
  if (!["ADMIN", "MANAGER"].includes(actor.role))
    throw new ServiceError("Chỉ ADMIN/MANAGER được giao KPI.", "FORBIDDEN");
  if (input.scopeType === "USER" && !input.userId)
    throw new ServiceError("Phạm vi USER phải chọn người.", "NEED_USER");
  if (input.scopeType === "PRODUCT" && !input.productId)
    throw new ServiceError("Phạm vi PRODUCT phải chọn sản phẩm.", "NEED_PRODUCT");

  const [row] = await db
    .insert(kpiAssignments)
    .values({
      kpiDefinitionId: input.kpiDefinitionId,
      periodType: input.periodType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      scopeType: input.scopeType,
      userId: input.userId ?? null,
      productId: input.productId ?? null,
      targetValue: String(input.targetValue),
      weightPct: String(input.weightPct),
      thresholdTiers: input.thresholdTiers ?? [{ pct: 85 }, { pct: 90 }, { pct: 100 }],
      manualActual: input.manualActual != null ? String(input.manualActual) : null,
      note: input.note ?? null,
      createdBy: actor.id,
    })
    .returning({ id: kpiAssignments.id });

  await writeAudit(db, {
    actorId: actor.id,
    entity: "kpi_assignments",
    entityId: row.id,
    action: "CREATE",
    changes: {
      target_value: { from: null, to: input.targetValue },
      weight_pct: { from: null, to: input.weightPct },
    },
  });

  if (input.scopeType === "USER" && input.userId) {
    await notify(db, {
      userId: input.userId,
      type: "KPI_RISK",
      severity: "INFO",
      title: "Bạn được giao một chỉ tiêu KPI mới",
      body: `Kỳ ${input.periodStart} → ${input.periodEnd}, trọng số ${input.weightPct}%.`,
      linkUrl: "/kpi",
    });
  }
  return row;
}

export async function updateKpiAssignment(
  db: AnyDb,
  id: string,
  patch: Partial<Pick<KpiAssignmentInput, "targetValue" | "weightPct" | "manualActual" | "note">>,
  actor: Actor,
  reason?: string,
): Promise<void> {
  const [before] = await db
    .select()
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, id))
    .limit(1);
  if (!before) throw new ServiceError("Không tìm thấy chỉ tiêu.", "NOT_FOUND");

  // KPI đã giao và kỳ đã bắt đầu -> không sửa chỉ tiêu, trừ ADMIN kèm lý do (SPEC 14.3).
  const started = before.periodStart <= todayVnDayStr();
  const changingTarget =
    patch.targetValue !== undefined || patch.weightPct !== undefined;
  if (started && changingTarget) {
    if (actor.role !== "ADMIN")
      throw new ServiceError(
        "Kỳ đã bắt đầu — chỉ ADMIN mới sửa chỉ tiêu (SPEC 14.3).",
        "PERIOD_STARTED",
      );
    if (!reason?.trim())
      throw new ServiceError("Sửa chỉ tiêu đã giao phải kèm lý do.", "NEED_REASON");
  }

  const set: Partial<typeof kpiAssignments.$inferInsert> = {};
  if (patch.targetValue !== undefined) set.targetValue = String(patch.targetValue);
  if (patch.weightPct !== undefined) set.weightPct = String(patch.weightPct);
  if (patch.manualActual !== undefined)
    set.manualActual = patch.manualActual == null ? null : String(patch.manualActual);
  if (patch.note !== undefined) set.note = patch.note;
  if (Object.keys(set).length === 0) return;

  await db.update(kpiAssignments).set(set).where(eq(kpiAssignments.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "kpi_assignments",
    entityId: id,
    action: "UPDATE",
    changes: {
      ...(patch.targetValue !== undefined
        ? { target_value: { from: before.targetValue, to: patch.targetValue } }
        : {}),
      ...(patch.weightPct !== undefined
        ? { weight_pct: { from: before.weightPct, to: patch.weightPct } }
        : {}),
      ...(reason ? { reason: { from: null, to: reason } } : {}),
    },
  });
}

export async function deleteKpiAssignment(db: AnyDb, id: string, actor: Actor) {
  if (!["ADMIN", "MANAGER"].includes(actor.role))
    throw new ServiceError("Không có quyền.", "FORBIDDEN");
  await db.delete(kpiAssignments).where(eq(kpiAssignments.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "kpi_assignments",
    entityId: id,
    action: "DELETE",
  });
}

// ---------------------------------------------------------------------------
//  Tính tiến độ (SPEC Mục 14.4)
// ---------------------------------------------------------------------------

export interface KpiProgress {
  id: string;
  code: string;
  name: string;
  unit: string;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  source: "AUTO" | "MANUAL";
  periodStart: string;
  periodEnd: string;
  scopeType: string;
  userId: string | null;
  userName: string | null;
  productId: string | null;
  target: number;
  actual: number | null;
  /** % hoàn thành (đã tính theo chiều tốt của chỉ số). */
  completionPct: number | null;
  weightPct: number;
  /** Điểm quy đổi = min(completion, 1) × weight. */
  scoreContribution: number | null;
  thresholdTiers: { pct: number }[];
  /** Vạch tiến độ thời gian: hôm nay là ngày thứ mấy / tổng số ngày kỳ. */
  timeProgressPct: number;
  atRisk: boolean;
}

function completion(
  actual: number | null,
  target: number,
  direction: "HIGHER_BETTER" | "LOWER_BETTER",
): number | null {
  if (actual == null || target === 0) return null;
  return direction === "HIGHER_BETTER" ? actual / target : target / actual;
}

export async function getKpiProgressForPeriod(
  db: AnyDb,
  opts: { periodStart: string; periodEnd: string; userId?: string },
  now = new Date(),
): Promise<KpiProgress[]> {
  const conds = [
    eq(kpiAssignments.periodStart, opts.periodStart),
    eq(kpiAssignments.periodEnd, opts.periodEnd),
  ];
  if (opts.userId) conds.push(eq(kpiAssignments.userId, opts.userId));

  const rows = await db
    .select({
      a: kpiAssignments,
      d: kpiDefinitions,
      userName: users.fullName,
    })
    .from(kpiAssignments)
    .innerJoin(kpiDefinitions, eq(kpiDefinitions.id, kpiAssignments.kpiDefinitionId))
    .leftJoin(users, eq(users.id, kpiAssignments.userId))
    .where(and(...conds));

  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const totalDays =
    Math.round(
      (Date.parse(`${opts.periodEnd}T00:00:00Z`) -
        Date.parse(`${opts.periodStart}T00:00:00Z`)) /
        86_400_000,
    ) + 1;
  const elapsed = Math.min(
    totalDays,
    Math.max(
      0,
      Math.round(
        (Date.parse(`${today}T00:00:00Z`) -
          Date.parse(`${opts.periodStart}T00:00:00Z`)) /
          86_400_000,
      ) + 1,
    ),
  );
  const timeProgressPct = totalDays > 0 ? elapsed / totalDays : 0;

  const out: KpiProgress[] = [];
  for (const { a, d, userName } of rows) {
    let actual: number | null;
    if (d.source === "MANUAL") {
      actual = a.manualActual == null ? null : Number(a.manualActual);
    } else {
      const filter: MetricsFilter = {
        from: a.periodStart,
        to: a.periodEnd,
        assignedTo:
          a.scopeType === "USER" && a.userId ? [a.userId] : undefined,
        productIds:
          a.scopeType === "PRODUCT" && a.productId ? [a.productId] : undefined,
      };
      actual = await computeKpiActual(db, (d.formulaKey ?? "") as FormulaKey, filter);
    }
    const target = Number(a.targetValue);
    const comp = completion(actual, target, d.direction);
    const weight = Number(a.weightPct);
    const score = comp == null ? null : Math.min(comp, 1) * weight;
    const atRisk = comp != null && comp < timeProgressPct - 0.15;

    out.push({
      id: a.id,
      code: d.code,
      name: d.name,
      unit: d.unit,
      direction: d.direction,
      source: d.source,
      periodStart: a.periodStart,
      periodEnd: a.periodEnd,
      scopeType: a.scopeType,
      userId: a.userId,
      userName,
      productId: a.productId,
      target,
      actual,
      completionPct: comp,
      weightPct: weight,
      scoreContribution: score,
      thresholdTiers: (a.thresholdTiers ?? []) as { pct: number }[],
      timeProgressPct,
      atRisk,
    });
  }
  return out;
}

/** Điểm KPI tổng của 1 người = Σ(min(completion,1) × weight) / Σweight (SPEC 14.4). */
export function totalKpiScore(items: KpiProgress[]): number | null {
  const sw = items.reduce((s, i) => s + i.weightPct, 0);
  if (sw === 0) return null;
  const ss = items.reduce((s, i) => s + (i.scoreContribution ?? 0), 0);
  return ss / sw;
}

// ---------------------------------------------------------------------------
//  Chi phí khác (KOL/KOC) — QĐ07 / SPEC 14.2
// ---------------------------------------------------------------------------

export function listOtherCosts(
  db: AnyDb,
  range: { from: string; to: string },
) {
  return db
    .select()
    .from(otherCosts)
    .where(
      and(
        gte(otherCosts.incurredOn, range.from),
        lte(otherCosts.incurredOn, range.to),
      ),
    )
    .orderBy(otherCosts.incurredOn);
}

export async function addOtherCost(
  db: AnyDb,
  input: {
    costType: "KOL_KOC" | "TOOL" | "OTHER";
    incurredOn: string;
    productId?: string | null;
    amount: number;
    note?: string | null;
  },
  actor: Actor,
) {
  if (!["ADMIN", "MANAGER"].includes(actor.role))
    throw new ServiceError("Không có quyền.", "FORBIDDEN");
  const [row] = await db
    .insert(otherCosts)
    .values({
      costType: input.costType,
      incurredOn: input.incurredOn,
      productId: input.productId ?? null,
      amount: Math.round(input.amount),
      note: input.note ?? null,
      createdBy: actor.id,
    })
    .returning({ id: otherCosts.id });
  await writeAudit(db, {
    actorId: actor.id,
    entity: "other_costs",
    entityId: row.id,
    action: "CREATE",
    changes: { amount: { from: null, to: input.amount } },
  });
  return row;
}

export async function deleteOtherCost(db: AnyDb, id: string, actor: Actor) {
  if (!["ADMIN", "MANAGER"].includes(actor.role))
    throw new ServiceError("Không có quyền.", "FORBIDDEN");
  await db.delete(otherCosts).where(eq(otherCosts.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    entity: "other_costs",
    entityId: id,
    action: "DELETE",
  });
}
