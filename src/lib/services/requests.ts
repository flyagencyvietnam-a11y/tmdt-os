import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { requestRouting, requests, type Request } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { nextRequestCode } from "./codes";
import { createTask } from "./tasks";
import { ServiceError } from "./errors";

export interface CreateRequestInput {
  receivedDate: string;
  sourceChannel?: Request["sourceChannel"];
  requesterName: string;
  requesterSbuId?: string | null;
  requestType?: Request["requestType"];
  description: string;
  referenceUrl?: string | null;
  priority?: string | null;
  desiredDate?: string | null;
}

export async function createRequest(db: DB, input: CreateRequestInput, actorId: string | null): Promise<Request> {
  const code = await nextRequestCode(db);
  const [row] = await db
    .insert(requests)
    .values({
      code,
      receivedDate: input.receivedDate,
      sourceChannel: input.sourceChannel ?? "other",
      requesterName: input.requesterName,
      requesterSbuId: input.requesterSbuId ?? null,
      requestType: input.requestType ?? "other",
      description: input.description,
      referenceUrl: input.referenceUrl ?? null,
      priority: input.priority ?? null,
      desiredDate: input.desiredDate ?? null,
      createdBy: actorId,
    })
    .returning();
  await writeAudit(db, { actorId, entity: "requests", entityId: row.id, action: "CREATE" });
  return row;
}

/** SPEC Mục 7.4 — khi request chuyển `accepted`, sinh 1 task theo bảng định tuyến. */
export async function acceptRequest(
  db: DB,
  requestId: string,
  committedDate: string,
  actorId: string | null,
): Promise<Request> {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!req) throw new ServiceError("Không tìm thấy request.", "NOT_FOUND");

  const [routing] = await db
    .select()
    .from(requestRouting)
    .where(
      req.requesterSbuId
        ? and(eq(requestRouting.requestType, req.requestType), eq(requestRouting.sbuId, req.requesterSbuId))
        : eq(requestRouting.requestType, req.requestType),
    )
    .limit(1);

  const task = await createTask(
    db,
    {
      title: `Request ${req.code}: ${req.description.slice(0, 80)}`,
      description: req.description,
      type: "request",
      assigneeId: routing?.assigneeId ?? actorId,
      dueDate: committedDate,
      sourceType: "request",
      sourceId: req.id,
    },
    actorId,
  );

  const [updated] = await db
    .update(requests)
    .set({ status: "accepted", acceptedById: actorId, committedDate, taskId: task.id, updatedBy: actorId })
    .where(eq(requests.id, requestId))
    .returning();
  await writeAudit(db, { actorId, entity: "requests", entityId: requestId, action: "UPDATE", changes: { status: { from: req.status, to: "accepted" } } });
  return updated;
}

export async function updateRequestStatus(
  db: DB,
  requestId: string,
  status: Request["status"],
  actorId: string | null,
  extra: { rejectReason?: string; completedDate?: string } = {},
) {
  const [before] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!before) throw new ServiceError("Không tìm thấy request.", "NOT_FOUND");
  const [row] = await db
    .update(requests)
    .set({ status, rejectReason: extra.rejectReason ?? before.rejectReason, completedDate: extra.completedDate ?? before.completedDate, updatedBy: actorId })
    .where(eq(requests.id, requestId))
    .returning();
  await writeAudit(db, { actorId, entity: "requests", entityId: requestId, action: "UPDATE", changes: { status: { from: before.status, to: status } } });
  return row;
}
