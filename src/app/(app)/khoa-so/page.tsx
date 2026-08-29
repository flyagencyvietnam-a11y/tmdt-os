import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listPeriodLocks } from "@/lib/services/period-lock";
import { monthBounds, todayVnDayStr, addDaysStr } from "@/lib/time";
import { KhoaSoManager } from "./khoa-so-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khóa sổ kỳ — VMG TMĐT OS" };

export default async function Page() {
  await requireRole("ADMIN");
  const locks = await listPeriodLocks(db);

  // gợi ý: 6 tháng gần nhất
  const today = todayVnDayStr();
  const suggestions: { label: string; start: string; end: string }[] = [];
  let cursor = monthBounds(today)[0];
  for (let i = 0; i < 6; i++) {
    const [s, e] = monthBounds(cursor);
    suggestions.push({ label: s.slice(0, 7), start: s, end: e });
    cursor = addDaysStr(s, -1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Khóa sổ kỳ</h1>
        <p className="text-sm text-muted-foreground">
          Sau khi khóa, mọi bản ghi có ngày trong kỳ (số liệu ads, doanh thu) thành chỉ
          đọc với mọi vai trò trừ ADMIN. Mở khóa được ghi audit. SPEC Mục 7.13 / 18.2.
        </p>
      </div>
      <KhoaSoManager
        suggestions={suggestions}
        locks={locks.map((l) => ({
          id: l.id,
          periodStart: l.periodStart,
          periodEnd: l.periodEnd,
          lockedAt: l.lockedAt.toISOString(),
          unlockedAt: l.unlockedAt ? l.unlockedAt.toISOString() : null,
          note: l.note,
        }))}
      />
    </div>
  );
}
