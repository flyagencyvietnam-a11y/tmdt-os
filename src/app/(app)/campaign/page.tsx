import { asc, isNull, eq } from "drizzle-orm";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaignDailyMetrics, campaigns, products, users } from "@/lib/db/schema";
import { getBaseMetrics, deriveMetrics } from "@/lib/services/metrics";
import { getFormRefs } from "@/lib/services/refs";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import { CampaignTable } from "./campaign-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign — VMG TMĐT OS" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "campaign", "read"))
    return <p className="text-sm">Không có quyền.</p>;

  const sp = await searchParams;
  const day = ISO.test(sp.date ?? "") ? sp.date! : todayVnDayStr();

  const to = todayVnDayStr();
  const from = addDaysStr(to, -29);

  const [list, dayMetrics] = await Promise.all([
    db
      .select({
        id: campaigns.id,
        internalCode: campaigns.internalCode,
        displayName: campaigns.displayName,
        externalId: campaigns.externalId,
        productCode: products.code,
        targetCpmql: products.targetCpmql,
        channel: campaigns.channel,
        status: campaigns.status,
        dailyBudget: campaigns.dailyBudget,
        ownerId: campaigns.ownerId,
        ownerName: users.fullName,
        startedOn: campaigns.startedOn,
        endedOn: campaigns.endedOn,
      })
      .from(campaigns)
      .leftJoin(products, eq(products.id, campaigns.productId))
      .leftJoin(users, eq(users.id, campaigns.ownerId))
      .where(isNull(campaigns.deletedAt))
      .orderBy(asc(campaigns.status), asc(campaigns.displayName)),
    db
      .select()
      .from(campaignDailyMetrics)
      .where(eq(campaignDailyMetrics.metricDate, day)),
  ]);

  const byCampaign = new Map(dayMetrics.map((m) => [m.campaignId, m]));

  const rows = await Promise.all(
    list.map(async (c) => {
      const b = await getBaseMetrics(db, {
        from,
        to,
        campaignIds: [c.id],
        campaignAttribution: true,
      });
      const d = deriveMetrics(b);
      const m = byCampaign.get(c.id);
      return {
        ...c,
        targetCpmql: Number(c.targetCpmql ?? 600000),
        dailyBudget: c.dailyBudget == null ? null : Number(c.dailyBudget),
        spendDay: m ? Number(m.spend) : null,
        messagesDay: m ? m.messages : null,
        spend: b.spend,
        leads: b.leads,
        mql: b.mql,
        sql: b.sql,
        won: b.won,
        revenue: b.revenueGross,
        cpl: d.cpl,
        cpmql: d.cpmql,
        cac: d.cac,
        roas: d.roas,
        crLeadWon: d.crLeadWon,
      };
    }),
  );

  const refs = await getFormRefs(db);
  const canManage = can(user.role, "campaign", "create");
  const canEditCampaign = can(user.role, "campaign", "update");
  const canEnterMetrics = can(user.role, "campaignDailyMetric", "create");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Campaign</h1>
        <p className="text-sm text-muted-foreground">
          Chỉ số 30 ngày gần nhất ({from} → {to}). CPMQL tô màu theo ngưỡng sản phẩm
          (SPEC Mục 10.1). Cột <b>Spend/Mess ({day})</b> nhập số liệu ads theo ngày —
          chọn ngày ở đầu bảng (SPEC Mục 10.2).
        </p>
      </div>
      <CampaignTable
        rows={rows}
        day={day}
        canManage={canManage}
        canEditCampaign={canEditCampaign}
        canEnterMetrics={canEnterMetrics}
        products={refs.products}
        owners={refs.users}
      />
    </div>
  );
}
