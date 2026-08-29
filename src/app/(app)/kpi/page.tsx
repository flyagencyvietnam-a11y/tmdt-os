import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  getKpiProgressForPeriod,
  listKpiDefinitions,
  listOtherCosts,
} from "@/lib/services/kpi";
import { getFormRefs } from "@/lib/services/refs";
import { quarterBounds, todayVnDayStr } from "@/lib/time";
import { KpiWorkspace } from "./kpi-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "KPI — VMG TMĐT OS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  // Kỳ mặc định = quý hiện tại (SPEC Mục 14.1). ?q=YYYY-Qn để chọn.
  let [start, end] = quarterBounds(todayVnDayStr());
  let label = quarterLabel(start);
  if (sp.q && /^\d{4}-Q[1-4]$/.test(sp.q)) {
    const [y, q] = sp.q.split("-Q").map(Number);
    const m = (q - 1) * 3 + 1;
    [start, end] = quarterBounds(`${y}-${String(m).padStart(2, "0")}-01`);
    label = sp.q;
  }

  const canManage = user.role === "ADMIN" || user.role === "MANAGER";
  const isViewer = user.role === "VIEWER";

  const [defs, progressAll, refs, costs] = await Promise.all([
    listKpiDefinitions(db),
    getKpiProgressForPeriod(db, {
      periodStart: start,
      periodEnd: end,
      userId: canManage || isViewer ? undefined : user.id,
    }),
    getFormRefs(db),
    listOtherCosts(db, { from: start, to: end }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">KPI — {label}</h1>
        <p className="text-sm text-muted-foreground">
          {start} → {end}. Cơ chế thưởng Q3: 3 chỉ tiêu 30/30/40, mốc 85/90/100 (SPEC
          Mục 14). Số thực tế tự lấy từ dữ liệu vận hành.
        </p>
      </div>
      <KpiWorkspace
        role={user.role}
        currentUserId={user.id}
        periodStart={start}
        periodEnd={end}
        quarterKey={quarterKeyOf(start)}
        definitions={defs}
        progress={progressAll.map((p) => ({
          ...p,
          // numbers only for client
        }))}
        users={refs.users}
        products={refs.products}
        otherCosts={costs.map((c) => ({
          ...c,
          amount: Number(c.amount),
        }))}
      />
    </div>
  );
}

function quarterLabel(startDay: string): string {
  const m = Number(startDay.slice(5, 7));
  return `${startDay.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
}
function quarterKeyOf(startDay: string): string {
  return quarterLabel(startDay);
}
