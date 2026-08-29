/**
 * Ma trận phân quyền — SPEC Mục 3.2, có điều chỉnh theo quyết định dự án:
 *  - QĐ04: EC được Create/Read/Update MỌI lead (không giới hạn `own`), không Delete.
 *  - QĐ03 / 3.3(c): MARKETING KHÔNG được sửa stage/outcome của lead (xung đột lợi ích
 *    với chính chỉ số CPMQL mà họ bị đánh giá).
 *  - 3.3(b): VIEWER không xem thông tin liên hệ khách hàng.
 *
 * "scope" = 'all' (mọi bản ghi) | 'own' (chỉ bản ghi của mình). Thiếu key = không có quyền.
 */

export type Role = "ADMIN" | "MANAGER" | "MARKETING" | "EC" | "VIEWER";
export type Action = "create" | "read" | "update" | "delete";
export type Scope = "all" | "own";

export type Resource =
  | "lead" // danh sách lead + tạo/sửa
  | "lead.contactInfo" // xem SĐT / email
  | "lead.revenue" // tạo/sửa enrollment (doanh thu)
  | "lead.revenueTotal" // chỉ xem con số tổng doanh thu
  | "lead.reassign" // phân công lại
  | "lead.statusChange" // đổi stage / outcome
  | "leadInteraction" // nhật ký chăm sóc
  | "campaign"
  | "campaignDailyMetric"
  | "taskPersonal"
  | "taskAssignOthers"
  | "kpiManage" // thiết lập / giao chỉ tiêu
  | "kpiResults" // xem kết quả
  | "saleEnablement"
  | "auditLog"
  | "periodLock" // khóa / mở sổ kỳ
  | "userManagement";

type RoleMatrix = Partial<Record<Resource, Partial<Record<Action, Scope>>>>;

const ALL: Record<Action, Scope> = {
  create: "all",
  read: "all",
  update: "all",
  delete: "all",
};

export const PERMISSIONS: Record<Role, RoleMatrix> = {
  ADMIN: {
    lead: ALL,
    "lead.contactInfo": { read: "all" },
    "lead.revenue": ALL,
    "lead.revenueTotal": { read: "all" },
    "lead.reassign": { update: "all" },
    "lead.statusChange": { update: "all" },
    leadInteraction: { create: "all", read: "all" },
    campaign: ALL,
    campaignDailyMetric: ALL,
    taskPersonal: ALL,
    taskAssignOthers: ALL,
    kpiManage: ALL,
    kpiResults: { read: "all" },
    saleEnablement: ALL,
    auditLog: { read: "all" },
    periodLock: { update: "all" },
    userManagement: ALL,
  },

  MANAGER: {
    lead: ALL,
    "lead.contactInfo": { read: "all" },
    "lead.revenue": ALL,
    "lead.revenueTotal": { read: "all" },
    "lead.reassign": { update: "all" },
    "lead.statusChange": { update: "all" },
    leadInteraction: { create: "all", read: "all" },
    campaign: ALL,
    campaignDailyMetric: ALL,
    taskPersonal: ALL,
    taskAssignOthers: ALL,
    kpiManage: { create: "all", read: "all", update: "all" }, // không delete
    kpiResults: { read: "all" },
    saleEnablement: ALL,
    auditLog: { read: "all" },
    // periodLock: không (chỉ ADMIN khóa/mở sổ — SPEC 3.2)
  },

  MARKETING: {
    lead: { read: "all" }, // xem, KHÔNG sửa
    // KHÔNG lead.contactInfo (SPEC 3.2: MARKETING không xem SĐT/email)
    "lead.revenueTotal": { read: "all" },
    // KHÔNG lead.statusChange (QĐ03)
    leadInteraction: { read: "all" },
    campaign: { create: "all", read: "all", update: "all" },
    campaignDailyMetric: { create: "all", read: "all", update: "all" },
    taskPersonal: { create: "own", read: "own", update: "own" },
    kpiResults: { read: "own" },
    saleEnablement: { create: "all", read: "all", update: "all" },
  },

  EC: {
    // QĐ04: mọi lead, không chỉ own. Không delete.
    lead: { create: "all", read: "all", update: "all" },
    "lead.contactInfo": { read: "all" },
    "lead.revenue": { create: "all", read: "all", update: "all" },
    "lead.revenueTotal": { read: "all" },
    "lead.statusChange": { update: "all" },
    leadInteraction: { create: "own", read: "all" },
    campaign: { read: "all" },
    campaignDailyMetric: { read: "all" },
    taskPersonal: { create: "own", read: "own", update: "own" },
    kpiResults: { read: "own" },
    saleEnablement: { read: "all" },
  },

  VIEWER: {
    // Chỉ dashboard & báo cáo tổng hợp. Không lead, không contact info.
    "lead.revenueTotal": { read: "all" },
    kpiResults: { read: "all" }, // chỉ tổng — tầng UI lọc thêm
    campaign: { read: "all" },
    saleEnablement: { read: "all" },
  },
};

/** Trả về scope quyền ('all' | 'own') hoặc false nếu không có quyền. */
export function permission(
  role: Role,
  resource: Resource,
  action: Action,
): Scope | false {
  return PERMISSIONS[role]?.[resource]?.[action] ?? false;
}

/**
 * Kiểm tra quyền cụ thể trên một bản ghi. `ownerIds` = danh sách user id gắn với
 * bản ghi (ví dụ assigned_to, created_by). `userId` = người đang thao tác.
 */
export function can(
  role: Role,
  resource: Resource,
  action: Action,
  ctx?: { userId?: string; ownerIds?: (string | null | undefined)[] },
): boolean {
  const scope = permission(role, resource, action);
  if (!scope) return false;
  if (scope === "all") return true;
  // scope === 'own'
  if (!ctx?.userId || !ctx.ownerIds) return false;
  return ctx.ownerIds.some((id) => id === ctx.userId);
}

/** Có bất kỳ quyền đọc nào trên resource không (để hiện/ẩn menu). */
export function canSee(role: Role, resource: Resource): boolean {
  return permission(role, resource, "read") !== false;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Trưởng phòng Marketing, TMĐT & CRM",
  MANAGER: "Phó phòng / người được ủy quyền",
  MARKETING: "Marketing Executive",
  EC: "E-Commerce Executive",
  VIEWER: "Ban Giám đốc / Khối R&D",
};
