import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  // drizzle-kit generate không cần DB thật; migrate/push/studio thì cần.
  console.warn("[drizzle.config] DATABASE_URL chưa được đặt - chỉ 'generate' hoạt động.");
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url ?? "postgresql://invalid" },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
