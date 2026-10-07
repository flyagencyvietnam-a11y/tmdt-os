import "./_env";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { DEMO_MODE, db, disposeDb } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";

/**
 * Seed dữ liệu ban đầu — SPEC Mục 15. KHÔNG bịa dữ liệu thật (email, ngày họp,
 * danh mục SBU đầy đủ...): những gì spec chưa xác nhận thì để trống hoặc seed
 * placeholder + log rõ ràng, theo đúng Mục 0 / Mục 9 của CLAUDE.md dự án VMG.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe#2026";

async function upsertUser(input: {
  email: string;
  fullName: string;
  role: (typeof schema.roleEnum.enumValues)[number];
  canAssign?: boolean;
  password?: string;
  mustChangePassword?: boolean;
}) {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, input.email)).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password ?? ADMIN_PASSWORD, 12),
      fullName: input.fullName,
      role: input.role,
      canAssign: input.canAssign ?? false,
      mustChangePassword: input.mustChangePassword ?? true,
    })
    .returning();
  return row;
}

async function seedUsers() {
  // Trưởng phòng Marketing đăng nhập bằng "nghiem" / "nghiem" (theo yêu cầu chủ sản phẩm 10/2026) — mật khẩu YẾU, chỉ nội bộ.
  // SEED_ADMIN_EMAIL (nếu đặt) vẫn ghi đè tên đăng nhập.
  const admin = await upsertUser({
    email: ADMIN_EMAIL || "nghiem",
    fullName: "Trưởng phòng Marketing",
    role: "admin",
    canAssign: true,
    password: "nghiem",
    mustChangePassword: false,
  });
  // SPEC Mục 15: "Khiết và Đạt (member), Trân - thiết kế (member)". Theo yêu cầu chủ sản phẩm:
  // đăng nhập bằng tên ngắn, mật khẩu trùng tên, không bắt đổi mật khẩu — MẬT KHẨU YẾU, chỉ nội bộ.
  const khiet = await upsertUser({ email: "khiet", fullName: "Khiết", role: "member", canAssign: true, password: "khiet", mustChangePassword: false });
  const dat = await upsertUser({ email: "dat", fullName: "Đạt", role: "member", canAssign: true, password: "dat", mustChangePassword: false });
  const tran = await upsertUser({ email: "tran", fullName: "Trân", role: "member", canAssign: true, password: "tran", mustChangePassword: false });
  // Tài khoản dự phòng luôn đăng nhập được — theo yêu cầu người dùng. KHÔNG dùng
  // mật khẩu này sau khi mời người dùng thật / trước khi public ra ngoài đội.
  const fallbackAdmin = await upsertUser({
    email: "admin",
    fullName: "Admin (dự phòng)",
    role: "admin",
    canAssign: true,
    password: "admin",
    mustChangePassword: false,
  });
  console.log(
    `users: admin=${admin.email} khiet=${khiet.email} dat=${dat.email} tran=${tran.email} fallback=${fallbackAdmin.email}`,
  );
  console.warn(
    "[seed] Khiết/Đạt/Trân đăng nhập bằng 'khiet'/'dat'/'tran' (mật khẩu trùng tên) — mật khẩu YẾU, " +
      "đổi qua Cài đặt ▸ Người dùng trước khi public ra ngoài đội. Trưởng phòng: 'nghiem'/'nghiem'.",
  );
  console.warn(
    "[seed] Tài khoản dự phòng 'admin' / 'admin' (full quyền, không bắt đổi mật khẩu) đã tạo theo " +
      "yêu cầu — mật khẩu YẾU, chỉ dùng nội bộ lúc test. Đổi hoặc vô hiệu hoá (set active=false) " +
      "qua Cài đặt ▸ Người dùng trước khi mời người dùng thật / public ra ngoài.",
  );
  return { admin, khiet, dat, tran, fallbackAdmin };
}

/** SPEC Mục 15 — 12 SBU. [CẦN XÁC NHẬN] danh sách trung tâm thuộc KV2 và KV3 (gộp tạm KV2_KV3). */
async function seedSbus(khietId: string, datId: string) {
  const rows: (typeof schema.sbus.$inferInsert)[] = [
    { code: "VTS", name: "VTS", kind: "center", region: "KV1", hoOwnerId: khietId },
    { code: "PVT", name: "PVT", kind: "center", region: "KV1", hoOwnerId: khietId },
    { code: "NKN", name: "NKN", kind: "center", region: "KV1", hoOwnerId: khietId },
    { code: "TBM", name: "TBM", kind: "center", region: "KV1", hoOwnerId: khietId },
    // KV2/KV3 đã chốt với chủ sản phẩm: KV3 chỉ có Bình Phước, còn lại thuộc KV2.
    { code: "LDN", name: "LDN", kind: "center", region: "KV2", hoOwnerId: datId },
    { code: "TPU", name: "TPU", kind: "center", region: "KV2", hoOwnerId: datId },
    { code: "PTA", name: "PTA", kind: "center", region: "KV2", hoOwnerId: datId },
    { code: "NTI", name: "NTI", kind: "center", region: "KV2", hoOwnerId: datId },
    { code: "HVG", name: "HVG", kind: "center", region: "KV2", hoOwnerId: datId },
    { code: "BPH", name: "BPH", kind: "center", region: "KV3", hoOwnerId: datId },
    { code: "TMDT", name: "Trung tâm Kinh doanh TMĐT", kind: "online_center", region: "ONLINE", hoOwnerId: khietId },
    // Brand/sản phẩm cũng là SBU (kind=brand). VMP giữ người phụ trách HO (Đạt); các brand còn lại chưa có.
    { code: "VMP", name: "VMP by VMG", kind: "brand", region: "BRAND", hoOwnerId: datId },
    { code: "VMT", name: "VMT", kind: "brand", region: "BRAND" },
    { code: "VMG", name: "VMG", kind: "brand", region: "BRAND" },
    // Nhóm kênh của các trung tâm (10 fanpage + Zalo OA) — brand thứ 8, thêm 10/2026 từ file "TỔNG HỢP CÁC KÊNH DIGITAL".
    { code: "VMG_ENGLISH", name: "VMG English", kind: "brand", region: "BRAND" },
    { code: "VMG_IELTS", name: "VMG IELTS", kind: "brand", region: "BRAND" },
    { code: "VMG_TESOL", name: "VMG TESOL", kind: "brand", region: "BRAND" },
    { code: "VMG_TRUNG", name: "VMG Tiếng Trung", kind: "brand", region: "BRAND" },
    { code: "UPLEARN", name: "UpLearn by VMG", kind: "brand", region: "BRAND" },
  ];
  for (const r of rows) {
    await db.insert(schema.sbus).values(r).onConflictDoNothing({ target: schema.sbus.code });
  }
  console.log(`sbus: ${rows.length} (Khiết phụ trách 5: VTS,PVT,NKN,TBM,TMDT — Đạt phụ trách 7: LDN,TPU,PTA,NTI,HVG,BPH,VMP — kèm 8 SBU brand)`);
}

