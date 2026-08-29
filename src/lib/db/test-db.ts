import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * DB in-memory cho unit test (metrics.ts...). Không cần Postgres/Docker.
 * Áp toàn bộ file .sql trong ./drizzle theo thứ tự tên.
 */
export async function makeTestDb() {
  const pg = new PGlite();
  const database = drizzle(pg, { schema, casing: "snake_case" });

  const dir = path.resolve("drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    // drizzle dùng "--> statement-breakpoint" để tách câu lệnh.
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pg.exec(stmt);
    }
  }

  return { db: database, pg };
}

export type TestDb = Awaited<ReturnType<typeof makeTestDb>>["db"];
