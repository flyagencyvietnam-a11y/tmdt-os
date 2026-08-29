/**
 * Di chuyển dữ liệu từ VMG_Ads_Lead_Tracker.xlsx — SPEC Mục 19 + Phụ lục A.
 *
 * Chế độ mặc định = DRY RUN: chỉ đọc, chuẩn hóa, và in báo cáo đối chiếu (SPEC 19.3).
 * Không ghi vào DB nếu không có cờ --commit.
 *
 * Quy trình:
 *   1. npm run xlsx:migrate                -> dry run + sinh data/seed/campaign-map.template.json
 *   2. Điền tay data/seed/campaign-map.json  (SPEC 19.2 bước 1, ~2-3 giờ)
 *   3. npm run xlsx:migrate -- --commit    -> ghi vào DB (cần DATABASE_URL đã migrate)
 *
 * CÁC ĐIỂM CẦN QUYẾT ĐỊNH TRƯỚC KHI --commit (SPEC Phụ lục A):
 *   - "Khong chot" -> max_stage = MQL (giả định) hay CONSULTING? Xem MAX_STAGE_KHONG_CHOT.
 *   - Dòng ngày serial không hợp lệ (Lead Sheet ~206-213) -> xuất riêng, xử lý tay.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const XLSX = path.resolve("data/seed/VMG_Ads_Lead_Tracker.xlsx");
const CAMPAIGN_MAP = path.resolve("data/seed/campaign-map.json");
const CAMPAIGN_MAP_TEMPLATE = path.resolve("data/seed/campaign-map.template.json");
const COMMIT = process.argv.includes("--commit");

/** SPEC Phụ lục A.1 — ánh xạ trạng thái sheet -> (stage, outcome, max_stage). */
const STATUS_MAP: Record<
  string,
  { stage: string; outcome: string; maxStage: string }
> = {
  New: { stage: "NEW", outcome: "OPEN", maxStage: "NEW" },
  "KLH duoc": { stage: "NO_CONTACT", outcome: "OPEN", maxStage: "NO_CONTACT" },
  "Da tu van": { stage: "CONSULTING", outcome: "OPEN", maxStage: "CONSULTING" },
  MQL: { stage: "MQL", outcome: "OPEN", maxStage: "MQL" },
  SQL: { stage: "SQL", outcome: "OPEN", maxStage: "SQL" },
  "Chot HV": { stage: "WON", outcome: "WON", maxStage: "WON" },
  // Giả định cần xác nhận (SPEC Phụ lục A.1): đã tư vấn đủ mới "không chốt".
  "Khong chot": { stage: "CONSULTING", outcome: "LOST", maxStage: "MQL" },
  "Khong nhu cau": { stage: "NEW", outcome: "DISQUALIFIED", maxStage: "NEW" },
};

/** SPEC Mục 4.5 — chuẩn hóa mã sản phẩm. */
const PRODUCT_CODES = new Set([
  "TESOL",
  "VSTEP",
  "TQ",
  "FT15",
  "FLEXTRACK",
  "IE",
  "GT",
  "EDU",
  "KHAC",
]);

/** SPEC Mục 4.6. */
function normSource(raw: string): string {
  const s = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (s.includes("gioi thieu") || s.includes("referral")) return "REFERRAL";
  if (s.includes("organic") || s.includes("tu nhien")) return "ORGANIC";
  if (s.includes("hotline")) return "HOTLINE";
  if (s.includes("zalo")) return "ZALO";
  if (s.includes("tiktok")) return "TIKTOK";
  if (s.includes("google")) return "GOOGLE";
  if (s.includes("fb") || s.includes("facebook")) return "FB";
  return "KHAC";
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return String(o.text);
    if ("richText" in o)
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("hyperlink" in o) return String(o.text ?? o.hyperlink);
  }
  return String(v);
}

/** Chuẩn hóa ngày: nhận Date, "dd/mm/yyyy", " dd/mm/yyyy", "yyyy-mm-dd". SPEC 19.2 bước 3. */
function normDate(v: unknown): { iso: string | null; suspect: boolean } {
  if (v == null || v === "") return { iso: null, suspect: false };
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    return { iso: v.toISOString().slice(0, 10), suspect: y < 2023 || y > 2027 };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, suspect: false };
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return { iso: `${y}-${mo}-${d}`, suspect: Number(y) < 2023 || Number(y) > 2027 };
  }
  return { iso: null, suspect: true };
}

function normPhone(v: unknown): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("84")) return "0" + digits.slice(2);
  if (digits.startsWith("0")) return digits;
  return digits.length >= 9 ? "0" + digits : digits;
}

