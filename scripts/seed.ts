import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { DEMO_MODE, db, disposeDb } from "../src/lib/db";
import * as schema from "../src/lib/db/schema";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "truongphong@vmg.local";
const DEFAULT_PW = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe#2026";

async function seedProducts() {
  // SPEC Mục 4.5. Giá niêm yết để null — cần P.TCKT xác nhận (QĐ02).
  const rows: (typeof schema.products.$inferInsert)[] = [
    { code: "TESOL", name: "TESOL E-PATH", budgetSharePct: "50.00", priority: 1, sortOrder: 1, note: "Sản phẩm lõi. Ưu tiên nguồn lực số 1." },
    { code: "VSTEP", name: "VSTEP Mastery", budgetSharePct: "20.00", priority: 2, sortOrder: 2 },
    { code: "TQ", name: "Tiếng Trung", budgetSharePct: "10.00", priority: 3, sortOrder: 3 },
    { code: "FT15", name: "IELTS Fast Track 1.5", budgetSharePct: "10.00", priority: 4, sortOrder: 4, isActive: true, note: "Dừng từ Q4/2026 — khi đó đặt is_active = false, vẫn giữ dữ liệu lịch sử." },
    { code: "FLEXTRACK", name: "FlexTrack 1-1 / nhóm nhỏ", budgetSharePct: "10.00", priority: 5, sortOrder: 5 },
    { code: "IE", name: "IELTS Express Online", sortOrder: 6 },
    { code: "GT", name: "Tiếng Anh Giao tiếp", sortOrder: 7 },
    { code: "EDU", name: "EduNext (B2B)", sortOrder: 8 },
    { code: "KHAC", name: "Khác", sortOrder: 99, note: "Bắt buộc kèm ghi chú khi dùng." },
  ].map((p) => ({ ...p, targetCpmql: 600000, killThresholdNoMql: 900000, cacRoomPct: "15.00" }));

  await db.insert(schema.products).values(rows).onConflictDoNothing({
    target: schema.products.code,
  });
  console.log(`products: +${rows.length} (bỏ qua nếu đã có)`);
}

async function seedKpiDefinitions() {
  // SPEC Mục 14.2
  const rows: (typeof schema.kpiDefinitions.$inferInsert)[] = [
    { code: "HVM", name: "Học viên mới", unit: "COUNT", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "hvm", description: "SUM(enrollments.student_count) trong kỳ" },
    { code: "CASH_COLLECTED", name: "Tiền thu", unit: "VND", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "cash_collected" },
    { code: "REVENUE_GROSS", name: "Doanh thu gộp", unit: "VND", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "revenue_gross" },
    { code: "REVENUE_AFTER_MKT", name: "Doanh thu gộp sau chi phí MKT & KOL/KOC", unit: "VND", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "revenue_after_mkt", description: "REVENUE_GROSS - spend - kol_cost" },
    { code: "MQL_COUNT", name: "Số MQL tạo ra", unit: "COUNT", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "mql", description: "COUNT(max_stage >= MQL) theo mql_at" },
    { code: "CPMQL", name: "Chi phí mỗi MQL", unit: "VND", direction: "LOWER_BETTER", source: "AUTO", formulaKey: "cpmql" },
    { code: "DAILY_CLEAR_RATE", name: "Tỷ lệ xử lý hàng đợi đúng hẹn", unit: "PERCENT", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "daily_clear_rate" },
    { code: "DATA_COMPLIANCE", name: "Tỷ lệ ngày nhập đủ số liệu ads", unit: "PERCENT", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "data_entry_compliance" },
    { code: "TASK_COMPLETION", name: "Tỷ lệ hoàn thành đầu việc", unit: "PERCENT", direction: "HIGHER_BETTER", source: "AUTO", formulaKey: "task_completion" },
    { code: "CUSTOM_MANUAL", name: "Chỉ tiêu nhập tay", unit: "RATIO", direction: "HIGHER_BETTER", source: "MANUAL" },
  ];
  await db.insert(schema.kpiDefinitions).values(rows).onConflictDoNothing({
    target: schema.kpiDefinitions.code,
  });
  console.log(`kpi_definitions: +${rows.length}`);
}

async function seedHolidays() {
  // Ngày lễ VN 2026 (rút gọn) — SPEC Mục 8.2. Bổ sung/điều chỉnh khi có lịch chính thức.
  const rows = [
    { holidayDate: "2026-01-01", name: "Tết Dương lịch" },
    { holidayDate: "2026-02-17", name: "Tết Nguyên đán" },
    { holidayDate: "2026-02-18", name: "Tết Nguyên đán" },
    { holidayDate: "2026-02-19", name: "Tết Nguyên đán" },
    { holidayDate: "2026-04-26", name: "Giỗ Tổ Hùng Vương" },
    { holidayDate: "2026-04-30", name: "Giải phóng miền Nam" },
    { holidayDate: "2026-05-01", name: "Quốc tế Lao động" },
    { holidayDate: "2026-09-02", name: "Quốc khánh" },
  ];
  await db.insert(schema.holidays).values(rows).onConflictDoNothing({
    target: schema.holidays.holidayDate,
  });
  console.log(`holidays: +${rows.length}`);
}