/** SPEC Mục 1.1 / 2 — 7 brand. VMT: public_name_allowed=false cho tới khi có quyết định rebrand. */
async function seedBrands() {
  const rows: (typeof schema.brands.$inferInsert)[] = [
    { code: "VMG", name: "VMG", kind: "group", publicNameAllowed: true },
    { code: "VMG_IELTS", name: "VMG IELTS", kind: "product", publicNameAllowed: true },
    { code: "VMG_TESOL", name: "VMG TESOL", kind: "product", publicNameAllowed: true },
    { code: "VMG_TRUNG", name: "VMG Tiếng Trung", kind: "product", publicNameAllowed: true },
    { code: "VMP", name: "VMP by VMG", kind: "product", publicNameAllowed: true },
    { code: "VMT", name: "VMT", kind: "product", publicNameAllowed: false },
    { code: "UPLEARN", name: "UpLearn by VMG", kind: "product", publicNameAllowed: true },
  ];
  for (const r of rows) {
    await db.insert(schema.brands).values(r).onConflictDoNothing({ target: schema.brands.code });
  }
  // Gắn SBU kiểu brand với brand tương ứng (cùng mã).
  for (const r of rows) {
    const [b] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.code, r.code)).limit(1);
    if (b) await db.update(schema.sbus).set({ brandId: b.id }).where(eq(schema.sbus.code, r.code));
  }
  console.log(`brands: ${rows.length}`);
}

