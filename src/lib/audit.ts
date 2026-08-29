import { auditLogs } from "@/lib/db/schema";
import type { AnyDb } from "@/lib/services/metrics";

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "EXPORT"
  | "LOCK"
  | "UNLOCK";

export interface AuditInput {
  actorId?: string | null;
  entity: string;
  entityId?: string | null;
  action: AuditAction;
  /** {field: {from, to}} */
  changes?: Record<string, { from: unknown; to: unknown }> | Record<string, unknown>;
  ip?: string | null;
}

/**
 * Ghi audit log. SPEC Mục 7.12 / 18.2 — bắt buộc cho:
 *  - mọi thay đổi stage/outcome/assigned_to/next_contact_date của lead
 *  - mọi thay đổi spend/messages
 *  - mọi thao tác enrollments
 *  - mọi thay đổi kpi_assignments
 *  - mọi lần export
 *
 * Nhận `db` tường minh để dùng được cả trong test (PGlite riêng).
 */
export async function writeAudit(db: AnyDb, input: AuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: input.actorId ?? null,
    entity: input.entity,
    entityId: input.entityId ?? null,
    action: input.action,
    changes: input.changes ?? null,
    ip: input.ip ?? null,
  });
}

/** So sánh 2 object, trả về map {field:{from,to}} chỉ gồm field đã đổi. */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = { from: a, to: b };
  }
  return out;
}
