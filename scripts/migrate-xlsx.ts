/**
 * Di chuyển dữ liệu từ VMG_Ads_Lead_Tracker.xlsx — SPEC Mục 19 + Phụ lục A.
 *
 *   npm run xlsx:migrate                -> DRY RUN: đọc, chuẩn hóa, in + ghi báo cáo
 *                                         đối chiếu (data/seed/migration-report.md).
 *                                         Sinh data/seed/campaign-map.template.json.
 *   npm run xlsx:migrate -- --commit    -> GHI vào DB. Cần chạy db:migrate + db:seed
 *                                         trước (để có danh mục sản phẩm & người dùng).
 *
 * Bảng ánh xạ campaign:
 *   - Nếu có data/seed/campaign-map.json  -> dùng nó (điền tay, SPEC 19.2 bước 1).
 *   - Nếu KHÔNG có                        -> tự sinh map tạm (mỗi giá trị 1 campaign),
 *     gắn cờ cần review. Số campaign sẽ KHÔNG gộp bản trùng — phải sửa tay rồi chạy lại.
 *
 * Giả định "Không chốt" -> max_stage: xem MAX_STAGE_KHONG_CHOT (SPEC Phụ lục A.1).
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const XLSX = path.resolve("data/seed/VMG_Ads_Lead_Tracker.xlsx");
const CAMPAIGN_MAP = path.resolve("data/seed/campaign-map.json");
const CAMPAIGN_MAP_TEMPLATE = path.resolve("data/seed/campaign-map.template.json");
const REPORT = path.resolve("data/seed/migration-report.md");
const COMMIT = process.argv.includes("--commit");

/** SPEC Phụ lục A.1 — "Không chốt" đã tư vấn đủ mới không chốt (mặc định). */
const MAX_STAGE_KHONG_CHOT: "MQL" | "CONSULTING" = "MQL";

const STATUS_MAP: Record<
  string,
  { stage: string; outcome: string; maxStage: string }
> = {
  New: { stage: "NEW", outcome: "OPEN", maxStage: "NEW" },
  "KLH duoc": { stage: "NO_CONTACT", outcome: "OPEN", maxStage: "NO_CONTACT" },
  "KLH được": { stage: "NO_CONTACT", outcome: "OPEN", maxStage: "NO_CONTACT" },
  "Da tu van": { stage: "CONSULTING", outcome: "OPEN", maxStage: "CONSULTING" },
  "Đã tư vấn": { stage: "CONSULTING", outcome: "OPEN", maxStage: "CONSULTING" },
  MQL: { stage: "MQL", outcome: "OPEN", maxStage: "MQL" },
  SQL: { stage: "SQL", outcome: "OPEN", maxStage: "SQL" },
  "Chot HV": { stage: "WON", outcome: "WON", maxStage: "WON" },
  "Chốt HV": { stage: "WON", outcome: "WON", maxStage: "WON" },
  "Khong chot": { stage: "CONSULTING", outcome: "LOST", maxStage: MAX_STAGE_KHONG_CHOT },
  "Không chốt": { stage: "CONSULTING", outcome: "LOST", maxStage: MAX_STAGE_KHONG_CHOT },
  "Khong nhu cau": { stage: "NEW", outcome: "DISQUALIFIED", maxStage: "NEW" },
  "Không nhu cầu": { stage: "NEW", outcome: "DISQUALIFIED", maxStage: "NEW" },
};

const PRODUCT_CODES = new Set([
  "TESOL", "VSTEP", "TQ", "FT15", "FLEXTRACK", "IE", "GT", "EDU", "KHAC",
]);

