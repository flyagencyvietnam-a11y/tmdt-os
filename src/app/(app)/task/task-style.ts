/**
 * Màu/biểu tượng cảnh báo dùng CHUNG cho mọi nơi hiện task (bảng, Kanban, lịch, danh sách "Việc của tôi"):
 *  - Trễ hạn  → đỏ toàn dòng/toàn thẻ (cảnh báo mạnh nhất, ưu tiên hơn màu việc lặp).
 *  - Việc lặp → màu tím riêng + biểu tượng lặp.
 * Logic "trễ hạn" khớp `isOverdue()` ở lib/services/tasks.ts (hạn < hôm nay và chưa xong/huỷ).
 */
export type TaskTone = "overdue" | "recurring" | "normal";

interface ToneInput {
  dueDate: string | null;
  status: string;
  sourceType?: string | null;
}

export function isTaskOverdue(t: Pick<ToneInput, "dueDate" | "status">, today: string): boolean {
  return !!t.dueDate && t.dueDate < today && t.status !== "done" && t.status !== "cancelled";
}

export function isTaskRecurring(t: Pick<ToneInput, "sourceType">): boolean {
  return t.sourceType === "recurring";
}

export function taskTone(t: ToneInput, today: string): TaskTone {
  if (isTaskOverdue(t, today)) return "overdue";
  if (isTaskRecurring(t)) return "recurring";
  return "normal";
}

/** Class cho cả dòng bảng. */
export const ROW_TONE_CLASS: Record<TaskTone, string | undefined> = {
  overdue: "bg-red-100 text-red-950 shadow-[inset_3px_0_0_var(--color-red-500)] hover:bg-red-200/70 dark:bg-red-500/20 dark:text-red-50 dark:hover:bg-red-500/30",
  recurring: "bg-violet-50 shadow-[inset_3px_0_0_var(--color-violet-400)] hover:bg-violet-100/70 dark:bg-violet-500/10 dark:hover:bg-violet-500/20",
  normal: undefined,
};

/** Class cho thẻ Kanban. */
export const CARD_TONE_CLASS: Record<TaskTone, string> = {
  overdue: "border-red-300 bg-red-100 text-red-950 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-50",
  recurring: "border-violet-200 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10",
  normal: "bg-card",
};

/** Màu sự kiện trên lịch (react-big-calendar dùng hex). */
export const EVENT_TONE_COLOR: Record<Exclude<TaskTone, "normal">, string> = {
  overdue: "#b91c1c",
  recurring: "#7c3aed",
};
