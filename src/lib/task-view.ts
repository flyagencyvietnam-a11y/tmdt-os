/**
 * Hằng số + hàm THUẦN của view danh sách task (client-safe — không import service/DB).
 * Tách riêng vì component client (TaskBoard) cần nhãn view mà không được kéo mã server (nodemailer…) vào bundle trình duyệt.
 */

/** Số ngày task đã xong/huỷ còn nằm trong view làm việc mặc định (cột "Xong" của Kanban chỉ giữ việc xong gần đây). */
export const RECENT_DAYS = 7;
/** View "Ưu tiên": việc mở có hạn trong số ngày tới này (cộng việc đã quá hạn và việc đang làm dở). */
export const FOCUS_DAYS = 14;
/** Gantt / lịch quay chụp: việc đã xong/huỷ quá số ngày này thì ẩn mặc định (xem lại bằng "Hiện cả việc đã xong"). */
export const CLOSED_VISIBLE_DAYS = 30;
/** Quá số ngày này kể từ lúc xong/huỷ thì tự lưu trữ. */
export const ARCHIVE_AFTER_DAYS = 90;
export const PAGE_SIZE = 300;
export const MAX_LIMIT = 3000;

export const TASK_VIEWS = ["focus", "active", "mine", "overdue", "week", "done", "archived", "all"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const TASK_VIEW_LABEL: Record<TaskView, string> = {
  focus: "Ưu tiên",
  active: "Đang làm việc",
  mine: "Của tôi",
  overdue: "Quá hạn",
  week: "Tuần này",
  done: "Đã xong",
  archived: "Lưu trữ",
  all: "Tất cả",
};

export function parseTaskView(v: string | undefined | null): TaskView | null {
  return (TASK_VIEWS as readonly string[]).includes(v ?? "") ? (v as TaskView) : null;
}

/** View mặc định theo vai trò: nhân viên → việc của mình; quản lý/admin → việc cần ưu tiên (trễ hạn, sắp tới, đang làm dở). */
export function defaultTaskView(role: string): TaskView {
  return role === "member" ? "mine" : "focus";
}

export function clampLimit(v: string | number | undefined | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return PAGE_SIZE;
  return Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, Math.round(n)));
}