const DIACRITICS = /[̀-ͯ]/g;
function noAccent(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").replace(/đ/g, "d");
}
function normSource(raw: string): string {
  const s = noAccent(raw);
  if (s.includes("gioi thieu") || s.includes("referral")) return "REFERRAL";
  if (s.includes("organic") || s.includes("tu nhien")) return "ORGANIC";
  if (s.includes("hotline")) return "HOTLINE";
  if (s.includes("zalo")) return "ZALO";
  if (s.includes("tiktok")) return "TIKTOK";
  if (s.includes("google")) return "GOOGLE";
  if (s.includes("fb") || s.includes("facebook")) return "FB";
  return "KHAC";
}
function normProduct(raw: string): string {
  const up = raw.trim().toUpperCase();
  if (PRODUCT_CODES.has(up)) return up;
  const s = noAccent(raw);
  if (s.includes("tesol")) return "TESOL";
  if (s.includes("vstep")) return "VSTEP";
  if (s.includes("trung") || s.includes("hsk")) return "TQ";
  if (s.includes("fast track") || s.includes("ft15") || s.includes("ft 1.5")) return "FT15";
  if (s.includes("flextrack") || s.includes("flex track")) return "FLEXTRACK";
  if (s.includes("express") || s.includes("ie ")) return "IE";
  if (s.includes("giao tiep")) return "GT";
  if (s.includes("edunext") || s.includes("edu")) return "EDU";
  return "KHAC";
}
function normPhone(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("84")) return "0" + d.slice(2);
  if (d.startsWith("0")) return d;
  return d.length >= 9 ? "0" + d : d;
}
function normName(raw: string): string {
  return noAccent(raw)
    .replace(/\b(phu huynh|ph|chi|anh|co|ban|em|chu|bac|ong|ba)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Cửa sổ hợp lệ của plan TMĐT: từ 01/06/2026 tới hôm nay (giờ VN). Xem SPEC Phụ lục A. */
const PLAN_START = "2026-06-01";
const PLAN_END = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
function saneIso(y: number, mo: string, d: string): { iso: string | null; suspect: boolean } {
  if (y < 2023 || y > 2030) return { iso: null, suspect: true };
  const iso = `${y}-${mo}-${d}`;
  // Ngoài cửa sổ plan gần như chắc chắn là lỗi format ngày/tháng hoặc gõ nhầm năm.
  if (iso < PLAN_START || iso > PLAN_END) return { iso, suspect: true };
  return { iso, suspect: false };
}
function normDate(v: unknown): { iso: string | null; suspect: boolean } {
  if (v == null || v === "") return { iso: null, suspect: false };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { iso: null, suspect: true };
    return saneIso(
      v.getUTCFullYear(),
      String(v.getUTCMonth() + 1).padStart(2, "0"),
      String(v.getUTCDate()).padStart(2, "0"),
    );
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return saneIso(Number(m[1]), m[2], m[3]);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return saneIso(y, mo, d);
  }
  return { iso: null, suspect: true };
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
function money(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

interface ParsedLead {
  rowNo: number;
  receivedAt: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  fbProfile: string | null;
  productCode: string;
  productRaw: string;
  source: string;
  campaignKey: string | null;
  status: string;
  stage: string;
  outcome: string;
  maxStage: string;
  consultantRaw: string;
  nextContactDate: string | null;
  lostReason: string | null;
  revenue: number;
  consultNote: string;
  suspectDate: boolean;
}

async function main() {
  if (!fs.existsSync(XLSX)) {
    console.error(`Không thấy ${XLSX}.`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);

  const ls = wb.getWorksheet("Lead Sheet");
  if (!ls) throw new Error("Không thấy sheet 'Lead Sheet'");

  const HEADER_ROW = 3;
  const headers: Record<number, string> = {};
  ls.getRow(HEADER_ROW).eachCell((c, col) => {
    headers[col] = cellText(c.value).replace(/\s+/g, " ");
  });
  const colOf = (needle: string) =>
    Number(
      Object.entries(headers).find(([, h]) =>
        h.toLowerCase().includes(needle.toLowerCase()),
      )?.[0] ?? 0,
    );
  const C = {
    ngay: colOf("Ngay tiep nhan"),
    hoTen: colOf("Ho ten"),
    sdt: colOf("So dien thoai"),
    email: colOf("Email"),
    spRaw: colOf("SP quan tam"),
    spChuan: colOf("SP\n(chuan)") || colOf("SP (chuan)") || colOf("SP\n(chuẩn)"),
    ghiChuMkt: colOf("Ghi chu MKT"),
    nguon: colOf("Nguon"),
    campaign: colOf("Campaign ID"),
    trangThai: colOf("Trang Thai"),
    tvv: colOf("Tu van vien"),
    ghiChuTv: colOf("Ghi chu Tu Van"),
    ngayLh: colOf("Ngay LH lai"),
    lyDo: colOf("Ly do tu choi"),
    doanhThu: colOf("Doanh thu"),
  };

  const leads: ParsedLead[] = [];
  const statusCount: Record<string, number> = {};
  const campaignKeys = new Set<string>();
  const suspectRows: number[] = [];
  let revenueRows = 0;
  let revenueTotal = 0;
  const productUnknown = new Map<string, number>();

  for (let r = HEADER_ROW + 1; r <= ls.rowCount; r++) {
    const row = ls.getRow(r);
    const name = cellText(row.getCell(C.hoTen).value);
    if (!name) continue;

    const campRaw = cellText(row.getCell(C.campaign).value).replace(/\s+/g, " ").trim();
    const campaignKey = campRaw || null;
    if (campaignKey) campaignKeys.add(campaignKey);

    const status = cellText(row.getCell(C.trangThai).value).trim();
    statusCount[status || "(trống)"] = (statusCount[status || "(trống)"] ?? 0) + 1;
    const map = STATUS_MAP[status] ?? {
      stage: "NEW",
      outcome: "OPEN",
      maxStage: "NEW",
    };

    const d1 = normDate(row.getCell(C.ngay).value);
    const d2 = normDate(row.getCell(C.ngayLh).value);
    if (d1.suspect || d2.suspect) suspectRows.push(r);

    const rev = money(row.getCell(C.doanhThu).value);
    if (rev > 0) {
      revenueRows++;
      revenueTotal += rev;
    }

    const emailOrPage = cellText(row.getCell(C.email).value);
    const productRaw = cellText(row.getCell(C.spRaw).value);
    const spChuan = cellText(row.getCell(C.spChuan).value) || productRaw;
    const pc = normProduct(spChuan);
    if (pc === "KHAC" && spChuan)
      productUnknown.set(spChuan, (productUnknown.get(spChuan) ?? 0) + 1);

    leads.push({
      rowNo: r,
      receivedAt: d1.suspect ? null : d1.iso,
      fullName: name,
      phone: normPhone(row.getCell(C.sdt).value),
      email: emailOrPage.includes("@") ? emailOrPage : null,
      fbProfile: emailOrPage && !emailOrPage.includes("@") ? emailOrPage : null,
      productCode: pc,
      productRaw,
      source: normSource(cellText(row.getCell(C.nguon).value)),
      campaignKey,
      status,
      stage: map.stage,
      outcome: map.outcome,
      maxStage: map.maxStage,
      consultantRaw: cellText(row.getCell(C.tvv).value).trim(),
      nextContactDate: d2.suspect ? null : d2.iso,
      lostReason: cellText(row.getCell(C.lyDo).value).trim() || null,
      revenue: rev,
      consultNote: [
        cellText(row.getCell(C.ghiChuMkt).value) &&
          `MKT: ${cellText(row.getCell(C.ghiChuMkt).value)}`,
        cellText(row.getCell(C.ghiChuTv).value),
      ]
        .filter(Boolean)
        .join("\n"),
      suspectDate: d1.suspect || d2.suspect,
    });
  }

  // Campaign Monitor: tổng spend / messages
  const cm = wb.getWorksheet("Campaign Monitor");
  let spendTotal = 0;
  let messagesTotal = 0;
  const cmRows: { name: string; product: string; channel: string; spend: number; messages: number }[] = [];
  if (cm) {
    for (let r = 4; r <= cm.rowCount; r++) {
      const row = cm.getRow(r);
      const nm = cellText(row.getCell(1).value).trim();
      if (!nm || nm.toUpperCase() === "TOTAL") continue;
      const sp = money(row.getCell(5).value);
      const ms = Number(String(row.getCell(6).value ?? "").replace(/[^\d.-]/g, "")) || 0;
      spendTotal += sp;
      messagesTotal += ms;
      cmRows.push({
        name: nm,
        product: normProduct(cellText(row.getCell(2).value)),
        channel: normSource(cellText(row.getCell(3).value)) === "FB" ? "FB" : "FB",
        spend: sp,
        messages: ms,
      });
    }
  }

  // ---- campaign map ----
  const allCampNames = new Set<string>([...campaignKeys, ...cmRows.map((c) => c.name)]);
  let campaignMap: Record<
    string,
    { internal_code: string; display_name: string; product_code?: string; channel?: string; note?: string }
  >;
  let mapIsAuto = false;
  if (fs.existsSync(CAMPAIGN_MAP)) {
    campaignMap = JSON.parse(fs.readFileSync(CAMPAIGN_MAP, "utf8"));
  } else {
    mapIsAuto = true;
    campaignMap = {};
    let seq = 1;
    for (const v of [...allCampNames].sort()) {
      const prodGuess =
        leads.find((l) => l.campaignKey === v)?.productCode ??
        cmRows.find((c) => c.name === v)?.product ??
        "KHAC";
      campaignMap[v] = {
        internal_code: `MIGRATED-${String(seq++).padStart(3, "0")}`,
        display_name: v.slice(0, 120),
        product_code: prodGuess,
        channel: "FB",
        note: "auto — cần review & gộp bản trùng",
      };
    }
    fs.writeFileSync(CAMPAIGN_MAP_TEMPLATE, JSON.stringify(campaignMap, null, 2), "utf8");
  }

  // ---- báo cáo đối chiếu (SPEC 19.3) ----
  const bySheetStatus = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
  const wonNoRevenue = leads.filter(
    (l) => l.outcome === "WON" && l.revenue === 0,
  ).length;

  const report = [
    `# Báo cáo đối chiếu migration — ${new Date().toISOString()}`,
    ``,
    `Chế độ: **${COMMIT ? "COMMIT (ghi DB)" : "DRY RUN"}**`,
    `Nguồn: \`data/seed/VMG_Ads_Lead_Tracker.xlsx\``,
    ``,
    `| Chỉ số | Trên sheet | Sau khi nhập | Chênh lệch | Giải thích |`,
    `|---|---:|---:|---:|---|`,
    `| Tổng số dòng lead (có họ tên) | ${leads.length} | ${COMMIT ? leads.length : "—"} | 0 | |`,
    ...bySheetStatus.map(
      ([k, v]) => `| Lead trạng thái "${k}" | ${v} | ${COMMIT ? v : "—"} | 0 | |`,
    ),
    `| Dòng có doanh thu | ${revenueRows} | ${COMMIT ? revenueRows : "—"} | 0 | tách thành \`enrollments\` |`,
    `| Tổng doanh thu | ${revenueTotal.toLocaleString("vi-VN")} | ${COMMIT ? revenueTotal.toLocaleString("vi-VN") : "—"} | 0 | |`,
    `| Tổng spend (Campaign Monitor) | ${spendTotal.toLocaleString("vi-VN")} | ${COMMIT ? spendTotal.toLocaleString("vi-VN") : "—"} | 0 | nhập dạng TỔNG/campaign tại ngày chốt số, chưa tách theo ngày |`,
    `| Tổng messages (Campaign Monitor) | ${messagesTotal.toLocaleString("vi-VN")} | ${COMMIT ? messagesTotal.toLocaleString("vi-VN") : "—"} | 0 | |`,
    `| Giá trị campaign phân biệt | ${allCampNames.size} | ${Object.keys(campaignMap).length} | ${allCampNames.size - Object.keys(campaignMap).length} | ${mapIsAuto ? "map TỰ SINH — chưa gộp bản trùng" : "theo campaign-map.json"} |`,
    ``,
    `## Cần xử lý tay trước khi \`--commit\``,
    ``,
    mapIsAuto
      ? `- ⚠️ Chưa có \`data/seed/campaign-map.json\`. Đã sinh \`campaign-map.template.json\` (${Object.keys(campaignMap).length} campaign). Gộp bản trùng ("... - Bản sao"), sửa \`product_code\`/\`channel\`, đổi tên thành \`campaign-map.json\`, chạy lại.`
      : `- ✅ Dùng \`campaign-map.json\` (${Object.keys(campaignMap).length} campaign).`,
    `- Giả định "Không chốt" → max_stage = **${MAX_STAGE_KHONG_CHOT}** (SPEC Phụ lục A.1). Nếu đổi sang CONSULTING, số MQL lịch sử giảm ~24.`,
    `- ${suspectRows.length} dòng có ngày không hợp lệ (xử lý tay): ${suspectRows.slice(0, 30).join(", ")}${suspectRows.length > 30 ? " …" : ""}`,
    `- ${wonNoRevenue} lead "Chốt HV" KHÔNG có doanh thu → nhập là WON nhưng KHÔNG tạo enrollment (DB cấm gross_amount = 0). Cần EC bổ sung doanh thu tuần đầu golive (SPEC 19.2 bước 6).`,
    `- Sản phẩm chưa nhận diện (đưa về KHAC): ${[...productUnknown.entries()].map(([k, n]) => `"${k}" ×${n}`).join(", ") || "(không)"}`,
    `- Tư vấn viên: map qua \`users.alias_names\` (đã seed các biến thể). Giá trị ghép ("Hiền/ Thy") gán cho người đứng đầu + ghi chú.`,
    ``,
    `> Mọi lead nhập từ sheet được đánh dấu \`migrated = true\`. Báo cáo giai đoạn trước golive phải ghi chú "số liệu ước tính từ dữ liệu di chuyển".`,
    ``,
  ].join("\n");
  fs.writeFileSync(REPORT, report, "utf8");

  console.log(`\n================ MIGRATION ${COMMIT ? "COMMIT" : "DRY RUN"} ================\n`);
  console.log(`Lead: ${leads.length} · Doanh thu: ${revenueRows} dòng / ${revenueTotal.toLocaleString("vi-VN")}`);
  console.log(`Spend: ${spendTotal.toLocaleString("vi-VN")} · Messages: ${messagesTotal.toLocaleString("vi-VN")}`);
  console.log(`Campaign: ${allCampNames.size} giá trị -> ${Object.keys(campaignMap).length} bản ghi ${mapIsAuto ? "(TỰ SINH)" : "(từ file)"}`);
  console.log(`Ngày nghi ngờ: ${suspectRows.length} · WON thiếu doanh thu: ${wonNoRevenue}`);
  console.log(`\n>> Báo cáo đối chiếu: ${path.relative(process.cwd(), REPORT)}`);
  if (mapIsAuto)
    console.log(`>> Template campaign map: ${path.relative(process.cwd(), CAMPAIGN_MAP_TEMPLATE)}`);

  if (!COMMIT) {
    console.log(`\n(Chạy lại với --commit để ghi vào DB.)`);
    return;
  }

  // ---------------- COMMIT ----------------
  const { db } = await import("../src/lib/db");
  const schema = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const prodRows = await db.select().from(schema.products);
  const prodByCode = new Map(prodRows.map((p) => [p.code, p.id]));
  if (prodByCode.size === 0) {
    console.error("Chưa seed danh mục sản phẩm. Chạy `npm run db:seed` trước.");
    process.exit(1);
  }
  const userRows = await db.select().from(schema.users);
  const userByAlias = new Map<string, string>();
  for (const u of userRows) {
    userByAlias.set(noAccent(u.fullName), u.id);
    for (const a of u.aliasNames ?? []) userByAlias.set(noAccent(a), u.id);
  }
  const fallbackUser = userRows.find((u) => u.role === "EC")?.id ?? userRows[0]?.id;

  // campaigns
  const campIdByKey = new Map<string, string>();
  for (const [key, cfg] of Object.entries(campaignMap)) {
    const [existing] = await db
      .select({ id: schema.campaigns.id })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.internalCode, cfg.internal_code))
      .limit(1);
    if (existing) {
      campIdByKey.set(key, existing.id);
      continue;
    }
    const [row] = await db
      .insert(schema.campaigns)
      .values({
        internalCode: cfg.internal_code,
        displayName: cfg.display_name,
        productId: prodByCode.get(cfg.product_code ?? "KHAC") ?? prodByCode.get("KHAC")!,
        channel: (cfg.channel ?? "FB") as never,
        ownerId: fallbackUser,
        status: "OFF",
        startedOn: "2026-06-01",
        endedOn: "2026-08-26",
        notes: cfg.note ?? "migrated",
        createdBy: fallbackUser,
      })
      .returning({ id: schema.campaigns.id });
    campIdByKey.set(key, row.id);
  }

  // campaign_daily_metrics (tổng/campaign tại ngày chốt số)
  let cdmInserted = 0;
  for (const cmr of cmRows) {
    const cid = campIdByKey.get(cmr.name);
    if (!cid) continue;
    await db
      .insert(schema.campaignDailyMetrics)
      .values({
        campaignId: cid,
        metricDate: "2026-08-24",
        spend: cmr.spend,
        messages: cmr.messages,
        source: "MANUAL",
        enteredBy: fallbackUser,
        note: "migrated — tổng campaign, chưa tách theo ngày",
      })
      .onConflictDoNothing();
    cdmInserted++;
  }

  // leads + enrollments
  let leadInserted = 0;
  let enrInserted = 0;
  let seq = 0;
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  for (const l of leads) {
    if (!l.fullName) continue;
    const recvDay = l.receivedAt && ISO_DAY.test(l.receivedAt) ? l.receivedAt : "2026-06-01";
    const received = new Date(`${recvDay}T03:00:00Z`);
    const ym = recvDay.slice(2, 7).replace("-", "");
    const code = `L-${ym}-M${String(++seq).padStart(4, "0")}`;
    const assignedTo =
      userByAlias.get(noAccent(l.consultantRaw)) ?? fallbackUser;
    const productId = prodByCode.get(l.productCode) ?? prodByCode.get("KHAC")!;
    const campaignId =
      l.campaignKey && !["ORGANIC", "REFERRAL", "HOTLINE"].includes(l.source)
        ? (campIdByKey.get(l.campaignKey) ?? null)
        : null;

    const rankMap: Record<string, number> = {
      NEW: 0, NO_CONTACT: 1, CONSULTING: 2, MQL: 3, SQL: 4, WON: 5,
    };
    const [lrow] = await db
      .insert(schema.leads)
      .values({
        code,
        receivedAt: received,
        fullName: l.fullName,
        nameNormalized: normName(l.fullName),
        phone: l.phone,
        phoneNormalized: l.phone,
        email: l.email,
        fbProfile: l.fbProfile,
        productId,
        productRaw: l.productRaw || null,
        source: l.source as never,
        campaignId,
        stage: l.stage as never,
        maxStage: l.maxStage as never,
        outcome: l.outcome as never,
        assignedTo,
        originallyAssignedTo: assignedTo,
        nextContactDate:
          l.outcome === "DISQUALIFIED" ||
          !l.nextContactDate ||
          !ISO_DAY.test(l.nextContactDate)
            ? null
            : l.nextContactDate,
        mqlAt: rankMap[l.maxStage] >= 3 ? received : null,
        sqlAt: rankMap[l.maxStage] >= 4 ? received : null,
        wonAt: l.outcome === "WON" ? received : null,
        lostReason:
          l.outcome === "LOST"
            ? (l.lostReason ?? "Di chuyển từ sheet — chưa ghi lý do").slice(0, 500)
            : null,
        silenceCount:
          l.nextContactDate && l.nextContactDate < "2026-07-25" ? 4 : 0,
        consultNote: l.consultNote || null,
        migrated: true,
        createdBy: fallbackUser,
        updatedBy: fallbackUser,
      })
      .returning({ id: schema.leads.id });
    leadInserted++;

    if (l.revenue > 0) {
      await db.insert(schema.enrollments).values({
        leadId: lrow.id,
        productId,
        contractDate: recvDay,
        grossAmount: l.revenue,
        collectedAmount: l.revenue,
        studentCount: 1,
        creditedTo: assignedTo,
        note: "migrated",
        createdBy: fallbackUser,
      });
      enrInserted++;
    }
  }

  console.log(
    `\nĐÃ GHI: ${campIdByKey.size} campaign, ${cdmInserted} dòng metric, ${leadInserted} lead, ${enrInserted} enrollment.`,
  );
  const { disposeDb } = await import("../src/lib/db");
  await disposeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
