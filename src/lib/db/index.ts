import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import {
  drizzle as drizzlePg,
  type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Client Drizzle (runtime). Hai chế độ:
 *
 *  - PRODUCTION / STAGING: `DATABASE_URL` là chuỗi Postgres  -> postgres-js.
 *  - DEMO / DEV nhanh: `DATABASE_URL` rỗng hoặc = "pglite"   -> PGlite lưu tại ./.pglite
 *    (Postgres nhúng, không cần cài gì). KHÔNG dùng cho production.
 *
 * Khởi tạo LAZY qua Proxy để `next build` không cần DB ở bước collect page data.
 */
export const DEMO_MODE =
  !process.env.DATABASE_URL || process.env.DATABASE_URL === "pglite";

export const PGLITE_DIR = process.env.PGLITE_DIR ?? path.resolve(".pglite");

type AnyPgDb = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as {
  __vmgDb?: AnyPgDb;
  __vmgSql?: ReturnType<typeof postgres>;
  __vmgPglite?: PGlite;
};

function createDb(): AnyPgDb {
  if (DEMO_MODE) {
    if (!g.__vmgPglite) {
      g.__vmgPglite = new PGlite(PGLITE_DIR);
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[db] DEMO MODE — PGlite tại ${PGLITE_DIR}. Không dùng cho production.`,
        );
      }
    }
    // Cấu trúc query builder giống hệt postgres-js; ép kiểu cho gọn.
    return drizzlePglite(g.__vmgPglite, {
      schema,
      casing: "snake_case",
    }) as unknown as AnyPgDb;
  }

  g.__vmgSql ??= postgres(process.env.DATABASE_URL as string, {
    max: 10,
    prepare: false, // Supabase pooler
  });
  return drizzlePg(g.__vmgSql, { schema, casing: "snake_case" });
}

export const db = new Proxy({} as AnyPgDb, {
  get(_t, prop) {
    const real = (g.__vmgDb ??= createDb());
    const v = Reflect.get(real as object, prop);
    return typeof v === "function" ? v.bind(real) : v;
  },
});

/**
 * Áp toàn bộ migration trong ./drizzle. Dùng cho scripts/db-migrate.ts.
 * PGlite: chạy từng câu lệnh; Postgres: dùng migrator chính thức.
 */
export async function runMigrations(): Promise<void> {
  const dir = path.resolve("drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (DEMO_MODE) {
    const pg = (g.__vmgPglite ??= new PGlite(PGLITE_DIR));
    for (const f of files) {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      for (const stmt of raw
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)) {
        try {
          await pg.exec(stmt);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // idempotent: bỏ qua "already exists" khi chạy lại
          if (!/already exists/i.test(msg)) throw e;
        }
      }
    }
    return;
  }

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  await migrate(db as AnyPgDb, { migrationsFolder: dir });
}

export async function disposeDb(): Promise<void> {
  if (g.__vmgSql) await g.__vmgSql.end();
  if (g.__vmgPglite) await g.__vmgPglite.close();
  g.__vmgSql = undefined;
  g.__vmgPglite = undefined;
  g.__vmgDb = undefined;
}

// giữ `sql` được export để scripts tiện dùng chung một nơi
export { schema, sql };
export type DB = AnyPgDb;
