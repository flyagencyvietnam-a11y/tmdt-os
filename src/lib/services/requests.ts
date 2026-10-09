import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { requests, tasks, type Request } from "@/lib/db/schema";
import { writeAudit } from "@/lib/audit";
import { todayVnDayStr } from "@/lib/time";
import { nextRequestCode } from "./codes";
import { createTask, updateTask } from "./tasks";
import { ServiceError } from "./errors";

/**
 * Request = sổ ghi nhận task được order (SPEC Phụ lục D mục 25) — KHÔNG có bước tiếp nhận/duyệt.
 * Nhân sự tự thêm, tự cập nhật. Thêm request là sinh ngay 1 task `request`.
 * Trạng thái dùng: in_progress (Đang làm) · done · postponed · rejected (hiển thị "Huỷ").
 */
export interface CreateRequestInput {
  receivedDate: string;
  sourceChannel?: Request["sourceChannel"];
  requesterName: string;
  requesterSbuId?: string | null;
  requestType?: Request["requestType"];
  description: string;
  referenceUrl?: string | null;
  priority?: string | null;
  /** Hạn hoàn thành (tuỳ chọn) — cũng là hạn của task sinh ra. */
  committedDate?: string | null;
  /** Người thực hiện; mặc định là người thêm. */
  executorId?: string | null;
}

const taskTitle = (code: string, description: string) => `Request ${code}: ${description.slice(0, 80)}`;

async function createRequestTask(
  db: DB,
  req: Pick<Request, "id" | "code" | "description" | "requesterSbuId" | "committedDate">,
  executorId: string | null,
  actorId: string | null,
) {
  return createTask(
    db,
    {
      title: taskTitle(req.code, req.description),
      description: req.description,
      type: "request",
      assigneeId: executorId,
      dueDate: req.committedDate,
      sourceType: "request",
      sourceId: req.id,
      sbuIds: req.requesterSbuId ? [req.requesterSbuId] : undefined,
    },
    actorId,
  );
}

export async function createRequest(db: DB, input: CreateRequestInput, actorId: string | null): Promise<Request> {
  if (!input.requesterName.trim()) throw new ServiceError("Nhập người yêu cầu.", "VALIDATION");
  if (!input.description.trim()) throw new ServiceError("Nhập nội dung request.", "VALIDATION");
  const executorId = input.executorId || actorId;
  const code = await nextRequestCode(db);
  const [row] = await db
    .insert(requests)
    .values({
      code,
      receivedDate: input.receivedDate,
      sourceChannel: input.sourceChannel ?? "other",
      requesterName: input.requesterName.trim(),
      requesterSbuId: input.requesterSbuId ?? null,
      requestType: input.requestType ?? "other",
      description: input.description.trim(),
      referenceUrl: input.referenceUrl ?? null,
      priority: input.priority ?? null,
      committedDate: input.committedDate || null,
      status: "in_progress",
      acceptedById: executorId,
      createdBy: actorId,
    })
    .returning();
  const task = await createRequestTask(db, row, executorId, actorId);
  const [withTask] = await db.update(requests).set({ taskId: task.id }).where(eq(requests.id, row.id)).returning();
  await writeAudit(db, { actorId, entity: "requests", entityId: row.id, action: "CREATE" });
  return withTask;
}

/** Đổi người thực hiện = đổi người phụ trách task; request cũ chưa có task thì sinh task ngay. */
export async function assignRequestExecutor(db: DB, requestId: string, executorId: string, actorId: string | null) {
  const [req] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!req) throw new ServiceError("Không tìm thấy request.", "NOT_FOUND");
  if (req.taskId) {
    await updateTask(db, req.taskId, { assigneeId: executorId }, actorId);
    await db.update(requests).set({ acceptedById: executorId, updatedBy: actorId }).where(eq(requests.id, requestId));
    return;
  }
  const task = await createRequestTask(db, req, executorId, actorId);
  await db.update(requests).set({ taskId: task.id, acceptedById: executorId, updatedBy: actorId }).where(eq(requests.id, requestId));
}

export interface UpdateRequestInput {
  status?: Extract<Request["status"], "in_progress" | "done" | "postponed" | "rejected">;
  committedDate?: string | null;
  description?: string;
  requestType?: Request["requestType"];
}

/** Sửa request; các trường liên quan được đẩy sang task đi kèm (qua `updateTask` để giữ đồng bộ). */
export async function updateRequest(db: DB, requestId: string, patch: UpdateRequestInput, actorId: string | null) {
  const [before] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!before) throw new ServiceError("Không tìm thấy request.", "NOT_FOUND");
  if (patch.description !== undefined && !patch.description.trim()) throw new ServiceError("Nội dung request không được để trống.", "VALIDATION");

  const set: Partial<typeof requests.$inferInsert> = { updatedBy: actorId };
  if (patch.requestType !== undefined) set.requestType = patch.requestType;
  if (patch.description !== undefined) set.description = patch.description.trim();
  if (patch.committedDate !== undefined) set.committedDate = patch.committedDate || null;
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.completedDate = patch.status === "done" ? todayVnDayStr() : null;
  }
  const [row] = await db.update(requests).set(set).where(eq(requests.id, requestId)).returning();

  if (before.taskId) {
    const taskPatch: Parameters<typeof updateTask>[2] = {};
    if (patch.committedDate !== undefined) taskPatch.dueDate = patch.committedDate || null;
    if (patch.description !== undefined) {
      taskPatch.title = taskTitle(before.code, patch.description.trim());
      taskPatch.description = patch.description.trim();
    }
    if (patch.status === "done") taskPatch.status = "done";
    else if (patch.status === "rejected") taskPatch.status = "cancelled";
    else if (patch.status === "in_progress") {
      const [t] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, before.taskId)).limit(1);
      if (t && (t.status === "done" || t.status === "cancelled")) taskPatch.status = "in_progress";
    }
    if (Object.keys(taskPatch).length) await updateTask(db, before.taskId, taskPatch, actorId);
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["status", "committedDate", "description", "requestType"] as const) {
    if (patch[k] !== undefined && patch[k] !== before[k]) changes[k] = { from: before[k], to: patch[k] };
  }
  if (Object.keys(changes).length) await writeAudit(db, { actorId, entity: "requests", entityId: requestId, action: "UPDATE", changes });
  return row;
}
