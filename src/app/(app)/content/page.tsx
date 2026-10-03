import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { brands, campaigns, sbus, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listContentItems } from "@/lib/services/content";
import { ContentCalendarView } from "./content-view";

export const metadata = { title: "Content calendar — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const user = await requireUser();
  if (!canSee(user.role, "content")) redirect("/khong-co-quyen");

  const [items, allBrands, allCampaigns, allSbus, allUsers] = await Promise.all([
    listContentItems(db),
    db.select().from(brands),
    db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Content calendar</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 7.2/9.6 — mỗi dòng sinh 1 task cha + task con (Soạn nội dung/Thiết kế/Duyệt/Đăng bài).
        </p>
      </div>
      <ContentCalendarView
        items={items.map((i) => ({
          id: i.id,
          brandId: i.brandId,
          campaignId: i.campaignId,
          sbuId: i.sbuId,
          publishDate: i.publishDate,
          channel: i.channel,
          topic: i.topic,
          ownerId: i.ownerId,
          status: i.status,
          postUrl: i.postUrl,
          contentPillar: i.contentPillar,
        }))}
        brands={allBrands.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
        campaigns={allCampaigns}
        sbus={allSbus}
        users={allUsers}
      />
    </div>
  );
}
