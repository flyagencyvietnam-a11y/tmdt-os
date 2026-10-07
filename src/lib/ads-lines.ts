/**
 * CẤU HÌNH MẢNG ads — nơi DUY NHẤT khai báo khác biệt giữa các mảng (SPEC Phụ lục D mục 21).
 * Mọi mảng dùng chung 1 luồng: Kế hoạch tháng → Request → Báo cáo tuần → Báo cáo tháng; mảng chỉ khác ở
 * phễu của mình (Lead/MQL, HVM, Mess, doanh thu, deal). Thêm mảng/chỉ số mới = thêm 1 dòng ở đây.
 * Thuần (client-safe), không đụng DB.
 */

/** Giá trị enum `ads_line` lưu trong DB. */
export type AdsLine = "b2c_system" | "b2c_center" | "ecom" | "b2b" | "osir" | "vmp";

/** Tab lớn trên giao diện. B2C gộp 2 line DB (Hệ thống + Trung tâm); các mảng còn lại 1 line. */
export type AdsGroupKey = "b2c" | "ecom" | "b2b" | "osir" | "vmp";

/** Các chỉ số phễu có thể đặt mục tiêu / báo cáo theo tuần. Khoá trùng cột `ads_metrics`. */
export type FunnelField = "leads" | "mql" | "messages" | "newStudents" | "revenue" | "deals";

/** Cột mục tiêu tương ứng ở `ads_plans`. */
export const PLAN_TARGET_COLUMN = {
  leads: "targetLeads",
  mql: "targetMql",
  messages: "targetMessages",
  newStudents: "targetNewStudents",
  revenue: "targetRevenue",
  deals: "targetDeals",
} as const satisfies Record<FunnelField, string>;

export type PlanTargetColumn = (typeof PLAN_TARGET_COLUMN)[FunnelField];

export interface FunnelDef {
  field: FunnelField;
  label: string;
  /** "money" hiển thị tiền rút gọn, "count" hiển thị số nguyên. */
  kind: "count" | "money";
}

export interface AdsGroupConfig {
  key: AdsGroupKey;
  label: string;
  /** Biến màu nhận diện cố định (--series-N). */
  color: string;
  /** Các line DB thuộc mảng. */
  lines: AdsLine[];
  /** Line mang số "cả mảng" (B2C: dòng Hệ thống mang Lead/HVM tổng và mục tiêu tổng). */
  primaryLine: AdsLine;
  /** Phễu của mảng, theo thứ tự hiển thị. */
  funnel: FunnelDef[];
  /** Chỉ số "đầu phễu" dùng tính chi phí đầu vào (CPL; Ecom là MQL → CP/MQL). */
  leadField: "leads" | "mql";
  /** Nhãn chuyển đổi cuối phễu (HVM / HV ghi danh thi / HS đăng ký DV…). */
  conversionLabel: string;
  /** Chỉ số nhập theo TUẦN ngoài ngân sách (báo cáo tuần mở cho mọi mảng). */
  weeklyFields: FunnelField[];
  /**
   * Có BẮT BUỘC báo tuần không — chỉ dùng để cảnh báo "thiếu số liệu tuần". Mặc định chỉ B2C (đã có quy trình);
   * mảng khác vẫn nhập tuần được nhưng không bị coi là thiếu. Đổi thành true khi phòng thống nhất.
   */
  expectWeekly: boolean;
}

const LEADS: FunnelDef = { field: "leads", label: "Lead / Data", kind: "count" };
const MQL: FunnelDef = { field: "mql", label: "MQL", kind: "count" };
const MESS: FunnelDef = { field: "messages", label: "Mess", kind: "count" };
const REVENUE: FunnelDef = { field: "revenue", label: "Doanh thu", kind: "money" };
const DEALS: FunnelDef = { field: "deals", label: "Deal chốt", kind: "count" };
const conv = (label: string): FunnelDef => ({ field: "newStudents", label, kind: "count" });

export const ADS_GROUPS: AdsGroupConfig[] = [
  {
    key: "b2c",
    label: "B2C",
    color: "var(--series-1)",
    lines: ["b2c_system", "b2c_center"],
    primaryLine: "b2c_system",
    funnel: [LEADS, conv("HVM"), MESS],
    leadField: "leads",
    conversionLabel: "HVM",
    weeklyFields: ["messages"],
    expectWeekly: true,
  },
  {
    key: "ecom",
    label: "Ecom (TMĐT)",
    color: "var(--series-3)",
    lines: ["ecom"],
    primaryLine: "ecom",
    funnel: [MQL, conv("HVM online"), REVENUE],
    leadField: "mql",
    conversionLabel: "HVM online",
    weeklyFields: ["mql", "newStudents", "revenue"],
    expectWeekly: false,
  },
  {
    key: "b2b",
    label: "B2B",
    color: "var(--series-4)",
    lines: ["b2b"],
    primaryLine: "b2b",
    funnel: [LEADS, conv("HVM"), MESS, DEALS],
    leadField: "leads",
    conversionLabel: "HVM",
    weeklyFields: ["leads", "messages", "deals"],
    expectWeekly: false,
  },
  {
    key: "vmp",
    label: "VMP (Du học)",
    color: "var(--series-6)",
    lines: ["vmp"],
    primaryLine: "vmp",
    funnel: [LEADS, conv("HS đăng ký DV")],
    leadField: "leads",
    conversionLabel: "HS đăng ký DV",
    weeklyFields: ["leads", "newStudents"],
    expectWeekly: false,
  },
  {
    // VMT (khảo thí) = tên hiển thị mới của mảng OSIR; giá trị lưu DB vẫn là `osir`.
    key: "osir",
    label: "VMT (khảo thí)",
    color: "var(--series-5)",
    lines: ["osir"],
    primaryLine: "osir",
    funnel: [LEADS, conv("HV ghi danh thi")],
    leadField: "leads",
    conversionLabel: "HV ghi danh thi",
    weeklyFields: ["leads", "newStudents"],
    expectWeekly: false,
  },
];

export const ADS_GROUP_BY_KEY = Object.fromEntries(ADS_GROUPS.map((g) => [g.key, g])) as Record<AdsGroupKey, AdsGroupConfig>;

export function groupOfLine(line: AdsLine): AdsGroupConfig {
  return ADS_GROUPS.find((g) => g.lines.includes(line)) ?? ADS_GROUPS[0];
}

/** Định nghĩa chỉ số phễu của 1 mảng theo khoá. */
export function funnelDef(group: AdsGroupConfig, field: FunnelField): FunnelDef | undefined {
  return group.funnel.find((f) => f.field === field);
}
