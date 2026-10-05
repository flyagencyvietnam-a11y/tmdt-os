import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { ECOM_PRODUCTS } from "@/lib/ads-metrics";
import { buildXlsx, type XlsxSheetSpec } from "@/lib/export-xlsx";
import { reportWeekBounds, todayVnDayStr } from "@/lib/time";

type Kind = "week" | "month" | "request";
const FILE: Record<Kind, string> = { week: "Tuan", month: "Thang", request: "Request" };

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const mmyyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/**
 * Template import Ads — 3 loại cập nhật (hàng tuần / hàng tháng / theo request).
 * Điền sẵn khung (tuần/tháng + danh sách trung tâm/mảng) để nhân sự chỉ việc nhập số;
 * dòng để trống số sẽ bị bỏ qua khi nạp. `?week=dd-mm-yyyy` / `?month=yyyy-mm` đổi kỳ điền sẵn.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { kind } = await params;
  if (kind !== "week" && kind !== "month" && kind !== "request") return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const weekQ = url.searchParams.get("week");
  const monthQ = url.searchParams.get("month");
  const today = todayVnDayStr();
  const week = weekQ && /^\d{4}-\d{2}-\d{2}$/.test(weekQ) ? weekQ : reportWeekBounds(today)[0];
  const month = monthQ && /^\d{4}-\d{2}$/.test(monthQ) ? monthQ : today.slice(0, 7);

  const centers = await db.select({ code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.kind, "center")).orderBy(asc(sbus.code));
  const catalog: XlsxSheetSpec = {
    name: "DANH_MUC",
    columns: [
      { header: "sbu_code", key: "sbu_code", width: 12 },
      { header: "Tên trung tâm", key: "sbu_name", width: 28 },
      { header: "line (sheet THANG)", key: "line", width: 22 },
      { header: "Ý nghĩa line", key: "line_note", width: 44 },
      { header: "product (sheet ECOM_SP)", key: "product", width: 28 },
      { header: "Tên sản phẩm", key: "product_name", width: 34 },
    ],
    rows: Array.from({ length: Math.max(centers.length, ECOM_PRODUCTS.length, 6) }, (_, i) => ({
      sbu_code: centers[i]?.code ?? "",
      sbu_name: centers[i]?.name ?? "",
      ...(kind === "month"
        ? {
            line: ["b2c_system", "b2c_center", "ecom", "b2b", "osir", "vmp"][i] ?? "",
            line_note:
              [
                "B2C Hệ thống: NS Hệ thống (HO chạy chung) + Lead/HVM TỔNG của cả B2C (Hệ thống + Trung tâm)",
                "B2C Trung tâm: 1 dòng/trung tâm — NS TT order, NS MKT chạy thêm, Lead/HVM quy riêng cho ads TT",
                "Ecom (TMĐT)",
                "B2B",
                "OSIR",
                "VMP (Du học)",
              ][i] ?? "",
            product: ECOM_PRODUCTS[i]?.key ?? "",
            product_name: ECOM_PRODUCTS[i]?.label ?? "",
          }
        : {}),
    })),
  };

  const sheets: XlsxSheetSpec[] = [];
  if (kind === "week") {
    sheets.push(
      {
        name: "HUONG_DAN",
        columns: [{ header: "Hướng dẫn — import Ads HÀNG TUẦN", key: "note", width: 110 }],
        rows: [
          { note: "Tuần tính từ THỨ 7 đến hết Thứ 6. week_start là ngày Thứ 7 đầu tuần (dd/mm/yyyy). Mặc định đã điền sẵn tuần cần nhập." },
          { note: "Mỗi dòng 1 đối tượng: để trống sbu_code = Mục 1 Hệ thống (P.MKT chạy chung); điền sbu_code = Trung tâm (xem sheet DANH_MUC)." },
          { note: "budget = ngân sách tuần (Trung tâm: TT order + P.MKT chạy thêm). mess = số tin nhắn/inquiry inbound. impression = lượt hiển thị." },
          { note: "Ô để TRỐNG = giữ nguyên số cũ; ô có số = ghi đè. Muốn đặt về 0 thì nhập 0. Dòng không điền số nào sẽ bị bỏ qua." },
          { note: "Nạp lại cùng tuần là cập nhật, không tạo trùng." },
        ],
      },
      {
        name: "TUAN",
        columns: [
          { header: "week_start*", key: "week_start", width: 14 },
          { header: "sbu_code (trống = Hệ thống)", key: "sbu_code", width: 22 },
          { header: "budget", key: "budget", width: 16 },
          { header: "mess", key: "mess", width: 10 },
          { header: "impression", key: "impression", width: 14 },
        ],
        rows: [{ week_start: ddmmyyyy(week), sbu_code: "" }, ...centers.map((c) => ({ week_start: ddmmyyyy(week), sbu_code: c.code }))],
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
          { note: "Mỗi dòng = 1 chiến dịch Facebook của 1 trung tâm trong 1 tháng (file báo cáo ads TT). Khoá: (month, sbu_code, campaign_name) — nạp lại cùng khoá là cập nhật." },
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
          { header: "sbu_code*", key: "sbu_code", width: 12 },
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
