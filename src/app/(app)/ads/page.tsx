import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaignDailyMetrics, campaigns, products } from "@/lib/db/schema";
import { getBaseMetrics, deriveMetrics } from "@/lib/services/metrics";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import { AdsEntryGrid } from "./ads-entry-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nhập số liệu ads — VMG TMĐT OS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireRole("MARKETING", "ADMIN", "MANAGER");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayVnDayStr();

  const active = await db
    .select({
      id: campaigns.id,
      internalCode: campaigns.internalCode,
      displayName: campaigns.displayName,
      productCode: products.code,
      dailyBudget: campaigns.dailyBudget,
    })
    .from(campaigns)
    .leftJoin(products, eq(products.id, campaigns.productId))
    .where(
      and(
        isNull(campaigns.deletedAt),
        eq(campaigns.status, "ON"),
        lte(campaigns.startedOn, date),
      ),
    )
    .orderBy(asc(campaigns.displayName));

  const existing = await db
    .select()
    .from(campaignDailyMetrics)
    .where(eq(campaignDailyMetrics.metricDate, date));
  const byCampaign = new Map(existing.map((m) => [m.campaignId, m]));

  const from14 = addDaysStr(date, -13);
  const rows = await Promise.all(
    active.map(async (c) => {
      const m = byCampaign.get(c.id);
      const b = await getBaseMetrics(db, {
        from: from14,
        to: date,
        campaignIds: [c.id],
        campaignAttribution: true,
      });
      const d = deriveMetrics(b);
      return {
        id: c.id,
        internalCode: c.internalCode,
        displayName: c.displayName,
        productCode: c.productCode,
        dailyBudget: c.dailyBudget == null ? null : Number(c.dailyBudget),
        spend: m ? Number(m.spend) : null,
        messages: m ? m.messages : null,
        cpmql14: d.cpmql,
        mql14: b.mql,
      };
    }),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nhập số liệu ads</h1>
        <p className="text-sm text-muted-foreground">
          Tất cả campaign đang ON. Tự lưu sau khi ngừng gõ. Tab / Enter để di chuyển
          (SPEC Mục 10.2).
        </p>
      </div>
      <AdsEntryGrid date={date} rows={rows} />
    </div>
  );
}
