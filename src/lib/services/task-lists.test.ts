import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/db/test-db";
import { tasks, users } from "@/lib/db/schema";
import type { DB } from "@/lib/db";
import { archiveOldTasks, clampLimit, defaultTaskView, listTasksScoped, taskViewCounts, type TaskScope } from "./task-lists";
import { createTask, updateTask } from "./tasks";

const NOW = new Date("2026-10-04T05:00:00Z");
const TODAY = "2026-10-04";
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("danh sách task có phạm vi", () => {
  let db: TestDb;
  let d: DB;
  let me: string;
  let other: string;
  let scope: TaskScope;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ({ db } = await makeTestDb());
    d = db as unknown as DB;
    const [a, b] = await db
      .insert(users)
      .values([
        { email: "me@t.local", passwordHash: "x", fullName: "Me", role: "member" },
        { email: "ot@t.local", passwordHash: "x", fullName: "Other", role: "member" },
      ])
      .returning();
    me = a.id;
    other = b.id;
    scope = { userId: me, sbuId: null, today: TODAY, now: NOW };

    const mk = async (key: string, input: Parameters<typeof createTask>[1], patch?: Partial<typeof tasks.$inferInsert>) => {
      const t = await createTask(d, input, null);
      ids[key] = t.id;
      if (patch) await db.update(tasks).set(patch).where(eq(tasks.id, t.id));
    };
    await mk("openMine", { title: "mở của tôi", assigneeId: me, dueDate: "2026-10-06" });
    await mk("openOther", { title: "mở của người khác", assigneeId: other, dueDate: "2026-10-30" });
    await mk("overdue", { title: "quá hạn", assigneeId: me, dueDate: "2026-09-20" });
    await mk("nodue", { title: "không hạn", assigneeId: other });
    await mk("doneRecent", { title: "xong 5 ngày trước", assigneeId: me, dueDate: "2026-09-29" }, { status: "done", completedAt: daysAgo(5) });
    await mk("doneOld", { title: "xong 45 ngày trước", assigneeId: me, dueDate: "2026-08-01" }, { status: "done", completedAt: daysAgo(45) });
    await mk("doneAncient", { title: "xong 120 ngày trước", assigneeId: me, dueDate: "2026-06-01" }, { status: "done", completedAt: daysAgo(120) });
    await mk("cancelledAncient", { title: "huỷ 200 ngày trước", assigneeId: other }, { status: "cancelled", updatedAt: daysAgo(200) });
  }, 60_000);

  const titles = async (view: Parameters<typeof listTasksScoped>[2]["view"], assigneeId?: string) =>
    (await listTasksScoped(d, scope, { view, assigneeId, limit: 100 })).rows.map((r) => r.title).sort();

  it("'Ưu tiên' (mặc định quản lý) = quá hạn + hạn trong 14 ngày + đang làm dở + vừa xong; ẩn việc xa/chưa hạn và xong cũ", async () => {
    expect(await titles("focus")).toEqual(["mở của tôi", "quá hạn", "xong 5 ngày trước"].sort());
  });

  it("việc đang làm dở luôn nằm trong 'Ưu tiên' dù hạn còn xa hoặc chưa có hạn", async () => {
    const far = await createTask(d, { title: "đang làm, hạn xa" }, null);
    await db.update(tasks).set({ status: "in_progress", dueDate: "2026-12-30" }).where(eq(tasks.id, far.id));
    expect(await titles("focus")).toContain("đang làm, hạn xa");
    await db.delete(tasks).where(eq(tasks.id, far.id));
  });

  it("mặc định 'Đang làm việc' = việc mở + việc vừa xong trong 7 ngày; ẩn xong cũ", async () => {
    const t = await titles("active");
    expect(t).toContain("xong 5 ngày trước");
    expect(t).toContain("mở của tôi");
    expect(t).not.toContain("xong 45 ngày trước");
    expect(t).not.toContain("xong 120 ngày trước");
  });

  it("'Của tôi' / 'Quá hạn' / 'Tuần này' lọc đúng", async () => {
    expect(await titles("mine")).toEqual(["mở của tôi", "quá hạn", "xong 5 ngày trước"].sort());
    expect(await titles("overdue")).toEqual(["quá hạn"]);
    expect(await titles("week")).toEqual(["mở của tôi"]);
  });

  it("lọc thêm theo người phụ trách", async () => {
    expect(await titles("active", other)).toEqual(["không hạn", "mở của người khác"].sort());
  });

  it("job lưu trữ chỉ gom task xong/huỷ quá 90 ngày, idempotent; xem ở view Lưu trữ", async () => {
    expect(await archiveOldTasks(d, 90, NOW)).toBe(2);
    expect(await archiveOldTasks(d, 90, NOW)).toBe(0);
    expect(await titles("archived")).toEqual(["huỷ 200 ngày trước", "xong 120 ngày trước"].sort());
    expect(await titles("all")).not.toContain("xong 120 ngày trước");
    expect(await titles("done")).toEqual(["xong 45 ngày trước", "xong 5 ngày trước"].sort());
  });

  it("mở lại task đã lưu trữ → quay lại danh sách làm việc", async () => {
    await updateTask(d, ids.doneAncient, { status: "in_progress" }, null);
    expect(await titles("active")).toContain("xong 120 ngày trước");
    expect(await titles("archived")).not.toContain("xong 120 ngày trước");
  });

  it("số trên chip khớp danh sách, phân trang cắt đúng và vẫn báo tổng", async () => {
    const counts = await taskViewCounts(d, scope);
    expect(counts.archived).toBe(1);
    expect(counts.overdue).toBe(2); // "quá hạn" + task cũ vừa được mở lại (hạn 01/06)
    expect(counts.active).toBe((await listTasksScoped(d, scope, { view: "active", limit: 100 })).total);
    const page = await listTasksScoped(d, scope, { view: "all", limit: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
  });

  it("center_contributor chỉ thấy task gắn SBU của mình; không có SBU thì không thấy gì", async () => {
    const none = await listTasksScoped(d, { ...scope, sbuId: "none" }, { view: "all", limit: 100 });
    expect(none.total).toBe(0);
  });

  it("view mặc định theo vai trò + giới hạn trang", () => {
    expect(defaultTaskView("member")).toBe("mine");
    expect(defaultTaskView("manager")).toBe("focus");
    expect(clampLimit("abc")).toBe(300);
    expect(clampLimit(999999)).toBe(3000);
    expect(clampLimit(600)).toBe(600);
  });
});