/** SPEC Mục 13.4 — chỉ 4 ngày lễ dương lịch chắc chắn. Tết/Giỗ Tổ: KHÔNG đoán ngày, thêm tay sau. */
async function seedHolidays() {
  const fixed = [
    ["01-01", "Tết Dương lịch"],
    ["04-30", "Ngày Giải phóng miền Nam"],
    ["05-01", "Ngày Quốc tế Lao động"],
    ["09-02", "Ngày Quốc khánh"],
  ] as const;
  const rows: (typeof schema.holidays.$inferInsert)[] = [];
  for (const year of [2026, 2027]) {
    for (const [md, name] of fixed) rows.push({ holidayDate: `${year}-${md}`, name });
  }
  for (const r of rows) {
    await db.insert(schema.holidays).values(r).onConflictDoNothing({ target: schema.holidays.holidayDate });
  }
  console.log(`holidays: ${rows.length} (chỉ ngày dương lịch cố định)`);
  console.warn(
    "[seed] CHƯA seed Tết Nguyên Đán / Giỗ Tổ Hùng Vương / ngày nghỉ bù — đây là ngày âm lịch và " +
      "do Chính phủ công bố lịch nghỉ hoán đổi hằng năm, không nên đoán. Thêm tay qua Cài đặt ▸ Ngày lễ " +
      "khi có lịch nghỉ chính thức (SPEC Mục 13.4).",
  );
}

async function seedAppSettings(adminId: string) {
  const rows: (typeof schema.appSettings.$inferInsert)[] = [
    {
      key: "work_days",
      value: [1, 2, 3, 4, 5, 6],
      description:
        "Tuần làm việc của phòng — Mục 16.2 Q3, ĐÃ CHỐT: T2-T6 + Thứ 7 (chỉ làm buổi sáng — work_days không " +
        "phân biệt được nửa ngày, coi Thứ 7 là ngày làm việc đầy đủ cho mục đích tính last/first_working_day).",
      updatedBy: adminId,
    },
    { key: "quiet_hours", value: { start: "19:00", end: "07:30" }, description: "Giờ yên lặng — không gửi email ngoài khung này (Mục 11.3)", updatedBy: adminId },
    { key: "escalation_threshold_days", value: 2, description: "Số ngày làm việc trễ hạn trước khi nhắc quản lý (Mục 11.2)", updatedBy: adminId },
    {
      key: "workload_overload_threshold",
      value: { hours: 40, tasks: 8 },
      description: "Ngưỡng quá tải cho trang Workload — Mục 13.4/8.3 (giờ/tuần hoặc số task/tuần nếu task không có estimate_hours)",
      updatedBy: adminId,
    },
  ];
  for (const r of rows) {
    await db.insert(schema.appSettings).values(r).onConflictDoNothing({ target: schema.appSettings.key });
  }
  console.log(`app_settings: ${rows.length}`);
}

