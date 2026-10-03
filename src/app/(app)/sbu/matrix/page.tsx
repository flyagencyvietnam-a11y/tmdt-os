import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbuCatalogItems, sbuItemStatus, sbus } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import { MatrixGrid } from "./matrix-grid";

export const metadata = { title: "Ma trận SBU — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function SbuMatrixPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireUser();
  const { period: periodParam } = await searchParams;
  const period = periodParam || todayVnDayStr().slice(0, 7);

  const [catalogItems, sbuRows, statusRows] = await Promise.all([
    db.select().from(sbuCatalogItems).orderBy(asc(sbuCatalogItems.code)),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus).where(eq(sbus.active, true)).orderBy(asc(sbus.code)),
    db.select().from(sbuItemStatus).where(eq(sbuItemStatus.period, period)),
  ]);

  const statusMap = new Map(statusRows.map((s) => [`${s.catalogItemId}::${s.sbuId}`, s]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ma trận SBU</h1>
        <p className="text-sm text-muted-foreground">
          Hạng mục × SBU × kỳ (SPEC Mục 9.3) — trạng thái tự cập nhật từ task thật khi tick
          checklist (Mục 6.6), không cần nhập tay thêm lần nữa. Hiện chỉ seed 3 hạng mục nêu rõ
          trong spec; cần file Excel gốc để nạp đủ 46 hạng mục.
        </p>
      </div>
      <MatrixGrid
        period={period}
        catalogItems={catalogItems.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
        sbus={sbuRows}
        cells={Object.fromEntries(
          catalogItems.flatMap((c) =>
            sbuRows.map((s) => {
              const st = statusMap.get(`${c.id}::${s.id}`);
              return [`${c.id}::${s.id}`, { status: st?.status ?? "not_started", taskId: st?.taskId ?? null }];
            }),
          ),
        )}
      />
    </div>
  );
}
