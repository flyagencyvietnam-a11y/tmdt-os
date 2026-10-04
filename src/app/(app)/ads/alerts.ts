import type { EffectivenessRubric } from "@/lib/ads-metrics";
import {
  aggregate,
  change,
  derive,
  fmtMoney,
  LINE_LABELS,
  LINES,
  monthLabel,
  num,
  prevMonth,
  spendOf,
  weekLabel,
  type DisbursementRow,
  type Line,
  type MetricRow,
  type SbuLite,
} from "./shared";

export type AlertLevel = "crit" | "warn" | "info";

export interface AdsAlert {
  level: AlertLevel;
  title: string;
  detail: string;
  /** Tab nên mở để xem chi tiết. */
  tab: "month" | "week" | "disbursement";
}

/** Ngưỡng cảnh báo — chỉnh ở đây nếu phòng đổi chuẩn theo dõi. */
export const ALERT_THRESHOLDS = {
  /** CPL/CAC tăng hơn mức này so với kỳ trước → cảnh báo. */
  costIncrease: 0.25,
  /** Chi tiêu tuần tăng hơn mức này so với tuần trước → cảnh báo. */
  weeklySpendJump: 0.3,
  /** Giải ngân vượt kế hoạch. */
  overPlan: 1.1,
  /** Tháng đã qua mà giải ngân dưới mức này → cảnh báo chậm giải ngân. */
  underPlan: 0.7,
};

const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

/**
 * Tự rà số liệu Ads và sinh danh sách cảnh báo (đỏ = cần xử lý, vàng = nên xem,
 * xanh = thiếu dữ liệu). Chỉ ĐỌC — không ghi DB, không tự tạo task.
 */