/** SPEC Phụ lục C — 9 quy tắc lặp điều phối Brand Campaign hàng tháng. */
async function seedRecurringRules(adminId: string) {
  const startsOn = "2026-10-01";
  // 10 trung tâm B2C offline (kind='center') — phạm vi báo cáo ads tuần/tháng (Mục 2), KHÔNG gồm TMDT/VMP_VMT.
  const b2cCenters = await db.select({ id: schema.sbus.id }).from(schema.sbus).where(eq(schema.sbus.kind, "center"));
  const b2cCenterIds = b2cCenters.map((s) => s.id);
  const rules: (typeof schema.recurringRules.$inferInsert)[] = [
    {
      ruleCode: "CAD-01",
      name: "Họp thống nhất Brand Theme tháng sau",
      description:
        "Mốc 01 — ĐÃ CHỐT: ngày làm việc cuối cùng của tháng (cùng ngày với CAD-07 báo cáo Marketing tháng, " +
        "trước khi tháng kế tiếp bắt đầu).",
      taskTemplate: { title: "Họp thống nhất Brand Theme tháng {{next_month}}/{{year}} với BĐH", type: "meeting", priority: "high" },
      freq: "monthly",
      dayRule: "last_working_day",
      holidayPolicy: "none",
      startsOn,
      assignmentMode: "fixed_user",
      fixedAssigneeId: adminId,
      scopeMode: "single",
      active: true,
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-02",
      name: "Gửi Brand Campaign nháp tháng sau cho GĐKV",
      description: "Mốc 02 — ngày 10 (SPEC Phụ lục C).",
      taskTemplate: { title: "Gửi email Brand Campaign nháp tháng {{next_month}}/{{year}} cho các GĐKV", type: "general", priority: "high" },
      freq: "monthly",
      byMonthDay: 10,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "fixed_user",
      fixedAssigneeId: adminId,
      scopeMode: "single",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-03",
      name: "Theo dõi GĐKV hoàn thiện Brief chương trình bán hàng",
      description: "Mốc 03 — ngày 15. Mô hình gốc là task_per_sbu theo 3 khu vực (GĐKV) — MKT OS chưa có " +
        "thực thể 'khu vực' riêng nên tạm dùng 1 task theo dõi với checklist 3 khu vực.",
      taskTemplate: {
        title: "Theo dõi GĐKV hoàn thiện Brief chương trình bán hàng tháng {{next_month}}/{{year}}",
        type: "general",
        priority: "high",
        checklist: ["Khu vực 1 (KV1)", "Khu vực 2 (KV2)", "Khu vực 3 (KV3)"],
      },
      freq: "monthly",
      byMonthDay: 15,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "fixed_user",
      fixedAssigneeId: adminId,
      scopeMode: "single",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-04",
      name: "Ban hành Brand Kit chính thức",
      description: "Mốc 04 — ngày 20.",
      taskTemplate: {
        title: "Ban hành Brand Kit chính thức tháng {{next_month}}/{{year}} cho các trung tâm",
        type: "general",
        priority: "high",
        checklist: ["Key Visual", "Brand Theme Card", "Template"],
      },
      freq: "monthly",
      byMonthDay: 20,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "fixed_user",
      fixedAssigneeId: adminId,
      scopeMode: "single",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-05",
      name: "Theo dõi trung tâm gửi Content Plan",
      description: "Mốc 05 — ngày 25. checklist_per_owner theo SBU (Khiết 5, Đạt 7).",
      taskTemplate: { title: "Theo dõi Content Plan tháng {{next_month}}/{{year}} — các trung tâm phụ trách", type: "content", priority: "high" },
      freq: "monthly",
      byMonthDay: 25,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "sbu_ho_owner",
      scopeMode: "per_sbu",
      fanOutMode: "checklist_per_owner",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-06a",
      name: "Thẩm định Content Plan từng trung tâm",
      description: "Ngày 25 + 3 ngày làm việc, không quá ngày 28 — xấp xỉ bằng due_offset_days=3 (chưa áp trần ngày 28).",
      taskTemplate: { title: "Thẩm định & phản hồi Content Plan tháng {{next_month}}/{{year}}", type: "content", priority: "high" },
      freq: "monthly",
      byMonthDay: 25,
      dueOffsetDays: 3,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "sbu_ho_owner",
      scopeMode: "per_sbu",
      fanOutMode: "checklist_per_owner",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-06b",
      name: "Phê duyệt & khởi động Content Plan",
      description: "Mốc 06 — ngày 29 (tháng ngắn thì ngày cuối tháng, tự xử lý qua min(29, ngày cuối tháng)).",
      taskTemplate: { title: "Phê duyệt & khởi động Content Plan tháng {{next_month}}/{{year}}", type: "content", priority: "urgent" },
      freq: "monthly",
      byMonthDay: 29,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "fixed_user",
      fixedAssigneeId: adminId,
      scopeMode: "single",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-07",
      name: "Báo cáo Marketing tháng",
      description: "Ngày làm việc cuối tháng.",
      taskTemplate: { title: "Báo cáo Marketing tháng {{month}}/{{year}}", type: "report", priority: "high" },
      freq: "monthly",
      dayRule: "last_working_day",
      holidayPolicy: "none",
      startsOn,
      assignmentMode: "fixed_user",
      fixedAssigneeId: adminId,
      scopeMode: "single",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-08",
      name: "Rà soát Google Maps các trung tâm",
      description: "Ngày làm việc đầu tháng. checklist_per_owner theo SBU.",
      taskTemplate: { title: "Rà soát Google Maps các trung tâm — tháng {{month}}/{{year}}", type: "monitoring", priority: "medium" },
      freq: "monthly",
      dayRule: "first_working_day",
      holidayPolicy: "none",
      startsOn,
      assignmentMode: "sbu_ho_owner",
      scopeMode: "per_sbu",
      fanOutMode: "checklist_per_owner",
      createdBy: adminId,
    },
    {
      ruleCode: "CAD-09",
      name: "Kiểm tra hiện trạng POSM các trung tâm",
      description: "Ngày 28. checklist_per_owner theo SBU — tiêu chí nghiệm thu SPEC Mục 14.2 #5.",
      taskTemplate: { title: "Kiểm tra hiện trạng POSM tháng {{month}}/{{year}}", type: "monitoring", priority: "medium" },
      freq: "monthly",
      byMonthDay: 28,
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "sbu_ho_owner",
      scopeMode: "per_sbu",
      fanOutMode: "checklist_per_owner",
      createdBy: adminId,
    },
    {
      ruleCode: "ADS-01",
      name: "Báo cáo ads tuần (B2C trung tâm)",
      description:
        "Chu kỳ Thứ 7 tuần trước → hết Thứ 6 tuần này (khớp reportWeekBounds trong lib/time.ts), theo dữ liệu " +
        "thật ở file VMG_Digital_Tracker_2026 sheet 'Tracking Tuần'. checklist_per_owner theo 10 SBU B2C offline " +
        "(Khiết/Đạt) — cập nhật Ngân sách + Mess cho mỗi trung tâm ở /ads.",
      taskTemplate: { title: "Báo cáo ads tuần — hạn {{due_date}}", type: "ads", priority: "high" },
      freq: "weekly",
      byWeekday: [5], // Thứ Sáu
      dayRule: "calendar_day",
      holidayPolicy: "shift_earlier",
      startsOn,
      assignmentMode: "sbu_ho_owner",
      scopeMode: "per_sbu",
      scopeSbuIds: b2cCenterIds.length ? b2cCenterIds : null,
      fanOutMode: "checklist_per_owner",
      createdBy: adminId,
    },
    {
      ruleCode: "ADS-02",
      name: "Báo cáo ads tháng (B2C trung tâm)",
      description:
        "Ngày làm việc cuối tháng, theo dữ liệu thật ở sheet 'Tổng hợp' + 'B2C Trung tâm'. checklist_per_owner " +
        "theo 10 SBU B2C offline — cập nhật Ngân sách (TT order + MKT thêm), Lead, HVM cho mỗi trung tâm ở /ads.",
      taskTemplate: { title: "Báo cáo ads tháng {{month}}/{{year}} — B2C trung tâm", type: "ads", priority: "high" },
      freq: "monthly",
      dayRule: "last_working_day",
      holidayPolicy: "none",
      startsOn,
      assignmentMode: "sbu_ho_owner",
      scopeMode: "per_sbu",
      scopeSbuIds: b2cCenterIds.length ? b2cCenterIds : null,
      fanOutMode: "checklist_per_owner",
      createdBy: adminId,
    },
  ];
  for (const r of rules) {
    await db.insert(schema.recurringRules).values(r).onConflictDoNothing({ target: schema.recurringRules.ruleCode });
  }
  console.log(`recurring_rules: ${rules.length} (Phụ lục C — CAD-01 nay đã active, ngày họp = ngày làm việc cuối tháng)`);
}

