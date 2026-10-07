import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { ADS_GROUPS, ADS_GROUP_BY_KEY, type AdsGroupConfig, type AdsGroupKey } from "@/lib/ads-lines";
import { ECOM_PRODUCTS } from "@/lib/ads-metrics";
import { buildXlsx, type XlsxSheetSpec } from "@/lib/export-xlsx";
import { reportWeekBounds, todayVnDayStr } from "@/lib/time";

type Kind = "week" | "month" | "request" | "plan";
const FILE: Record<Kind, string> = { week: "Tuan", month: "Thang", request: "Request", plan: "KeHoach" };

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const mmyyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/**
 * Template import Ads — 4 loại (kế hoạch tháng / hàng tuần / hàng tháng / theo request).
 * Điền sẵn khung (tuần/tháng + danh sách trung tâm/mảng) để nhân sự chỉ việc nhập số;
 * dòng để trống số sẽ bị bỏ qua khi nạp. `?week=dd-mm-yyyy` / `?month=yyyy-mm` đổi kỳ điền sẵn.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { kind } = await params;
  if (kind !== "week" && kind !== "month" && kind !== "request" && kind !== "plan") return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const weekQ = url.searchParams.get("week");
  const monthQ = url.searchParams.get("month");
  // ?group=b2c|ecom|b2b|vmp|osir: chỉ điền sẵn khung cho 1 mảng (gọi từ nút "Nhập Excel" trong tab mảng); không có = mọi mảng.
  const groupQ = url.searchParams.get("group");
  const only: AdsGroupConfig | null = groupQ && groupQ in ADS_GROUP_BY_KEY ? ADS_GROUP_BY_KEY[groupQ as AdsGroupKey] : null;
  const groups = only ? [only] : ADS_GROUPS;
  const today = todayVnDayStr();
  const week = weekQ && /^\d{4}-\d{2}-\d{2}$/.test(weekQ) ? weekQ : reportWeekBounds(today)[0];
  const month = monthQ && /^\d{4}-\d{2}$/.test(monthQ) ? monthQ : today.slice(0, 7);

  const centers = await db.select({ code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")).orderBy(asc(sbus.code));
  const catalog: XlsxSheetSpec = {
    name: "DANH_MUC",
    columns: [
      { header: "sbu_code", key: "sbu_code", width: 12 },
      { header: "Tên trung tâm", key: "sbu_name", width: 28 },
      { header: "line (sheet THANG / TUAN / KE_HOACH / REQUEST)", key: "line", width: 22 },
      { header: "Ý nghĩa line", key: "line_note", width: 44 },
      { header: "product (sheet ECOM_SP)", key: "product", width: 28 },
      { header: "Tên sản phẩm", key: "product_name", width: 34 },
    ],
    rows: Array.from({ length: Math.max(centers.length, ECOM_PRODUCTS.length, 6) }, (_, i) => ({
      sbu_code: centers[i]?.code ?? "",
      sbu_name: centers[i]?.name ?? "",
      ...(kind !== "request"
        ? {
            line: ["b2c_system", "b2c_center", "ecom", "b2b", "osir", "vmp"][i] ?? "",
            line_note:
              [
                "B2C Hệ thống: NS Hệ thống (HO chạy chung) + Lead/HVM TỔNG của cả B2C (Hệ thống + Trung tâm)",
                "B2C Trung tâm: 1 dòng/trung tâm — NS TT order, NS MKT chạy thêm, Lead/HVM quy riêng cho ads TT",
                "Ecom (TMĐT)",
                "B2B",
                "VMT (khảo thí) — gõ osir hoặc vmt",
                "VMP (Du học)",
              ][i] ?? "",
            product: ECOM_PRODUCTS[i]?.key ?? "",
            product_name: ECOM_PRODUCTS[i]?.label ?? "",
          }
        : {}),
    })),
  };

  const sheets: XlsxSheetSpec[] = [];
  // Khung điền sẵn theo mảng: B2C = Hệ thống + từng trung tâm; mảng khác = 1 dòng.
  const frame = (key: (line: string, code: string) => Record<string, string>) =>
    groups.flatMap((g) => (g.key === "b2c" ? [key("b2c_system", ""), ...centers.map((c) => key("b2c_center", c.code))] : [key(g.primaryLine, "")]));

  if (kind === "plan") {
    const m = mmyyyy(month);
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import KẾ HOẠCH ads THÁNG", key: "note", width: 120 }],
        rows: [
          { note: "Mỗi dòng = kế hoạch của 1 (tháng, mảng). month = mm/yyyy. Mặc định đã điền sẵn tháng cần lập và danh sách mảng/trung tâm." },
          { note: "planned_budget = ngân sách kế hoạch (VND). target_* = mục tiêu theo phễu của mảng: leads, new_students (HVM / chuyển đổi), messages, mql, revenue, deals." },
          { note: "B2C: dòng b2c_system = NS Hệ thống + mục tiêu Lead/HVM TỔNG cả B2C; từng trung tâm (b2c_center + sbu_code) CHỈ lập planned_budget — không có mục tiêu riêng." },
          { note: "Cột mục tiêu chỉ dùng được với mảng có chỉ số đó: Ecom dùng target_mql/target_new_students/target_revenue; B2B dùng target_leads/new_students/messages/deals; VMP, VMT dùng target_leads/new_students." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè; muốn đặt về 0 thì nhập 0. Dòng không điền gì sẽ bị bỏ qua. Nạp lại cùng tháng là cập nhật, không tạo trùng. Mọi thay đổi được ghi nhật ký." },
        ],
      },
      {
        name: "KE_HOACH",
        columns: [
          { header: "month*", key: "month", width: 10 },
          { header: "line*", key: "line", width: 14 },
          { header: "sbu_code (chỉ b2c_center)", key: "sbu_code", width: 22 },
          { header: "planned_budget", key: "planned_budget", width: 16 },
          { header: "target_leads", key: "target_leads", width: 14 },
          { header: "target_new_students", key: "target_new_students", width: 20 },
          { header: "target_messages", key: "target_messages", width: 16 },
          { header: "target_mql", key: "target_mql", width: 12 },
          { header: "target_revenue", key: "target_revenue", width: 16 },
          { header: "target_deals", key: "target_deals", width: 14 },
          { header: "notes", key: "notes", width: 30 },
        ],
        rows: frame((line, code) => ({ month: m, line, sbu_code: code })),
      },
      catalog,
    );
  } else if (kind === "week") {
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import Ads HÀNG TUẦN", key: "note", width: 110 }],
        rows: [
          { note: "Tuần tính từ THỨ 7 đến hết Thứ 6. week_start là ngày Thứ 7 đầu tuần (dd/mm/yyyy). Mặc định đã điền sẵn tuần cần nhập. Báo cáo tuần áp dụng cho MỌI mảng." },
          { note: "Mỗi dòng 1 (tuần, mảng). line: b2c_system | b2c_center | ecom | b2b | osir (hoặc vmt) | vmp. B2C: để trống line + sbu_code = Hệ thống; điền sbu_code = Trung tâm (xem DANH_MUC)." },
          { note: "budget = ngân sách tuần (Trung tâm: TT order + P.MKT chạy thêm). Cột còn lại tuỳ mảng: B2C → mess, impression; Ecom → mql, new_students, revenue; B2B → leads, mess, deals; VMP/VMT → leads, new_students." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè. Muốn đặt về 0 thì nhập 0. Dòng không điền số nào sẽ bị bỏ qua. Nạp lại cùng tuần là cập nhật, không tạo trùng." },
        ],
      },
      {
        name: "TUAN",
        columns: [
          { header: "week_start*", key: "week_start", width: 14 },
          { header: "line", key: "line", width: 14 },
          { header: "sbu_code (chỉ b2c_center)", key: "sbu_code", width: 22 },
          { header: "budget", key: "budget", width: 16 },
          { header: "mess", key: "mess", width: 10 },
          { header: "impression", key: "impression", width: 14 },
          { header: "leads", key: "leads", width: 10 },
          { header: "mql", key: "mql", width: 10 },
          { header: "new_students", key: "new_students", width: 14 },
          { header: "revenue", key: "revenue", width: 16 },
          { header: "deals", key: "deals", width: 10 },
        ],
        rows: frame((line, code) => ({ week_start: ddmmyyyy(week), line, sbu_code: code })),
      },
      catalog,
    );
  } else if (kind === "month") {
    const m = mmyyyy(month);
    const monthCols = ["budget", "center_order_budget", "ho_topup_budget", "leads", "new_students", "messages", "mql", "revenue", "actual_revenue", "deals", "center_feedback", "mkt_assessment"];
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import Ads HÀNG THÁNG", key: "note", width: 120 }],
        rows: [
          { note: "Số liệu THÁNG nhập riêng, KHÔNG phải tổng các tuần cộng lại (chu kỳ tính khác nhau). month = mm/yyyy." },
          { note: "Sheet THANG — mỗi dòng 1 (tháng, mảng). line: b2c_system | b2c_center | ecom | b2b | osir | vmp (xem DANH_MUC)." },
          { note: "B2C: dòng b2c_system = NS Hệ thống (budget) + Lead/HVM TỔNG của cả Hệ thống + Trung tâm (không tách). Dòng b2c_center (mỗi trung tâm 1 dòng, bắt buộc sbu_code) = center_order_budget (TT chịu) + ho_topup_budget (P.MKT chạy thêm) + Lead/HVM quy riêng cho ads ngân sách TT (từ T7/2026) — là một PHẦN của số tổng, không cộng thêm." },
          { note: "Cột chỉ dùng cho: center_order_budget/ho_topup_budget/center_feedback/mkt_assessment → b2c_center; mql/revenue/actual_revenue → ecom; messages/deals → b2b; leads → mọi mảng trừ ecom (ecom dùng mql)." },
          { note: "Sheet ECOM_SP — Ecom theo sản phẩm: month_from (+ month_to nếu số gộp nhiều tháng, vd. T6–T7), product (xem DANH_MUC), spend, mql, hv, revenue." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè; muốn đặt về 0 thì nhập 0. Dòng không điền số nào bị bỏ qua. Nạp lại là cập nhật, không tạo trùng." },
        ],
      },
      {
        name: "THANG",
        columns: [
          { header: "month*", key: "month", width: 10 },
          { header: "line*", key: "line", width: 14 },
          { header: "sbu_code (chỉ b2c_center)", key: "sbu_code", width: 22 },
          ...monthCols.map((c) => ({ header: c, key: c, width: c.includes("feedback") || c.includes("assessment") ? 28 : 16 })),
        ],
        rows: [
          { month: m, line: "b2c_system" },
          ...centers.map((c) => ({ month: m, line: "b2c_center", sbu_code: c.code })),
          ...["ecom", "b2b", "osir", "vmp"].map((line) => ({ month: m, line })),
        ],
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
        columns: [{ header: "Hướng dẫn — import Ads THEO REQUEST", key: "note", width: 110 }],
        rows: [
          { note: "Mỗi dòng = 1 request/chiến dịch ads trong 1 tháng. Request của TRUNG TÂM B2C: để trống line (hoặc b2c_center) + sbu_code. Request của mảng khác: line = ecom | b2b | osir (vmt) | vmp, KHÔNG điền sbu_code. Khoá: (month, line/sbu_code, campaign_name) — nạp lại cùng khoá là cập nhật." },
          { note: "spend bắt buộc khi chiến dịch MỚI; chiến dịch đã có thì để trống spend = giữ số cũ. spend_with_vat = chi phí gồm VAT." },
          { note: "planned_budget = ngân sách KẾ HOẠCH của request; runner = người chạy ads (họ tên hoặc email đúng như trong hệ thống). Ô trống = giữ nguyên." },
          { note: "messages = tin nhắn, reach = người tiếp cận, impressions = lượt hiển thị, conversations = cuộc trò chuyện, comments, engagements = lượt tương tác, reactions = cảm xúc." },
          { note: "misa_request_url = link request duyệt chi trên MISA. Nạp xong KHÔNG tự cộng dồn lên số tháng — dùng nút “Cộng dồn vào tháng” ở tab Theo tháng khi cần (tránh ghi đè số đã sửa tay)." },
          { note: "Ví dụ: month 09/2026 | sbu_code VTS | campaign_name Khai giảng IELTS | spend 1500000 | messages 25 | reach 12000" },
        ],
      },
      {
        name: "REQUEST",
        columns: [
          { header: "month*", key: "month", width: 10 },
          { header: "line (trống = TT B2C)", key: "line", width: 18 },
          { header: "sbu_code (chỉ TT B2C)", key: "sbu_code", width: 20 },
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
      catalog,
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
