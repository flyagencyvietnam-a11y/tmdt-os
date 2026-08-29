import "dotenv/config";
import { DEMO_MODE, PGLITE_DIR, disposeDb, runMigrations } from "../src/lib/db";

async function main() {
  console.log(
    DEMO_MODE
      ? `Áp migration vào PGlite (DEMO) tại ${PGLITE_DIR} ...`
      : "Áp migration vào Postgres (DATABASE_URL) ...",
  );
  await runMigrations();
  await disposeDb();
  console.log("Xong.");
}

main().catch(async (e) => {
  console.error(e);
  await disposeDb().catch(() => {});
  process.exit(1);
});
