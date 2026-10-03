import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { CampaignList } from "./campaign-list";

export const metadata = { title: "Campaign — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function CampaignPage() {
  const user = await requireUser();
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.startDate));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Campaign master</h1>
        <p className="text-sm text-muted-foreground">
          Action plan của mỗi campaign chính là các task gắn <code>campaign_id</code> (SPEC Mục 4.1) — mở
          một campaign để xem/giao task.
        </p>
      </div>
      <CampaignList
        campaigns={rows.map((c) => ({ id: c.id, code: c.code, name: c.name, type: c.type, startDate: c.startDate, endDate: c.endDate, status: c.status }))}
        canEdit={user.role === "admin" || user.role === "manager"}
      />
    </div>
  );
}