export function computeAdsAlerts({
  metrics,
  sbus,
  plan,
  rubric,
  month,
  currentMonth,
}: {
  metrics: MetricRow[];
  sbus: SbuLite[];
  plan: DisbursementRow[];
  rubric: EffectivenessRubric;
  /** Tháng đang xem. */
  month: string;
  currentMonth: string;
}): AdsAlert[] {
  const out: AdsAlert[] = [];
  const prev = prevMonth(month);
  const monthRows = (line: Line, p: string, sbuId?: string) =>
    metrics.filter((m) => m.periodType === "month" && m.line === line && m.period === p && (sbuId === undefined || m.sbuId === sbuId));

  // --- 1. Trung tâm: hiệu quả, chi mà chưa ra HVM, CPL tăng mạnh ---
  for (const s of sbus) {
    const cur = monthRows("b2c_center", month, s.id);
    if (!cur.length) continue;
    const d = derive(aggregate(cur), "b2c_center", rubric);
    const p = derive(aggregate(monthRows("b2c_center", prev, s.id)), "b2c_center", rubric);
    if (d.spend && d.newStudents === 0) {
      out.push({ level: "crit", tab: "month", title: `${s.code}: chi ${fmtMoney(d.spend)} nhưng chưa có HVM`, detail: `${monthLabel(month)} · ${d.leads ?? 0} lead, 0 học viên mới.` });
    } else if (d.effectivenessLabel === "Kém hiệu quả") {
      out.push({ level: "crit", tab: "month", title: `${s.code}: Kém hiệu quả`, detail: `${monthLabel(month)} · CPL ${fmtMoney(d.cpl)}, CAC ${fmtMoney(d.cac)} (điểm ${d.effectivenessScore}).` });
    } else if (d.effectivenessLabel === "Cần tối ưu") {
      out.push({ level: "warn", tab: "month", title: `${s.code}: Cần tối ưu`, detail: `${monthLabel(month)} · CPL ${fmtMoney(d.cpl)}, CAC ${fmtMoney(d.cac)} (điểm ${d.effectivenessScore}).` });
    }
    const cplUp = change(d.cpl, p.cpl);
    if (cplUp != null && cplUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", title: `${s.code}: CPL tăng ${pct(cplUp)}`, detail: `${fmtMoney(p.cpl)} → ${fmtMoney(d.cpl)} so với ${monthLabel(prev)}.` });
    }
    if (d.spend && d.leads == null) {
      out.push({ level: "info", tab: "month", title: `${s.code}: thiếu số Lead/HVM`, detail: `${monthLabel(month)} đã chi ${fmtMoney(d.spend)} nhưng chưa nhập Lead/HVM — chưa tính được CPL/CAC.` });
    }
  }

  // --- 2. Các mảng còn lại: CPL/CAC tăng mạnh, thiếu số liệu ---
  for (const line of LINES) {
    if (line === "b2c_center") continue;
    const cur = monthRows(line, month);
    if (!cur.length) continue;
    const d = derive(aggregate(cur), line, rubric);
    const p = derive(aggregate(monthRows(line, prev)), line, rubric);
    const cplUp = change(d.cpl, p.cpl);
    if (cplUp != null && cplUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", title: `${LINE_LABELS[line]}: CPL tăng ${pct(cplUp)}`, detail: `${fmtMoney(p.cpl)} → ${fmtMoney(d.cpl)} so với ${monthLabel(prev)}.` });
    }
    const cacUp = change(d.cac, p.cac);
    if (cacUp != null && cacUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", title: `${LINE_LABELS[line]}: CAC tăng ${pct(cacUp)}`, detail: `${fmtMoney(p.cac)} → ${fmtMoney(d.cac)} so với ${monthLabel(prev)}.` });
    }
    if (d.spend && d.leads == null) {
      out.push({ level: "info", tab: "month", title: `${LINE_LABELS[line]}: thiếu số Lead`, detail: `${monthLabel(month)} đã chi ${fmtMoney(d.spend)} nhưng chưa nhập Lead/HVM.` });
    }
  }

  // --- 3. Giải ngân so với kế hoạch ---
  for (const pl of plan.filter((x) => x.period === month)) {
    const planned = num(pl.plannedAmount);
    if (!planned) continue;
    const actual = monthRows(pl.line as Line, month).reduce((s, r) => s + (spendOf(r) ?? 0), 0);
    const ratio = actual / planned;
    const label = LINE_LABELS[pl.line as Line] ?? pl.line;
    if (ratio > ALERT_THRESHOLDS.overPlan) {
      out.push({ level: "crit", tab: "disbursement", title: `${label}: vượt kế hoạch giải ngân (${Math.round(ratio * 100)}%)`, detail: `Thực tế ${fmtMoney(actual)} / KH ${fmtMoney(planned)} trong ${monthLabel(month)}.` });
    } else if (month < currentMonth && ratio < ALERT_THRESHOLDS.underPlan) {
      out.push({ level: "warn", tab: "disbursement", title: `${label}: giải ngân chậm (${Math.round(ratio * 100)}%)`, detail: `${monthLabel(month)} đã kết thúc, thực tế ${fmtMoney(actual)} / KH ${fmtMoney(planned)}.` });
    }
  }

  // --- 4. Tuần gần nhất so với tuần trước (Mục 1 + Mục 2) ---
  const weeks = [...new Set(metrics.filter((m) => m.periodType === "week").map((m) => m.period))].sort();
  if (weeks.length >= 2) {
    const w = weeks[weeks.length - 1];
    const pw = weeks[weeks.length - 2];
    const wk = (p: string) => metrics.filter((m) => m.periodType === "week" && m.period === p);
    const cur = derive(aggregate(wk(w)), "b2c_system");
    const prv = derive(aggregate(wk(pw)), "b2c_system");
    const spendUp = change(cur.spend, prv.spend);
    if (spendUp != null && spendUp > ALERT_THRESHOLDS.weeklySpendJump) {
      out.push({ level: "warn", tab: "week", title: `Chi tiêu tuần tăng ${pct(spendUp)}`, detail: `Tuần ${weekLabel(w)}: ${fmtMoney(cur.spend)} (tuần trước ${fmtMoney(prv.spend)}).` });
    }
    const cpmUp = change(cur.costPerMess, prv.costPerMess);
    if (cpmUp != null && cpmUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "week", title: `Chi phí / Mess tăng ${pct(cpmUp)}`, detail: `Tuần ${weekLabel(w)}: ${fmtMoney(cur.costPerMess)}/mess (tuần trước ${fmtMoney(prv.costPerMess)}).` });
    }
    for (const s of sbus) {
      const r = wk(w).find((m) => m.sbuId === s.id);
      if (r && (spendOf(r) ?? 0) > 0 && !num(r.messages)) {
        out.push({ level: "warn", tab: "week", title: `${s.code}: có chi tiêu nhưng 0 mess`, detail: `Tuần ${weekLabel(w)} chi ${fmtMoney(spendOf(r))}.` });
      }
    }
  }

  const rank: Record<AlertLevel, number> = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
