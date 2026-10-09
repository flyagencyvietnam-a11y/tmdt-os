import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/db/test-db";
import { brands, contentItems, tasks, users } from "@/lib/db/schema";
import type { DB } from "@/lib/db";
import { createContentItem, listContentItemsScoped, normalizeTags, updateContentItem } from "./content";
import { updateTask } from "./tasks";

describe("normalizeTags", () => {
  it("gộp trường đơn + mảng, bỏ trùng, giữ thứ tự", () => {
    expect(normalizeTags("A", ["B", "A", " C "])).toEqual(["A", "B", "C"]);
    expect(normalizeTags(undefined, undefined)).toBeNull();
    expect(normalizeTags(undefined, [])).toEqual([]);
  });
});

describe("content item nhiều brand / nhiều kênh", () => {
  let db: TestDb;
  let vmg: string;
  let vmp: string;
  let owner: string;

  beforeAll(async () => {
    ({ db } = await makeTestDb());
    const [a, b] = await db
      .insert(brands)
      .values([
        { code: "VMG", name: "VMG" },
        { code: "VMP", name: "VMP" },
      ])
      .returning();
    vmg = a.id;
    vmp = b.id;
    const [u] = await db.insert(users).values({ email: "o@test.local", passwordHash: "x", fullName: "Owner", role: "member" }).returning();
    owner = u.id;
  }, 60_000);

  it("tạo: brand/kênh chính = phần tử đầu, task cha liệt kê mọi kênh", async () => {
    const item = await createContentItem(
      db as unknown as DB,
      { brandIds: [vmp, vmg], channels: ["TikTok", "Fanpage"], publishDate: "2026-10-20", topic: "Khai giảng", ownerId: owner, generateSubtasks: false },
      null,
    );
    expect(item.brandId).toBe(vmp);
    expect(item.brandIds).toEqual([vmp, vmg]);
    expect(item.channel).toBe("TikTok");
    expect(item.channels).toEqual(["TikTok", "Fanpage"]);
    const [parent] = await db.select().from(tasks).where(eq(tasks.id, item.parentTaskId!));
    expect(parent.title).toBe("Đăng: Khai giảng — TikTok, Fanpage");
  });

  it("tương thích kiểu cũ (brandId + channel đơn) — vd. import T6 file cũ", async () => {
    const item = await createContentItem(db as unknown as DB, { brandId: vmg, channel: "Zalo", publishDate: "2026-10-21", topic: "Cũ", generateSubtasks: false }, null);
    expect(item.brandIds).toEqual([vmg]);
    expect(item.channels).toEqual(["Zalo"]);
  });

  it("sửa: đổi tag cập nhật brand/kênh chính + tiêu đề task cha", async () => {
    const item = await createContentItem(db as unknown as DB, { brandIds: [vmg], channels: ["Fanpage"], publishDate: "2026-10-22", topic: "Sửa", generateSubtasks: false }, null);
    const after = await updateContentItem(db as unknown as DB, item.id, { brandIds: [vmp, vmg], channels: ["YouTube", "Fanpage"] }, null);
    expect(after.brandId).toBe(vmp);
    expect(after.channel).toBe("YouTube");
    const [parent] = await db.select().from(tasks).where(eq(tasks.id, item.parentTaskId!));
    expect(parent.title).toBe("Đăng: Sửa — YouTube, Fanpage");
    expect(parent.brandId).toBe(vmp);
  });

  it("không cho bỏ hết brand/kênh", async () => {
    await expect(createContentItem(db as unknown as DB, { brandIds: [], channels: ["Zalo"], publishDate: "2026-10-23", topic: "x" }, null)).rejects.toThrow(/brand/);
    const [row] = await db.select().from(contentItems).limit(1);
    await expect(updateContentItem(db as unknown as DB, row.id, { channels: [] }, null)).rejects.toThrow(/kênh/);
  });
});

