/**
 * Tiến độ KẾ HOẠCH ads — thuần, client-safe. Mọi con số "đã dùng bao nhiêu %", "dự báo cuối tháng",
 * "đạt bao nhiêu % mục tiêu" đều SUY RA tại chỗ từ kế hoạch + thực tế, không lưu cột (cùng nguyên tắc `overdue`).
 */
import { addDaysStr, diffDaysStr, monthBounds } from "@/lib/time";
import type { FunnelField } from "./ads-lines";

/** Phần tháng đã trôi qua, 0..1. Tháng đã qua = 1, chưa tới = 0; ngày hôm nay tính là đã trôi. */
export function monthElapsed(month: string, today: string): number {
  const [first, last] = monthBounds(`${month}-01`);
  const total = diffDaysStr(first, last) + 1;
  if (today < first) return 0;
  if (today > last) return 1;
  return (diffDaysStr(first, today) + 1) / total;
}

export type BudgetStatus =
  /** Chưa lập kế hoạch ngân sách cho tháng. */
  | "no_plan"
  /** Chưa có số thực tế nào. */
  | "no_actual"
  | "on_track"
  /** Đang đi nhanh hơn kế hoạch: dự báo cuối tháng vượt KH > 10%. */
  | "fast"
  /** Đã vượt ngân sách kế hoạch. */
  | "over"
  /** Đi chậm: dự báo cuối tháng < 70% KH (chỉ xét khi tháng đã qua quá nửa). */
  | "slow";

export const PLAN_THRESHOLDS = {
  /** Dự báo vượt KH hơn mức này → "fast". */
  forecastOver: 1.1,
  /** Dự báo thấp hơn mức này → "slow". */
  forecastUnder: 0.7,
  /** Chỉ cảnh báo "slow" khi tháng đã trôi qua quá mức này. */
  slowAfterElapsed: 0.5,
  /** Mục tiêu "đang chậm" nếu % đạt < % thời gian × hệ số này. */
  targetPaceFactor: 0.8,
};

export interface BudgetProgress {
  planned: number | null;
  actual: number | null;
  /** Thực tế ÷ kế hoạch. */
  used: number | null;
  /** Phần tháng đã trôi qua. */
  elapsed: number;
  /** Dự báo chi cuối tháng theo tốc độ hiện tại (tháng đã qua = thực tế). */
  forecast: number | null;
  status: BudgetStatus;
}

export function budgetProgress(planned: number | null, actual: number | null, month: string, today: string): BudgetProgress {
  const elapsed = monthElapsed(month, today);
  const forecast = actual == null ? null : elapsed >= 1 ? actual : elapsed > 0.05 ? actual / elapsed : null;
  const used = planned && actual != null ? actual / planned : null;
  let status: BudgetStatus;
  if (!planned) status = "no_plan";
  else if (actual == null) status = "no_actual";
  else if (actual > planned) status = "over";
  else if (forecast != null && forecast > planned * PLAN_THRESHOLDS.forecastOver) status = "fast";
  else if (forecast != null && elapsed > PLAN_THRESHOLDS.slowAfterElapsed && forecast < planned * PLAN_THRESHOLDS.forecastUnder) status = "slow";
  else status = "on_track";
  return { planned, actual, used, elapsed, forecast, status };
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  no_plan: "Chưa lập kế hoạch",
  no_actual: "Chưa có số thực tế",
  on_track: "Đúng tiến độ",
  fast: "Đang đi nhanh",
  over: "Vượt kế hoạch",
  slow: "Đi chậm",
};

export type TargetStatus = "no_target" | "no_actual" | "achieved" | "on_pace" | "behind";

export interface TargetProgress {
  field: FunnelField;
  target: number | null;
  actual: number | null;
  /** Thực tế ÷ mục tiêu. */
  pct: number | null;
  status: TargetStatus;
}

export function targetProgress(field: FunnelField, target: number | null, actual: number | null, elapsed: number): TargetProgress {
  const pct = target && actual != null ? actual / target : null;
  let status: TargetStatus;
  if (!target) status = "no_target";
  else if (actual == null) status = "no_actual";
  else if (actual >= target) status = "achieved";
  else if (elapsed >= 1) status = "behind";
  else status = actual / target >= elapsed * PLAN_THRESHOLDS.targetPaceFactor ? "on_pace" : "behind";
  return { field, target, actual, pct, status };
}

/** Chi phí kế hoạch đơn vị (CPL/CAC kế hoạch) = ngân sách KH ÷ mục tiêu; null nếu thiếu 1 trong 2. */
export function plannedUnitCost(plannedBudget: number | null, target: number | null): number | null {
  return plannedBudget && target ? Math.round(plannedBudget / target) : null;
}

/** Các tuần (Thứ 7 bắt đầu) có ngày nằm trong tháng `month` — xếp số tuần vào tháng khi xem tiến độ. */
export function weeksOfMonth(month: string, weeks: string[]): string[] {
  const [first, last] = monthBounds(`${month}-01`);
  return weeks.filter((w) => w >= addDaysStr(first, -6) && w <= last).sort();
}
