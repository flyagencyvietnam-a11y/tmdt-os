import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/db/test-db";
import { brands, contentItems, tasks, users } from "@/lib/db/schema";
import type { DB } from "@/lib/db";
import { createContentItem, normalizeTags, updateContentItem } from "./content";

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