describe("đồng bộ 2 chiều content ⇄ task đăng bài", () => {
  let db: TestDb;
  let d: DB;
  let brand: string;
  let owner: string;

  beforeAll(async () => {
    ({ db } = await makeTestDb());
    d = db as unknown as DB;
    const [b] = await db.insert(brands).values({ code: "VMG", name: "VMG" }).returning();
    brand = b.id;
    const [u] = await db.insert(users).values({ email: "s@test.local", passwordHash: "x", fullName: "S", role: "member" }).returning();
    owner = u.id;
  }, 60_000);

  const statusOf = async (id: string) => (await db.select().from(contentItems).where(eq(contentItems.id, id)))[0].status;
  const taskStatus = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0].status;

  it("task cha xong → content thành Đã đăng; mở lại task → content về Đã duyệt", async () => {
    const item = await createContentItem(d, { brandIds: [brand], channels: ["Fanpage"], publishDate: "2026-10-20", topic: "A", ownerId: owner, generateSubtasks: false }, null);
    await updateTask(d, item.parentTaskId!, { status: "done" }, null);
    expect(await statusOf(item.id)).toBe("published");
    await updateTask(d, item.parentTaskId!, { status: "in_progress" }, null);
    expect(await statusOf(item.id)).toBe("approved");
  });

  it("tick Đã đăng ở content → task cha xong; bỏ tick → task mở lại", async () => {
    const item = await createContentItem(d, { brandIds: [brand], channels: ["Fanpage"], publishDate: "2026-10-21", topic: "B", ownerId: owner, generateSubtasks: false }, null);
    await updateContentItem(d, item.id, { status: "published" }, null);
    expect(await taskStatus(item.parentTaskId!)).toBe("done");
    await updateContentItem(d, item.id, { status: "approved" }, null);
    expect(await taskStatus(item.parentTaskId!)).toBe("in_progress");
    expect(await statusOf(item.id)).toBe("approved");
  });

  it("có task con: xong bước \"Đăng bài\" → content Đã đăng; bước khác thì không; bỏ tick mở lại bước Đăng bài", async () => {
    const item = await createContentItem(d, { brandIds: [brand], channels: ["Fanpage"], publishDate: "2026-10-22", topic: "C", ownerId: owner }, null);
    const kids = await db.select().from(tasks).where(eq(tasks.parentId, item.parentTaskId!));
    const step = (p: string) => kids.find((k) => k.title.startsWith(p))!;
    await updateTask(d, step("Soạn nội dung").id, { status: "done" }, null);
    expect(await statusOf(item.id)).toBe("brief");
    await updateTask(d, step("Đăng bài").id, { status: "done" }, null);
    expect(await statusOf(item.id)).toBe("published");
    await updateContentItem(d, item.id, { status: "approved" }, null);
    expect(await taskStatus(step("Đăng bài").id)).toBe("todo");
    expect(await taskStatus(item.parentTaskId!)).not.toBe("done");
    expect(await statusOf(item.id)).toBe("approved");
  });

  it("content đã huỷ không bị task kéo sang Đã đăng", async () => {
    const item = await createContentItem(d, { brandIds: [brand], channels: ["Fanpage"], publishDate: "2026-10-23", topic: "D", ownerId: owner, generateSubtasks: false }, null);
    await updateContentItem(d, item.id, { status: "cancelled" }, null);
    await updateTask(d, item.parentTaskId!, { status: "done" }, null);
    expect(await statusOf(item.id)).toBe("cancelled");
  });
});

describe("danh sách content mặc định: trễ & sắp tới", () => {
  it("giữ bài chưa đăng trễ lịch + trong 30 ngày tới + đã đăng gần đây; ẩn bài xa và bài đã đăng cũ", async () => {
    const { db } = await makeTestDb();
    const [b] = await db.insert(brands).values({ code: "B", name: "B" }).returning();
    const mk = (topic: string, publishDate: string, status: "brief" | "published" | "cancelled") =>
      db.insert(contentItems).values({ brandId: b.id, brandIds: [b.id], publishDate, channel: "Fanpage", channels: ["Fanpage"], topic, status });
    // today = 2026-10-20 → đầu tháng 2026-10-01 (sớm hơn 7 ngày trước), 30 ngày tới = 2026-11-19
    await mk("trễ lịch cũ", "2026-08-01", "brief");
    await mk("sắp tới", "2026-11-10", "brief");
    await mk("kế hoạch xa", "2026-12-15", "brief");
    await mk("đã đăng tháng này", "2026-10-05", "published");
    await mk("đã đăng tháng trước", "2026-09-10", "published");
    await mk("huỷ", "2026-10-10", "cancelled");
    const topics = async (scope: "recent" | "all") =>
      (await listContentItemsScoped(db as unknown as DB, { scope, today: "2026-10-20", limit: 100 })).rows.map((r) => r.topic).sort();
    expect(await topics("recent")).toEqual(["sắp tới", "trễ lịch cũ", "đã đăng tháng này"].sort());
    expect((await topics("all")).length).toBe(6);
  }, 60_000);
});
