/**
 * Ma trận phân quyền — SPEC Mục 3.2. Thực thi ở tầng service (không chỉ ẩn UI).
 * "scope" = 'all' (mọi bản ghi) | 'own' (chỉ bản ghi của mình) | 'sbu' (chỉ SBU của mình).
 * Thiếu key = không có quyền.
 */

export type Role = "admin" | "manager" | "member" | "center_contributor" | "viewer";
export type Action = "create" | "read" | "update" | "delete";
export type Scope = "all" | "own" | "sbu";

export type Resource =
  | "task" // CRUD task nói chung
  | "task.assignOthers" // giao task cho người khác
  | "campaign"
  | "foundation"
  | "brandKit" // chỉ xem Brand Kit + chủ đề tháng (center_contributor)
  | "request"
  | "recurringRule"
  | "sbu"
  | "workloadReport"
  | "importData"
  | "userManagement"
  | "content" // Content calendar (Mục 9.6)
  | "media" // Media production plan (Mục 9.7)
  | "monitoring" // Monitoring hạng mục thay mới (Mục 9.5)
  | "ads" // Growth Performance (trước đây là Ads) — Mục 9.4
  | "brandPerformance" // Brand Performance — chỉ số thương hiệu hằng tháng theo brand × kênh
  | "managementDashboard" // Dashboard quản lý (Mục 12.2)
  | "aiAssist"; // Trợ lý AI (Mục 14.4)

type RoleMatrix = Partial<Record<Resource, Partial<Record<Action, Scope>>>>;

const ALL: Record<Action, Scope> = {
  create: "all",
  read: "all",
  update: "all",
  delete: "all",
};

export const PERMISSIONS: Record<Role, RoleMatrix> = {
  admin: {
    task: ALL,
    "task.assignOthers": { update: "all" },
    campaign: ALL,
    foundation: ALL,
    brandKit: { read: "all" },
    request: ALL,
    recurringRule: ALL,
    sbu: ALL,
    workloadReport: { read: "all" },
    importData: { create: "all", read: "all" },
    userManagement: ALL,
    content: ALL,
    media: ALL,
    monitoring: ALL,
    ads: ALL,
    brandPerformance: ALL,
    managementDashboard: { read: "all" },
    aiAssist: { read: "all", create: "all" },
  },

  manager: {
    task: ALL,
    "task.assignOthers": { update: "all" },
    campaign: ALL,
    foundation: ALL,
    brandKit: { read: "all" },
    request: ALL,
    recurringRule: ALL,
    sbu: ALL,
    workloadReport: { read: "all" },
    importData: { create: "all", read: "all" },
    content: ALL,
    media: ALL,
    monitoring: ALL,
    ads: ALL,
    brandPerformance: ALL,
    managementDashboard: { read: "all" },
    aiAssist: { read: "all", create: "all" },
    // không userManagement, không xóa dữ liệu gốc (Mục 3.1)
  },

  // Nhân sự Marketing HO là người làm việc hằng ngày → có quyền vận hành đầy đủ trên plan/số liệu của phòng
  // (xoá là xoá mềm, khôi phục được). Chỉ KHÔNG có: quản lý người dùng, cài đặt hệ thống, nạp người dùng/SBU.
  // Giao task cho người khác vẫn cần cờ can_assign (kiểm tra riêng).
  member: {
    task: { create: "all", read: "all", update: "all", delete: "all" },
    campaign: ALL,
    foundation: { create: "all", read: "all", update: "all" },
    brandKit: { read: "all" },
    request: { create: "all", read: "all", update: "all" },
    recurringRule: { create: "own", read: "all" },
    sbu: { read: "all" },
    workloadReport: { read: "all" },
    importData: { create: "all", read: "all" },
    content: ALL,
    media: ALL,
    monitoring: ALL,
    ads: ALL,
    brandPerformance: ALL,
    managementDashboard: { read: "all" },
    aiAssist: { read: "all", create: "all" },
  },

  center_contributor: {
    // Chỉ task/SBU thuộc trung tâm của chính mình (lọc theo users.sbu_id ở service).
    task: { read: "sbu", update: "sbu" },
    brandKit: { read: "all" },
    request: { create: "all", read: "sbu" },
    sbu: { read: "sbu" },
  },

  viewer: {
    campaign: { read: "all" },
    brandPerformance: { read: "all" },
    ads: { read: "all" },
    sbu: { read: "all" },
    workloadReport: { read: "all" },
    managementDashboard: { read: "all" },
  },
};

/** Trả về scope quyền hoặc false nếu không có quyền. */
export function permission(role: Role, resource: Resource, action: Action): Scope | false {
  return PERMISSIONS[role]?.[resource]?.[action] ?? false;
}

/**
 * Kiểm tra quyền cụ thể trên một bản ghi.
 * `ownerIds` = user id gắn với bản ghi (assignee, creator...).
 * `sbuMatch` = bản ghi có thuộc SBU của người thao tác không (cho scope 'sbu').
 */
export function can(
  role: Role,
  resource: Resource,
  action: Action,
  ctx?: { userId?: string; ownerIds?: (string | null | undefined)[]; sbuMatch?: boolean },
): boolean {
  const scope = permission(role, resource, action);
  if (!scope) return false;
  if (scope === "all") return true;
  if (scope === "own") {
    if (!ctx?.userId || !ctx.ownerIds) return false;
    return ctx.ownerIds.some((id) => id === ctx.userId);
  }
  // scope === 'sbu'
  return ctx?.sbuMatch === true;
}

/** Có bất kỳ quyền đọc nào trên resource không (để hiện/ẩn menu). */
export function canSee(role: Role, resource: Resource): boolean {
  return permission(role, resource, "read") !== false;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Trưởng phòng Marketing",
  manager: "Phó phòng / trưởng nhóm",
  member: "Nhân sự Marketing HO",
  center_contributor: "Đầu mối Marketing trung tâm",
  viewer: "Ban Giám đốc / Khối",
};

/** Nhóm "nhân sự Marketing HO": admin + manager + member. Dùng cho mọi kiểm tra quyền vận hành ở server action/trang. */
export function isStaff(role: Role): boolean {
  return role === "admin" || role === "manager" || role === "member";
}

/** admin + manager — việc mang tính quản trị (xác nhận nạp dữ liệu hàng loạt, chạy cảnh báo…). */
export function isManagerLike(role: Role): boolean {
  return role === "admin" || role === "manager";
}
