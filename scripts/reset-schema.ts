import "./_env";
import postgres from "postgres";

/**
 * XOÁ TOÀN BỘ schema `public` (mọi bảng/enum/sequence cũ của TMĐT OS) rồi tạo lại
 * rỗng, để áp migration MKT OS mới lên cùng một Postgres (quyết định đã chốt với
 * chủ sản phẩm: dùng chung Supabase project, drop bảng cũ).
 *
 * Chạy: npx tsx scripts/reset-schema.ts --yes-drop-everything
 */
async function main() {
  if (!process.argv.includes("--yes-drop-everything")) {
    console.error(
      "Phải truyền cờ --yes-drop-everything để xác nhận XOÁ TOÀN BỘ dữ liệu hiện có trong DATABASE_URL.",
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url || url === "pglite") {
    console.error("DATABASE_URL chưa trỏ tới Postgres thật — dừng lại.");
    process.exit(1);
  }
  console.log(`Kết nối: ${url.replace(/:[^:@]+@/, ":***@")}`);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    console.log("DROP SCHEMA public CASCADE; CREATE SCHEMA public; ...");
    await sql.unsafe("drop schema public cascade; create schema public; grant all on schema public to public;");
    console.log("Xong — schema public đã rỗng. Chạy tiếp: npm run db:migrate && npm run db:seed");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