/** SPEC Mục 16.1 — chỉ seed hạng mục catalog được NÊU TÊN RÕ trong spec, không bịa đủ 46 dòng. */
async function seedSbuCatalog() {
  const posm = (await db.select().from(schema.recurringRules).where(eq(schema.recurringRules.ruleCode, "CAD-09")))[0];
  const gmaps = (await db.select().from(schema.recurringRules).where(eq(schema.recurringRules.ruleCode, "CAD-08")))[0];
  const content = (await db.select().from(schema.recurringRules).where(eq(schema.recurringRules.ruleCode, "CAD-05")))[0];
  const rows: (typeof schema.sbuCatalogItems.$inferInsert)[] = [
    {
      code: "OI-POSM",
      group: "cross",
      title: "Kiểm tra hiện trạng POSM",
      hoPlan: true,
      hoControl: true,
      cycle: "Hàng tháng (ngày 28)",
      priority: "Cao",
      defaultRecurringRuleId: posm?.id,
    },
    {
      code: "OI-GMAPS",
      group: "cross",
      title: "Rà soát Google Maps",
      hoPlan: true,
      hoControl: true,
      cycle: "Hàng tháng (ngày làm việc đầu tiên)",
      priority: "Cao",
      defaultRecurringRuleId: gmaps?.id,
    },
    {
      code: "OI-CONTENT",
      group: "cross",
      title: "Gửi Content Plan",
      hoControl: true,
      centerRole: "Trung tâm biên soạn & gửi về HO",
      cycle: "Hàng tháng (ngày 25)",
      priority: "Cao",
      defaultRecurringRuleId: content?.id,
    },
  ];
  for (const r of rows) {
    await db.insert(schema.sbuCatalogItems).values(r).onConflictDoNothing({ target: schema.sbuCatalogItems.code });
  }
  console.log(
    `sbu_catalog_items: ${rows.length} (chỉ 3 hạng mục nêu rõ trong spec — cần file ` +
      "VMG_Marketing_Strategy_Operations_2026.xlsx (sheet 3_SBU_Marketing) để nạp đủ ~46 hạng mục qua template T9).",
  );
}

async function main() {
  console.log(DEMO_MODE ? "Seed vào PGlite (DEMO)..." : "Seed vào Postgres (DATABASE_URL)...");
  const { admin, khiet, dat } = await seedUsers();
  await seedSbus(khiet.id, dat.id);
  await seedBrands();
  await seedHolidays();
  await seedAppSettings(admin.id);
  await seedRecurringRules(admin.id);
  await seedSbuCatalog();
  console.log(
    "\n[seed] CHƯA seed campaigns (17 chủ đề Brand Campaign + 11 campaign khác) — dữ liệu này nằm ở file " +
      "VMG_Marketing_Strategy_Operations_2026.xlsx (sheet 2_Campaign_Master) chưa được cung cấp cho agent. " +
      "Nạp qua template T1 khi có file, hoặc gửi file cho agent để seed đúng (SPEC Mục 15).",
  );
  await disposeDb();
  console.log("Xong.");
}

main().catch(async (e) => {
  console.error(e);
  await disposeDb().catch(() => {});
  process.exit(1);
});
