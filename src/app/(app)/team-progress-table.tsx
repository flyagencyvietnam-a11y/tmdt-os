import type { breakdownByUser } from "@/lib/services/dashboard";
import { fmtInt, fmtPct, fmtVnd } from "@/lib/format";

type Row = Awaited<ReturnType<typeof breakdownByUser>>[number];

/**
 * Tiến độ đội — từng người + dòng TỔNG (Gói M). Dùng chung cho Dashboard chính và
 * màn BOD (VIEWER). Thay cho bảng Cohort đã bỏ.
 */
export function TeamProgressTable({ rows }: { rows: Row[] }) {
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tMql = sum((r) => r.metrics.mql);
  const tWon = sum((r) => r.metrics.won);
  const tTaskDone = sum((r) => r.taskDone);
  const tTaskTotal = sum((r) => r.taskTotal);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <caption className="px-3 py-2 text-left text-sm font-semibold">
          Tiến độ đội — chăm sóc, công việc, chuyển đổi theo từng người
        </caption>
        <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Nhân sự</th>
            <th className="px-3 py-2 text-right">Lead giao</th>
            <th className="px-3 py-2 text-right">MQL</th>
            <th className="px-3 py-2 text-right">HV</th>
            <th className="px-3 py-2 text-right">HVM</th>
            <th className="px-3 py-2 text-right">Doanh thu</th>
            <th className="px-3 py-2 text-right">CR MQL→Chốt</th>
            <th className="px-3 py-2 text-right">Phiên CS</th>
            <th className="px-3 py-2 text-right">Task (xong/tổng)</th>
            <th className="px-3 py-2 text-right">% task</th>
            <th className="px-3 py-2 text-right">Trễ hẹn</th>
            <th className="px-3 py-2 text-right">Phản hồi lead mới</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const taskPct = r.taskTotal > 0 ? r.taskDone / r.taskTotal : null;
            return (
              <tr key={r.key} className="border-b">
                <td className="px-3 py-1.5 font-medium">{r.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.leadsAssigned)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.metrics.mql)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.metrics.won)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.metrics.hvm)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtVnd(r.metrics.revenueGross)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtPct(r.crMqlWon)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtInt(r.careSessions)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <span className={r.taskTotal > 0 && r.taskDone < r.taskTotal ? "" : "text-ok"}>
                    {r.taskDone}/{r.taskTotal || "–"}
                  </span>
                  {r.taskOverdue > 0 && (
                    <span className="ml-1 text-crit">({r.taskOverdue} trễ)</span>
                  )}
                </td>
                <td
                  className={
                    "px-3 py-1.5 text-right tabular-nums " +
                    (taskPct != null && taskPct < 0.7 ? "text-crit" : "")
                  }
                >
                  {fmtPct(taskPct)}
                </td>
                <td
                  className={
                    (r.overdueRate ?? 0) > 0.1
                      ? "px-3 py-1.5 text-right tabular-nums text-crit"
                      : "px-3 py-1.5 text-right tabular-nums"
                  }
                >
                  {fmtPct(r.overdueRate)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtPct(r.firstResponseRate)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 bg-muted/30 font-medium">
            <td className="px-3 py-1.5">TỔNG ĐỘI</td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {fmtInt(sum((r) => r.leadsAssigned))}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(tMql)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(tWon)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {fmtInt(sum((r) => r.metrics.hvm))}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {fmtVnd(sum((r) => r.metrics.revenueGross))}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {fmtPct(tMql > 0 ? tWon / tMql : null)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {fmtInt(sum((r) => r.careSessions))}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {tTaskDone}/{tTaskTotal || "–"}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {fmtPct(tTaskTotal > 0 ? tTaskDone / tTaskTotal : null)}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
              –
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
              –
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
