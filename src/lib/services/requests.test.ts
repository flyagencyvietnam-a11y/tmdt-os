import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/db/test-db";
import { requests, tasks, users } from "@/lib/db/schema";
import type { DB } from "@/lib/db";
import { assignRequestExecutor, createRequest, updateRequest } from "./requests";
import { updateTask } from "./tasks";

describe("request = sổ ghi nhận task được order (không duyệt)", () => {
  let db: TestDb;
  let me: string;
  let other: string;

  beforeAll(async () => {
    ({ db } = await makeTestDb());
    const [a, b] = await db
      .insert(users)
      .values([
        { email: "a@test.local", passwordHash: "x", fullName: "A", role: "member" },
        { email: "b@test.local", passwordHash: "x", fullName: "B", role: "member" },
      ])
      .returning();
    me = a.id;
    other = b.id;
  }, 60_000);

  const d = () => db as unknown as DB;
  const input = { receivedDate: "2026-10-08", requesterName: "GĐ trung tâm", description: "Thiết kế banner khai giảng" };

  it("tạo request sinh ngay task, người thực hiện mặc định là người thêm, trạng thái Đang làm", async () => {
    const req = await createRequest(d(), { ...input, committedDate: "2026-10-15" }, me);
    expect(req.status).toBe("in_progress");
    expect(req.taskId).toBeTruthy();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, req.taskId!));
    expect(t.assigneeId).toBe(me);
    expect(t.dueDate).toBe("2026-10-15");
    expect(t.sourceType).toBe("request");
    expect(t.sourceId).toBe(req.id);
  });

  it("đổi người thực hiện / hạn / trạng thái đều đồng bộ sang task", async () => {
    const req = await createRequest(d(), input, me);
    await assignRequestExecutor(d(), req.id, other, me);
    await updateRequest(d(), req.id, { committedDate: "2026-10-20" }, me);
    let [t] = await db.select().from(tasks).where(eq(tasks.id, req.taskId!));
    expect(t.assigneeId).toBe(other);
    expect(t.dueDate).toBe("2026-10-20");

    await updateRequest(d(), req.id, { status: "done" }, me);
    [t] = await db.select().from(tasks).where(eq(tasks.id, req.taskId!));
    expect(t.status).toBe("done");
    const [r1] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(r1.status).toBe("done");
    expect(r1.completedDate).toBeTruthy();

    await updateRequest(d(), req.id, { status: "in_progress" }, me);
    [t] = await db.select().from(tasks).where(eq(tasks.id, req.taskId!));
    expect(t.status).toBe("in_progress");
  });

  it("task xong/huỷ/mở lại kéo request theo; hoãn được giữ khi task còn mở", async () => {
    const req = await createRequest(d(), input, me);
    await updateTask(d(), req.taskId!, { status: "done" }, me);
    let [r] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(r.status).toBe("done");

    await updateTask(d(), req.taskId!, { status: "in_progress" }, me);
    [r] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(r.status).toBe("in_progress");
    expect(r.completedDate).toBeNull();

    await updateTask(d(), req.taskId!, { status: "cancelled" }, me);
    [r] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(r.status).toBe("rejected");

    const p = await createRequest(d(), input, me);
    await updateRequest(d(), p.id, { status: "postponed" }, me);
    await updateTask(d(), p.taskId!, { status: "in_progress" }, me);
    [r] = await db.select().from(requests).where(eq(requests.id, p.id));
    expect(r.status).toBe("postponed");
  });

  it("request cũ chưa có task: gán người thực hiện thì sinh task", async () => {
    const [old] = await db
      .insert(requests)
      .values({ code: "REQ-OLD", receivedDate: "2026-09-01", requesterName: "X", description: "Việc cũ", status: "new" })
      .returning();
    await assignRequestExecutor(d(), old.id, other, me);
    const [after] = await db.select().from(requests).where(eq(requests.id, old.id));
    expect(after.taskId).toBeTruthy();
    const [t] = await db.select().from(tasks).where(eq(tasks.id, after.taskId!));
    expect(t.assigneeId).toBe(other);
  });
});
