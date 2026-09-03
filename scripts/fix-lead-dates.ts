/**
 * Sửa 1 lần: dữ liệu ngày tiếp nhận sai trong file migration gốc (SPEC Phụ lục A).
 * Nguồn lỗi: sheet Excel gốc — 2 loại:
 *   1. Ô Date bị đảo tháng↔ngày (người nhập gõ M/D/Y): 2026-02-07 -> 2026-07-02.
 *   2. Ô text sai năm: "14/06/2027" -> 2026-06-14.
 * Chỉ động tới lead có received_at NGOÀI cửa sổ hợp lệ [2026-06-01 .. hôm nay].
 * Có `--commit` mới ghi; mặc định dry-run. Ghi snapshot để rollback.
 *
 *   npm run db:fix-dates            # xem trước
 *   npm run db:fix-dates -- --commit
 */
import "./_env";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const WINDOW_START = "2026-06-01";

const s = postgres(process.env.DATABASE_URL as string, { max: 1, prepare: false });

function corrected(iso: string): { iso: string; rule: string } | null {
  let [y, m, d] = iso.split("-").map(Number);
  let rule = "";
  if (y === 2027) {
    y = 2026;
    rule = "năm 2027→2026";
  }
  if (y === 2026 && (m < 6 || m > 8) && d >= 1 && d <= 12) {
    [m, d] = [d, m];
    rule += (rule ? " + " : "") + "đảo tháng↔ngày";
  }
  const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (!(y === 2026 && m >= 6 && m <= 8)) return null; // vẫn ngoài cửa sổ -> để xem tay
  return { iso: out, rule };
}

(async () => {
  const commit = process.argv.includes("--commit");
  const bad = await s.unsafe<{ id: string; code: string; full_name: string; recv: string }[]>(
    `select id, code, full_name, to_char(received_at,'YYYY-MM-DD') recv
       from leads
      where received_at < '${WINDOW_START}'
         or received_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date
      order by received_at`,
  );
  if (bad.length === 0) {
    console.log("Không có lead nào ngoài cửa sổ — không cần sửa.");
    await s.end();
    return;
  }

  const snap = await s.unsafe(
    `select l.*, (select json_agg(e.*) from enrollments e where e.lead_id = l.id) enrollments
       from leads l where l.id in (${bad.map((_, i) => `$${i + 1}`).join(",")})`,
    bad.map((r) => r.id),
  );
  mkdirSync("data/seed", { recursive: true });
  const backup = `data/seed/leads-date-backup-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(snap, null, 2));
  console.log(`Snapshot ${bad.length} lead -> ${backup}\n`);

  let done = 0;
  const skipped: string[] = [];
  for (const r of bad) {
    const fix = corrected(r.recv);
    if (!fix) {
      skipped.push(`${r.code} ${r.full_name} (${r.recv})`);
      continue;
    }
    const [yy, mm] = fix.iso.split("-");
    const newCode = r.code.replace(/^L-\d{4}-/, `L-${yy.slice(2)}${mm}-`);
    console.log(
      `${commit ? "SỬA " : "DRY "} ${r.code}  ${r.recv} → ${fix.iso}  [${fix.rule}]  ${r.code}→${newCode}`,
    );
    if (commit) {
      const ts = `${fix.iso} 03:00:00+00`;
      await s.unsafe(
        `update leads set
           received_at = $1,
           mql_at = case when mql_at is not null then $1::timestamptz else null end,
           sql_at = case when sql_at is not null then $1::timestamptz else null end,
           won_at = case when won_at is not null then $1::timestamptz else null end,
           code = $2, updated_at = now()
         where id = $3`,
        [ts, newCode, r.id],
      );
      await s.unsafe(
        `update enrollments set contract_date = $1, updated_at = now() where lead_id = $2`,
        [fix.iso, r.id],
      );
      done++;
    }
  }
  console.log(
    `\n${commit ? "ĐÃ SỬA" : "DRY RUN"}: ${commit ? done : bad.length - skipped.length}/${bad.length} lead` +
      (skipped.length ? `\nBỏ qua (xem tay): ${skipped.join("; ")}` : ""),
  );
  await s.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