async function seedSettings() {
  const rows = [
    { key: "cpmql_alert_threshold_default", value: 600000, description: "Ngưỡng CPMQL mặc định (SPEC 9.4 / QĐ01)" },
    { key: "kill_threshold_no_mql_default", value: 900000, description: "Spend chưa ra MQL nào thì đề xuất kill" },
    { key: "attribution_window_days", value: 90, description: "Cửa sổ quy kết campaign (SPEC 9.3)" },
    { key: "budget_share_plan", value: { TESOL: 50, VSTEP: 20, TQ: 10, FT15: 10, FLEXTRACK: 10 }, description: "Tỷ trọng ngân sách đã duyệt (Kế hoạch T9)" },
  ];
  await db.insert(schema.appSettings).values(rows).onConflictDoNothing({
    target: schema.appSettings.key,
  });
  console.log(`app_settings: +${rows.length}`);
}

async function seedUsers() {
  const hash = await bcrypt.hash(DEFAULT_PW, 12);
  const rows: (typeof schema.users.$inferInsert)[] = [
    // Tài khoản demo dùng nhanh — KHÔNG buộc đổi mật khẩu. Xóa/đổi trước khi lên thật.
    { email: "admin", fullName: "Admin (demo)", jobTitle: "Quản trị hệ thống", role: "ADMIN", passwordHash: await bcrypt.hash("admin", 12), mustChangePassword: false },
    { email: ADMIN_EMAIL, fullName: "Trưởng phòng Marketing, TMĐT & CRM", jobTitle: "Trưởng phòng Marketing, TMĐT & CRM", role: "ADMIN", passwordHash: hash, mustChangePassword: true, aliasNames: ["Nghiêm"] },
    { email: "marketing@vmg.local", fullName: "Marketing Executive", jobTitle: "Marketing Executive", role: "MARKETING", passwordHash: hash, mustChangePassword: true, aliasNames: ["Khiết", "Khiet"] },
    { email: "ec1@vmg.local", fullName: "E-Commerce Executive 1", jobTitle: "E-Commerce Executive", role: "EC", passwordHash: hash, mustChangePassword: true, aliasNames: ["Kien", "Kiên"] },
    { email: "ec2@vmg.local", fullName: "E-Commerce Executive 2", jobTitle: "E-Commerce Executive", role: "EC", passwordHash: hash, mustChangePassword: true, aliasNames: ["Ý", "Y"] },
    { email: "bod@vmg.local", fullName: "Ban Giám đốc", jobTitle: "Thành viên Ban Giám đốc", role: "VIEWER", passwordHash: hash, mustChangePassword: true },
  ];
  await db.insert(schema.users).values(rows).onConflictDoNothing({
    target: schema.users.email,
  });
  console.log(
    `users: +${rows.length}.\n` +
      `  • Demo nhanh: admin / admin (ADMIN, không buộc đổi MK).\n` +
      `  • Các tài khoản còn lại: mật khẩu "${DEFAULT_PW}", buộc đổi lần đầu.`,
  );
}

