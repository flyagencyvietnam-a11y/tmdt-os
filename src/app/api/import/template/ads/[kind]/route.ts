import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { ECOM_PRODUCTS } from "@/lib/ads-metrics";
import { buildXlsx, type XlsxSheetSpec } from "@/lib/export-xlsx";
import { reportWeekBounds, todayVnDayStr } from "@/lib/time";

type Kind = "week" | "month" | "request" | "plan";
const FILE: Record<Kind, string> = { week: "Tuan", month: "Thang", request: "Request", plan: "KeHoach" };

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const mmyyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/**
 * Template import Ads — 4 loại (kế hoạch tháng / hàng tuần / hàng tháng / theo request).
 * Mỗi dòng = 1 SBU (SPEC Phụ lục D mục 26): cột `sbu` = HO | mã trung tâm | ECOM | VMP | VMT. Điền sẵn khung (tuần/tháng + danh sách SBU)
 * để nhân sự chỉ việc nhập số; dòng để trống số sẽ bị bỏ qua khi nạp. `?week=dd-mm-yyyy` / `?month=yyyy-mm` đổi kỳ điền sẵn.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { kind } = await params;
  if (kind !== "week" && kind !== "month" && kind !== "request" && kind !== "plan") return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const weekQ = url.searchParams.get("week");
  const monthQ = url.searchParams.get("month");
  const today = todayVnDayStr();
  const week = weekQ && /^\d{4}-\d{2}-\d{2}$/.test(weekQ) ? weekQ : reportWeekBounds(today)[0];
  const month = monthQ && /^\d{4}-\d{2}$/.test(monthQ) ? monthQ : today.slice(0, 7);

  const centers = await db.select({ code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")).orderBy(asc(sbus.code));
  // Danh sách SBU của Growth Performance, đúng thứ tự trên giao diện.
  const units: { code: string; name: string; note: string }[] = [
    { code: "HO", name: "Hệ thống (HO chạy chung)", note: "NS Hệ thống + Lead/HVM TỔNG cả B2C (Hệ thống + các trung tâm)" },
    ...centers.map((c) => ({ code: c.code, name: c.name, note: "Trung tâm — NS TT order (+ NS P.MKT thêm ở sheet THANG), Lead/HVM quy riêng cho ads ngân sách TT (một phần của số tổng B2C)" })),
    { code: "ECOM", name: "Ecom (TMĐT)", note: "Lead của Ecom = MQL (cột mql)" },
    { code: "VMP", name: "VMP (Du học)", note: "" },
    { code: "VMT", name: "VMT (khảo thí)", note: "" },
  ];
  const requestUnits = units.filter((u) => u.code !== "HO");

  const catalog: XlsxSheetSpec = {
    name: "DANH_MUC",
    columns: [
      { header: "sbu (điền vào cột sbu)", key: "sbu", width: 16 },
      { header: "Tên SBU", key: "sbu_name", width: 30 },
      { header: "Ghi chú", key: "note", width: 70 },
      { header: "product (sheet ECOM_SP)", key: "product", width: 28 },
      { header: "Tên sản phẩm", key: "product_name", width: 34 },
    ],
    rows: Array.from({ length: Math.max(units.length, ECOM_PRODUCTS.length) }, (_, i) => ({
      sbu: units[i]?.code ?? "",
      sbu_name: units[i]?.name ?? "",
      note: units[i]?.note ?? "",
      product: ECOM_PRODUCTS[i]?.key ?? "",
      product_name: ECOM_PRODUCTS[i]?.label ?? "",
    })),
  };

  const sheets: XlsxSheetSpec[] = [];
  const frame = (list: { code: string }[], make: (code: string) => Record<string, string>) => list.map((u) => make(u.code));

  if (kind === "plan") {
    const m = mmyyyy(month);
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import KẾ HOẠCH ads THÁNG", key: "note", width: 120 }],
        rows: [
          { note: "Mỗi dòng = kế hoạch của 1 (tháng, SBU). month = mm/yyyy. Cột sbu: HO | mã trung tâm | ECOM | VMP | VMT (xem DANH_MUC). Đã điền sẵn tháng cần lập và danh sách SBU." },
          { note: "planned_budget = ngân sách kế hoạch (VND). target_* = mục tiêu theo phễu: target_leads (Lead), target_new_students (HVM / chuyển đổi), target_messages (Mess), target_mql (MQL — Ecom), target_revenue (doanh thu — Ecom)." },
          { note: "B2C: dòng HO = NS Hệ thống + mục tiêu Lead/HVM TỔNG cả B2C; từng trung tâm CHỈ lập planned_budget — không có mục tiêu riêng." },
          { note: "Mục tiêu chỉ dùng được với SBU có chỉ số đó: Ecom dùng target_mql / target_new_students / target_revenue (không dùng target_leads); VMP, VMT dùng target_leads / target_new_students." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè; muốn đặt về 0 thì nhập 0. Dòng không điền gì sẽ bị bỏ qua. Nạp lại cùng tháng là cập nhật, không tạo trùng. Mọi thay đổi được ghi nhật ký." },
        ],
      },
      {
        name: "KE_HOACH",
        columns: [
          { header: "month*", key: "month", width: 10 },
          { header: "sbu*", key: "sbu", width: 12 },
          { header: "planned_budget", key: "planned_budget", width: 16 },
          { header: "target_leads", key: "target_leads", width: 14 },
          { header: "target_new_students", key: "target_new_students", width: 20 },
          { header: "target_messages", key: "target_messages", width: 16 },
          { header: "target_mql", key: "target_mql", width: 12 },
          { header: "target_revenue", key: "target_revenue", width: 16 },
          { header: "notes", key: "notes", width: 30 },
        ],
        rows: frame(units, (sbu) => ({ month: m, sbu })),
      },
      catalog,
    );
  } else if (kind === "week") {
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import Ads HÀNG TUẦN", key: "note", width: 120 }],
        rows: [
          { note: "Tuần tính từ THỨ 7 đến hết Thứ 6. week_start là ngày Thứ 7 đầu tuần (dd/mm/yyyy). Mặc định đã điền sẵn tuần cần nhập." },
          { note: "Mỗi dòng 1 (tuần, SBU). Cột sbu: HO | mã trung tâm | ECOM | VMP | VMT (xem DANH_MUC). Mọi SBU dùng chung các cột: budget (ngân sách tuần; trung tâm: TT order + P.MKT chạy thêm), mess, leads (Lead), new_students (HVM), impression (chỉ B2C: HO + trung tâm)." },
          { note: "Ecom: Lead nhập ở cột mql (không dùng leads); ngoài ra có revenue (doanh thu). CPL, CAC, CP/mess do hệ thống tự tính." },
          { note: "Dòng HO: leads/new_students là số TỔNG cả B2C (Hệ thống + trung tâm); số của từng trung tâm là phần quy riêng cho ads ngân sách trung tâm — một phần của số tổng, không cộng thêm." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè. Muốn đặt về 0 thì nhập 0. Dòng không điền số nào sẽ bị bỏ qua. Nạp lại cùng tuần là cập nhật, không tạo trùng." },
        ],
      },
      {
        name: "TUAN",
        columns: [
          { header: "week_start*", key: "week_start", width: 14 },
          { header: "sbu*", key: "sbu", width: 12 },
          { header: "budget", key: "budget", width: 16 },
          { header: "mess", key: "mess", width: 10 },
          { header: "leads", key: "leads", width: 10 },
          { header: "mql (chỉ Ecom)", key: "mql", width: 14 },
          { header: "new_students", key: "new_students", width: 14 },
          { header: "impression (chỉ B2C)", key: "impression", width: 18 },
          { header: "revenue (chỉ Ecom)", key: "revenue", width: 18 },
        ],
        rows: frame(units, (sbu) => ({ week_start: ddmmyyyy(week), sbu })),
      },
      catalog,
    );
  } else if (kind === "month") {
    const m = mmyyyy(month);
    const monthCols = ["budget", "center_order_budget", "ho_topup_budget", "leads", "mql", "new_students", "messages", "revenue", "actual_revenue", "center_feedback", "mkt_assessment"];
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import Ads HÀNG THÁNG", key: "note", width: 120 }],
        rows: [
          { note: "Số THÁNG nhập ở đây là số chính thức (theo đúng tháng dương lịch) và luôn được ưu tiên. Ô để trống thì hệ thống tự cộng từ các tuần (mỗi tuần tính nguyên vẹn vào tháng chiếm nhiều ngày nhất của tuần). month = mm/yyyy. Quý = hệ thống tự cộng 3 tháng — không nhập quý." },
          { note: "Sheet THANG — mỗi dòng 1 (tháng, SBU). Cột sbu: HO | mã trung tâm | ECOM | VMP | VMT (xem DANH_MUC)." },
          { note: "B2C: dòng HO = NS Hệ thống (budget) + Lead/HVM TỔNG của cả Hệ thống + Trung tâm (không tách). Dòng trung tâm = center_order_budget (TT chịu) + ho_topup_budget (P.MKT chạy thêm) + Lead/HVM quy riêng cho ads ngân sách TT (từ T7/2026) — là một PHẦN của số tổng, không cộng thêm." },
          { note: "Cột chỉ dùng cho: center_order_budget / ho_topup_budget / center_feedback / mkt_assessment → trung tâm; mql / revenue / actual_revenue → Ecom (Ecom dùng mql thay cho leads); budget → mọi SBU trừ trung tâm." },
          { note: "Sheet ECOM_SP — Ecom theo sản phẩm: month_from (+ month_to nếu số gộp nhiều tháng, vd. T6–T7), product (xem DANH_MUC), spend, mql, hv, revenue." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè; muốn đặt về 0 thì nhập 0. Dòng không điền số nào bị bỏ qua. Nạp lại là cập nhật, không tạo trùng." },
        ],
      },
      {
        name: "THANG",
        columns: [{ header: "month*", key: "month", width: 10 }, { header: "sbu*", key: "sbu", width: 12 }, ...monthCols.map((c) => ({ header: c, key: c, width: c.includes("feedback") || c.includes("assessment") ? 28 : 16 }))],
        rows: frame(units, (sbu) => ({ month: m, sbu })),
      },
      {
        name: "ECOM_SP",
        columns: [
          { header: "month_from*", key: "month_from", width: 12 },
          { header: "month_to (nếu gộp nhiều tháng)", key: "month_to", width: 26 },
          { header: "product*", key: "product", width: 18 },
          { header: "spend", key: "spend", width: 16 },
          { header: "mql", key: "mql", width: 10 },
          { header: "hv", key: "hv", width: 10 },
          { header: "revenue", key: "revenue", width: 16 },
        ],
        rows: ECOM_PRODUCTS.map((p) => ({ month_from: m, product: p.key })),
      },
      catalog,
    );
  } else {
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import Ads THEO REQUEST", key: "note", width: 120 }],
        rows: [
          { note: "Mỗi dòng = 1 request/chiến dịch ads trong 1 tháng của 1 SBU. Cột sbu: mã trung tâm | ECOM | VMP | VMT (xem DANH_MUC; HO không có request riêng). Khoá: (month, sbu, campaign_name) — nạp lại cùng khoá là cập nhật." },
          { note: "spend bắt buộc khi chiến dịch MỚI; chiến dịch đã có thì để trống spend = giữ số cũ. spend_with_vat = chi phí gồm VAT." },
          { note: "planned_budget = ngân sách KẾ HOẠCH của request; runner = người chạy ads (họ tên hoặc email đúng như trong hệ thống). Ô trống = giữ nguyên." },
          { note: "messages = tin nhắn, reach = người tiếp cận, impressions = lượt hiển thị, conversations = cuộc trò chuyện, comments, engagements = lượt tương tác, reactions = cảm xúc." },
          { note: "misa_request_url = link request duyệt chi trên MISA. Nạp xong KHÔNG tự cộng dồn lên số tháng — dùng nút ⟳ “Cộng dồn” ở tab Request khi cần (tránh ghi đè số đã sửa tay)." },
          { note: "Ví dụ: month 09/2026 | sbu VTS | campaign_name Khai giảng IELTS | spend 1500000 | messages 25 | reach 12000" },
        ],
      },
      {
        name: "REQUEST",
        columns: [
          { header: "month*", key: "month", width: 10 },
          { header: "sbu*", key: "sbu", width: 12 },
          { header: "campaign_name*", key: "campaign_name", width: 34 },
          { header: "spend*", key: "spend", width: 14 },
          { header: "spend_with_vat", key: "spend_with_vat", width: 16 },
          { header: "planned_budget", key: "planned_budget", width: 16 },
          { header: "runner", key: "runner", width: 18 },
          { header: "messages", key: "messages", width: 10 },
          { header: "reach", key: "reach", width: 12 },
          { header: "impressions", key: "impressions", width: 12 },
          { header: "conversations", key: "conversations", width: 14 },
          { header: "comments", key: "comments", width: 10 },
          { header: "engagements", key: "engagements", width: 12 },
          { header: "reactions", key: "reactions", width: 10 },
          { header: "misa_request_url", key: "misa_request_url", width: 30 },
        ],
        rows: [],
      },
      { ...catalog, rows: catalog.rows.map((r, i) => ({ ...r, sbu: requestUnits[i]?.code ?? "", sbu_name: requestUnits[i]?.name ?? "", note: requestUnits[i]?.note ?? "" })) },
    );
  }

  const buf = await buildXlsx(sheets);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="MKT_OS_Ads_Template_${FILE[kind]}.xlsx"`,
    },
  });
}
