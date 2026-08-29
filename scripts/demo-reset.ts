import fs from "node:fs";
import { PGLITE_DIR } from "../src/lib/db";

/** Xóa DB demo PGlite để seed lại từ đầu. */
if (fs.existsSync(PGLITE_DIR)) {
  fs.rmSync(PGLITE_DIR, { recursive: true, force: true });
  console.log(`Đã xóa ${PGLITE_DIR}. Chạy: npm run db:migrate && npm run db:seed`);
} else {
  console.log(`${PGLITE_DIR} chưa tồn tại — không cần xóa.`);
}
