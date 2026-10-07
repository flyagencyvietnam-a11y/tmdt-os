import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { ADS_GROUPS, groupOfLine, type AdsGroupKey } from "@/lib/ads-lines";
import { budgetProgress } from "@/lib/ads-plan";
import { diffDaysStr, todayVnDayStr } from "@/lib/time";
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
  type PlanRow,
  type Line,
  type MetricRow,
  type SbuLite,
} from "./shared";
import { b2cSummary } from "./rollups";

export type AlertLevel = "crit" | "warn" | "info";

export interface AdsAlert {
  level: AlertLevel;
  title: string;
  detail: string;
  /** Mục con nên mở để xem chi tiết. */
  tab: "month" | "week" | "plan";
  /** Mảng nên mở (bỏ trống = B2C). */
  group?: AdsGroupKey;
}

/** Ngưỡng cảnh báo — chỉnh ở đây nếu phòng đổi chuẩn theo dõi. */
export const ALERT_THRESHOLDS = {
  /** CPL/CAC tăng hơn mức này so với kỳ trước → cảnh báo. */
  costIncrease: 0.25,
  /** Chi tiêu tuần tăng hơn mức này so với tuần trước → cảnh báo. */
  weeklySpendJump: 0.3,
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
  plan: PlanRow[];
  rubric: EffectivenessRubric;
  /** Tháng đang xem. */
  month: string;
  currentMonth: string;
}): AdsAlert[] {
  const out: AdsAlert[] = [];
  const prev = prevMonth(month);
  const monthRows = (line: Line, p: string, sbuId?: string) =>
    metrics.filter((m) => m.periodType === "month" && m.line === line && m.period === p && (sbuId === undefined || m.sbuId === sbuId));

  // --- 1. Trung tâm (ads ngân sách riêng, có số quy riêng từ T7/2026): hiệu quả, chi mà chưa ra HVM, CPL tăng mạnh ---
  const attributed = b2cSummary(metrics, [month]).attributedMonths > 0;
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
    if (attributed && d.spend && d.leads == null) {
      out.push({ level: "info", tab: "month", title: `${s.code}: thiếu số Lead/HVM`, detail: `${monthLabel(month)} đã chi ${fmtMoney(d.spend)} nhưng chưa nhập Lead/HVM — chưa tính được CPL/CAC.` });
    }
  }

  // --- 2a. B2C Offline gộp (Hệ thống + Trung tâm, Lead/HVM tính chung) ---
  const b2c = b2cSummary(metrics, [month]);
  const b2cPrev = b2cSummary(metrics, [prev]);
  if (b2c.totalSpend) {
    const cplUp = change(b2c.cpl, b2cPrev.cpl);
    if (cplUp != null && cplUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", title: `B2C Offline: CPL tăng ${pct(cplUp)}`, detail: `${fmtMoney(b2cPrev.cpl)} → ${fmtMoney(b2c.cpl)} so với ${monthLabel(prev)}.` });
    }
    const cacUp = change(b2c.cac, b2cPrev.cac);
    if (cacUp != null && cacUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", title: `B2C Offline: CAC tăng ${pct(cacUp)}`, detail: `${fmtMoney(b2cPrev.cac)} → ${fmtMoney(b2c.cac)} so với ${monthLabel(prev)}.` });
    }
    if (b2c.leads == null) {
      out.push({ level: "info", tab: "month", title: "B2C Offline: thiếu Lead/HVM tổng", detail: `${monthLabel(month)} đã chi ${fmtMoney(b2c.totalSpend)} (Hệ thống + Trung tâm) nhưng chưa nhập Lead/HVM tổng.` });
    }
  }
  if (b2c.inconsistentMonths.length) {
    out.push({ level: "crit", tab: "month", title: "B2C Offline: số TT lớn hơn số tổng", detail: `${monthLabel(month)}: Lead/HVM quy riêng cho trung tâm vượt Lead/HVM tổng — kiểm tra lại số nhập.` });
  }

  // --- 2b. Các mảng còn lại: CPL/CAC tăng mạnh, thiếu số liệu ---
  for (const line of LINES) {
    if (line === "b2c_center" || line === "b2c_system") continue;
    const cur = monthRows(line, month);
    if (!cur.length) continue;
    const d = derive(aggregate(cur), line, rubric);
    const p = derive(aggregate(monthRows(line, prev)), line, rubric);
    const cplUp = change(d.cpl, p.cpl);
    if (cplUp != null && cplUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", group: groupOfLine(line).key, title: `${LINE_LABELS[line]}: CPL tăng ${pct(cplUp)}`, detail: `${fmtMoney(p.cpl)} → ${fmtMoney(d.cpl)} so với ${monthLabel(prev)}.` });
    }
    const cacUp = change(d.cac, p.cac);
    if (cacUp != null && cacUp > ALERT_THRESHOLDS.costIncrease) {
      out.push({ level: "warn", tab: "month", group: groupOfLine(line).key, title: `${LINE_LABELS[line]}: CAC tăng ${pct(cacUp)}`, detail: `${fmtMoney(p.cac)} → ${fmtMoney(d.cac)} so với ${monthLabel(prev)}.` });
    }
    if (d.spend && (line === "ecom" ? d.mql : d.leads) == null) {
      out.push({ level: "info", tab: "month", group: groupOfLine(line).key, title: `${LINE_LABELS[line]}: thiếu số Lead`, detail: `${monthLabel(month)} đã chi ${fmtMoney(d.spend)} nhưng chưa nhập Lead/HVM.` });
    }
  }

  // --- 3. Kế hoạch tháng: vượt/chậm so với kế hoạch, chưa lập kế hoạch (rà theo từng mảng) ---
  const today = todayVnDayStr();
  for (const g of ADS_GROUPS) {
    const rows = metrics.filter((m) => m.periodType === "month" && g.lines.includes(m.line) && m.period === month);
    const planRows = plan.filter((p) => g.lines.includes(p.line) && p.period === month && num(p.plannedBudget) != null);
    const planned = planRows.length ? planRows.reduce((s, p) => s + (num(p.plannedBudget) ?? 0), 0) : null;
    const actual = rows.length ? rows.reduce((s, r) => s + (spendOf(r) ?? 0), 0) : null;
    const prog = budgetProgress(planned, actual, month, today);
    const ratio = prog.used != null ? Math.round(prog.used * 100) : 0;
    if (prog.status === "over") {
      out.push({ level: "crit", tab: "plan", group: g.key, title: `${g.label}: vượt ngân sách kế hoạch (${ratio}%)`, detail: `Thực tế ${fmtMoney(actual)} / KH ${fmtMoney(planned)} trong ${monthLabel(month)}.` });
    } else if (prog.status === "fast") {
      out.push({ level: "warn", tab: "plan", group: g.key, title: `${g.label}: đang đi nhanh hơn kế hoạch`, detail: `Đã dùng ${ratio}% KH, dự báo cuối ${monthLabel(month)} khoảng ${fmtMoney(prog.forecast)} / KH ${fmtMoney(planned)}.` });
    } else if (prog.status === "slow") {
      out.push({ level: "warn", tab: "plan", group: g.key, title: `${g.label}: giải ngân chậm (${ratio}%)`, detail: month < currentMonth ? `${monthLabel(month)} đã kết thúc, thực tế ${fmtMoney(actual)} / KH ${fmtMoney(planned)}.` : `Dự báo cuối tháng ${fmtMoney(prog.forecast)} / KH ${fmtMoney(planned)}.` });
    }
    // Chưa lập kế hoạch cho tháng hiện tại, trong khi mảng đang chạy (đã có số liệu ở tháng nào đó).
    if (month === currentMonth && planned == null) {
      const active = metrics.some((m) => m.periodType === "month" && g.lines.includes(m.line));
      if (active) out.push({ level: "info", tab: "plan", group: g.key, title: `${g.label}: chưa lập kế hoạch ${monthLabel(month)}`, detail: "Nhập ngân sách và mục tiêu tháng để theo dõi tiến độ." });
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

  // --- 5. Mảng bắt buộc báo tuần (cờ expectWeekly trong lib/ads-lines.ts) mà thiếu số tuần gần nhất ---
  if (month === currentMonth) {
    for (const g of ADS_GROUPS.filter((x) => x.expectWeekly)) {
      const ws = [...new Set(metrics.filter((m) => m.periodType === "week" && g.lines.includes(m.line)).map((m) => m.period))].sort();
      const latest = ws[ws.length - 1];
      if (latest && diffDaysStr(latest, today) > 13) {
        out.push({ level: "info", tab: "week", group: g.key, title: `${g.label}: chưa nhập số tuần gần nhất`, detail: `Tuần mới nhất đang có là ${weekLabel(latest)}.` });
      }
    }
  }

  const rank: Record<AlertLevel, number> = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