async function seedDemo() {
  const existing = await db.execute(sql`select count(*)::int as c from leads`);
  const c =
    Array.isArray(existing) ? (existing[0] as any)?.c : (existing as any).rows?.[0]?.c;
  if (Number(c) > 0) {
    console.log("demo: đã có lead, bỏ qua.");
    return;
  }

  const [marketing] = await db
    .select()
    .from(schema.users)
    .where(sql`${schema.users.role} = 'MARKETING'`)
    .limit(1);
  const ecs = await db
    .select()
    .from(schema.users)
    .where(sql`${schema.users.role} = 'EC'`);
  const products = await db.select().from(schema.products);
  const pById = Object.fromEntries(products.map((p) => [p.code, p]));
  if (!marketing || ecs.length === 0) {
    console.log("demo: chưa có user, bỏ qua.");
    return;
  }

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  const [campA] = await db
    .insert(schema.campaigns)
    .values({
      internalCode: "TESOL-FB-MSG-" + iso(daysAgo(40)).slice(2, 7).replace("-", "") + "-01",
      displayName: "TESOL — Tin nhắn (demo)",
      productId: pById["TESOL"].id,
      channel: "FB",
      objective: "MESSAGE",
      ownerId: marketing.id,
      status: "ON",
      dailyBudget: 500000,
      startedOn: iso(daysAgo(40)),
    })
    .returning();

  const [campB] = await db
    .insert(schema.campaigns)
    .values({
      internalCode: "FT15-FB-LEADFORM-" + iso(daysAgo(30)).slice(2, 7).replace("-", "") + "-01",
      displayName: "FT15 — Leadform (demo)",
      productId: pById["FT15"].id,
      channel: "FB",
      objective: "LEADFORM",
      ownerId: marketing.id,
      status: "ON",
      dailyBudget: 300000,
      startedOn: iso(daysAgo(30)),
    })
    .returning();

  // Số liệu ads 30 ngày
  const metrics: (typeof schema.campaignDailyMetrics.$inferInsert)[] = [];
  for (let i = 30; i >= 1; i--) {
    metrics.push({
      campaignId: campA.id,
      metricDate: iso(daysAgo(i)),
      spend: 400000 + Math.floor(Math.random() * 200000),
      messages: 6 + Math.floor(Math.random() * 8),
      enteredBy: marketing.id,
    });
    if (i <= 25)
      metrics.push({
        campaignId: campB.id,
        metricDate: iso(daysAgo(i)),
        spend: 250000 + Math.floor(Math.random() * 150000),
        messages: 3 + Math.floor(Math.random() * 5),
        enteredBy: marketing.id,
      });
  }
  await db.insert(schema.campaignDailyMetrics).values(metrics);

  // Leads
  let seq = 1;
  const mkCode = (d: Date) => `L-${iso(d).slice(2, 7).replace("-", "")}-${String(seq++).padStart(4, "0")}`;
  const leadRows: (typeof schema.leads.$inferInsert)[] = [];
  for (let i = 0; i < 26; i++) {
    const recv = daysAgo(Math.floor(Math.random() * 30));
    const camp = i % 3 === 0 ? campB : campA;
    const prod = camp === campB ? pById["FT15"] : pById["TESOL"];
    const ec = ecs[i % ecs.length];
    const r = Math.random();
    type S = "NEW" | "CONSULTING" | "MQL" | "SQL" | "WON";
    let stage: S = "NEW";
    let maxStage: S = "NEW";
    let outcome: "OPEN" | "WON" | "LOST" | "DISQUALIFIED" = "OPEN";
    let mqlAt: Date | null = null;
    let sqlAt: Date | null = null;
    if (r > 0.25) {
      stage = "CONSULTING";
      maxStage = "CONSULTING";
    }
    if (r > 0.45) {
      maxStage = "MQL";
      stage = "MQL";
      mqlAt = new Date(recv.getTime() + 2 * 86400000);
    }
    if (r > 0.7) {
      maxStage = "SQL";
      stage = "SQL";
      sqlAt = new Date(recv.getTime() + 4 * 86400000);
    }
    if (r > 0.88) {
      maxStage = "WON";
      stage = "WON";
      outcome = "WON";
    } else if (r > 0.8) {
      outcome = "LOST";
      stage = "CONSULTING";
    }
    leadRows.push({
      code: mkCode(recv),
      receivedAt: recv,
      fullName: `Khách demo ${i + 1}`,
      phone: `09${String(10000000 + i).slice(0, 8)}`,
      phoneNormalized: `09${String(10000000 + i).slice(0, 8)}`,
      nameNormalized: `khach demo ${i + 1}`,
      productId: prod.id,
      source: "FB",
      campaignId: camp.id,
      stage,
      maxStage,
      outcome,
      assignedTo: ec.id,
      originallyAssignedTo: ec.id,
      mqlAt,
      sqlAt,
      wonAt: outcome === "WON" ? new Date(recv.getTime() + 8 * 86400000) : null,
      lostReason: outcome === "LOST" ? "Khách cân nhắc lại về chi phí (demo)." : null,
      nextContactDate:
        outcome === "OPEN" ? iso(daysAgo(Math.floor(Math.random() * 6) - 2)) : null,
      silenceCount: outcome === "OPEN" ? Math.floor(Math.random() * 4) : 0,
      consultNote: "Ghi chú demo.",
    });
  }
  const insertedLeads = await db.insert(schema.leads).values(leadRows).returning();

  // Enrollments cho lead WON
  for (const l of insertedLeads) {
    if (l.outcome === "WON") {
      await db.insert(schema.enrollments).values({
        leadId: l.id,
        productId: l.productId,
        contractDate: iso(new Date(l.wonAt ?? today)),
        grossAmount: 9900000,
        discountAmount: 0,
        collectedAmount: 9900000,
        studentCount: 1,
        creditedTo: l.assignedTo,
      });
    }
  }

  console.log(
    `demo: 2 campaign, ${metrics.length} dòng metric, ${insertedLeads.length} lead.`,
  );
}

async function main() {
  console.log(DEMO_MODE ? "Seed vào PGlite (DEMO)..." : "Seed vào Postgres...");
  await seedProducts();
  await seedKpiDefinitions();
  await seedHolidays();
  await seedSettings();
  await seedUsers();
  if (!process.argv.includes("--no-demo")) await seedDemo();
  await disposeDb();
  console.log("Seed xong.");
}

main().catch(async (e) => {
  console.error(e);
  await disposeDb().catch(() => {});
  process.exit(1);
});
