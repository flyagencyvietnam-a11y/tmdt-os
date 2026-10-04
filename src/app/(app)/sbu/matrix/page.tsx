import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbuCatalogItems, sbuItemStatus, sbus } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";
import { MatrixGrid } from "./matrix-grid";
import { PageHeader } from "@/components/shell/page-header";

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
      <PageHeader title="Ma trận hạng mục × SBU" description="Trạng thái từng hạng mục theo SBU trong kỳ — tự cập nhật khi task/checklist liên quan được hoàn thành." />
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