function normName(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(phu huynh|ph|chi|anh|co|ban)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  if (!fs.existsSync(XLSX)) {
    console.error(`Không thấy ${XLSX}. Đặt file xlsx vào data/seed/.`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);

  // ---- Lead Sheet ----
  const ls = wb.getWorksheet("Lead Sheet");
  if (!ls) throw new Error("Không thấy sheet 'Lead Sheet'");

  // Header ở R3, data từ R4 (xác nhận bằng inspect-xlsx).
  const HEADER_ROW = 3;
  const headers: Record<number, string> = {};
  ls.getRow(HEADER_ROW).eachCell((c, col) => {
    headers[col] = cellText(c.value).replace(/\s+/g, " ");
  });
  const colOf = (needle: string) =>
    Number(
      Object.entries(headers).find(([, h]) =>
        h.toLowerCase().includes(needle.toLowerCase()),
      )?.[0],
    );

  const C = {
    ngayTiepNhan: colOf("Ngay tiep nhan"),
    hoTen: colOf("Ho ten"),
    sdt: colOf("So dien thoai"),
    email: colOf("Email"),
    spRaw: colOf("SP quan tam"),
    spChuan: colOf("SP"),
    ghiChuMkt: colOf("Ghi chu MKT"),
    nguon: colOf("Nguon"),
    campaign: colOf("Campaign ID"),
    trangThai: colOf("Trang Thai"),
    tvv: colOf("Tu van vien"),
    ghiChuTv: colOf("Ghi chu Tu Van"),
    ngayLhLai: colOf("Ngay LH lai"),
    lyDoTuChoi: colOf("Ly do tu choi"),
    doanhThu: colOf("Doanh thu"),
  };

  const campaignValues = new Set<string>();
  const statusCount: Record<string, number> = {};
  const suspectDateRows: number[] = [];
  let leadCount = 0;
  let revenueRows = 0;
  let revenueTotal = 0;
  const productUnknown = new Set<string>();

  for (let r = HEADER_ROW + 1; r <= ls.rowCount; r++) {
    const row = ls.getRow(r);
    const name = cellText(row.getCell(C.hoTen).value);
    if (!name) continue;
    leadCount++;

    const camp = cellText(row.getCell(C.campaign).value).replace(/\s+/g, " ").trim();
    if (camp) campaignValues.add(camp);

    const status = cellText(row.getCell(C.trangThai).value).trim();
    statusCount[status] = (statusCount[status] ?? 0) + 1;
    if (status && !STATUS_MAP[status]) {
      // trạng thái lạ
    }

    const sp = cellText(row.getCell(C.spChuan).value).trim().toUpperCase();
    if (sp && !PRODUCT_CODES.has(sp)) productUnknown.add(sp);

    const d1 = normDate(row.getCell(C.ngayTiepNhan).value);
    const d2 = normDate(row.getCell(C.ngayLhLai).value);
    if (d1.suspect || d2.suspect) suspectDateRows.push(r);

    const dt = Number(String(row.getCell(C.doanhThu).value ?? "").replace(/\D/g, ""));
    if (dt > 0) {
      revenueRows++;
      revenueTotal += dt;
    }

    void normPhone;
    void normName;
    void normSource;
  }

  // ---- Campaign Monitor: tổng spend / messages để đối chiếu ----
  const cm = wb.getWorksheet("Campaign Monitor");
  let spendTotal = 0;
  let messagesTotal = 0;
  const cmCampaignNames = new Set<string>();
  if (cm) {
    for (let r = 4; r <= cm.rowCount; r++) {
      const row = cm.getRow(r);
      const nameCell = cellText(row.getCell(1).value).trim();
      if (!nameCell || nameCell.toUpperCase() === "TOTAL") continue;
      cmCampaignNames.add(nameCell);
      const spend = Number(String(row.getCell(5).value ?? "").replace(/[^\d.-]/g, ""));
      const mess = Number(String(row.getCell(6).value ?? "").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(spend)) spendTotal += spend;
      if (Number.isFinite(mess)) messagesTotal += mess;
    }
  }

  // ---- campaign map template ----
  if (!fs.existsSync(CAMPAIGN_MAP)) {
    const template = [...campaignValues, ...cmCampaignNames].sort().reduce(
      (acc, v) => {
        acc[v] = { internal_code: "", display_name: v, note: "" };
        return acc;
      },
      {} as Record<string, unknown>,
    );
    fs.writeFileSync(CAMPAIGN_MAP_TEMPLATE, JSON.stringify(template, null, 2), "utf8");
  }

  // ---- BÁO CÁO ĐỐI CHIẾU (SPEC 19.3) ----
  console.log("\n================ BÁO CÁO ĐỐI CHIẾU (DRY RUN) ================\n");
  console.log(`Tổng số dòng lead (có họ tên)      : ${leadCount}`);
  console.log(`Số lead theo trạng thái            :`);
  for (const [k, v] of Object.entries(statusCount).sort((a, b) => b[1] - a[1]))
    console.log(`   - ${k || "(trống)"}: ${v}`);
  console.log(`Dòng có doanh thu                  : ${revenueRows}`);
  console.log(`Tổng doanh thu (Lead Sheet)        : ${revenueTotal.toLocaleString("vi-VN")}`);
  console.log(`Tổng spend (Campaign Monitor)      : ${spendTotal.toLocaleString("vi-VN")}`);
  console.log(`Tổng messages (Campaign Monitor)   : ${messagesTotal.toLocaleString("vi-VN")}`);
  console.log(`Giá trị campaign phân biệt (LS)    : ${campaignValues.size}`);
  console.log(`Tên campaign phân biệt (CM)        : ${cmCampaignNames.size}`);
  console.log(`Sản phẩm chưa map                  : ${[...productUnknown].join(", ") || "(không)"}`);
  console.log(`Dòng ngày nghi ngờ (xử lý tay)     : ${suspectDateRows.length} -> ${suspectDateRows.slice(0, 20).join(", ")}${suspectDateRows.length > 20 ? " ..." : ""}`);
  console.log("");

  if (!fs.existsSync(CAMPAIGN_MAP)) {
    console.log(
      `>> Chưa có ${path.relative(process.cwd(), CAMPAIGN_MAP)}.\n` +
        `>> Đã sinh template: ${path.relative(process.cwd(), CAMPAIGN_MAP_TEMPLATE)}\n` +
        `>> Điền internal_code cho từng campaign rồi đổi tên file thành campaign-map.json.`,
    );
  }

  if (COMMIT) {
    console.log(
      "\n[--commit] Phần ghi vào DB CHƯA được cài đặt trong Phase 0.\n" +
        "Cần: (1) campaign-map.json đầy đủ, (2) chốt giả định 'Khong chot' (SPEC Phụ lục A.1),\n" +
        "(3) map alias_names tư vấn viên, (4) tách enrollments. Xem SPEC Mục 19.2.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
