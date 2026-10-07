/**
 * "Sức khoẻ" của 1 hạng mục giám sát — thuần (client-safe), dùng chung cho trang /giam-sat
 * (tô đỏ + liệt kê việc cần xử lý) và cho badge menu (đếm điểm nóng theo từng tài khoản).
 * Đừng viết lại các điều kiện này ở nơi khác.
 */

export type MonitoringAlertKind = "overdue" | "due_soon" | "ok" | "no_data";

export type MonitoringIssue =
  | "overdue" // quá chu kỳ chưa cập nhật/thay mới
  | "never_checked" // chưa từng rà soát (chưa có ngày cập nhật)
  | "no_photo" // thiếu ảnh thực tế
  | "no_link" // Google Maps: thiếu link điểm
  | "no_state" // thiếu "hiện trạng đang hiển thị"
  | "no_quantity"; // chưa kiểm kê số lượng

export const ISSUE_LABELS: Record<MonitoringIssue, string> = {
  overdue: "Quá hạn cập nhật",
  never_checked: "Chưa rà soát lần nào",
  no_photo: "Thiếu ảnh thực tế",
  no_link: "Thiếu link Google Maps",
  no_state: "Thiếu hiện trạng",
  no_quantity: "Chưa kiểm kê số lượng",
};

/** Các loại hạng mục vật lý cần có số lượng kiểm kê. */
const QUANTITY_KINDS = new Set(["posm", "signage", "ooh"]);

/** Nhóm "thiếu thông tin/ảnh" (khác với nhóm trễ lịch rà soát). */
export const INCOMPLETE_ISSUES: MonitoringIssue[] = ["no_photo", "no_link", "no_state", "no_quantity"];

export interface HealthInput {
  kind: string;
  alert: MonitoringAlertKind;
  currentStateNote: string | null;
  /** Với Google Maps: link điểm. Loại khác: không dùng. */
  photoUrl: string | null;
  quantity: number | null;
}

export function monitoringIssues(item: HealthInput, photoCount: number): MonitoringIssue[] {
  const out: MonitoringIssue[] = [];
  if (item.alert === "overdue") out.push("overdue");
  if (item.alert === "no_data") out.push("never_checked");
  if (item.kind === "google_maps") {
    if (!item.photoUrl?.trim()) out.push("no_link");
  } else if (photoCount === 0) out.push("no_photo");
  if (!item.currentStateNote?.trim()) out.push("no_state");
  if (QUANTITY_KINDS.has(item.kind) && item.quantity == null) out.push("no_quantity");
  return out;
}

export function isIncomplete(issues: MonitoringIssue[]): boolean {
  return issues.some((i) => INCOMPLETE_ISSUES.includes(i));
}
