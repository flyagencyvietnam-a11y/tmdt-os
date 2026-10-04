import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { brands, campaigns, sbus, tasks, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { listContentItems } from "@/lib/services/content";
import { todayVnDayStr } from "@/lib/time";
import { ContentCalendarView } from "./content-view";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Content calendar — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const { item: openItem } = await searchParams;
  const user = await requireUser();
  if (!canSee(user.role, "content")) redirect("/khong-co-quyen");

  const [items, allBrands, allCampaigns, allSbus, allUsers] = await Promise.all([
    listContentItems(db),
    db.select().from(brands),
    db.select({ id: campaigns.id, code: campaigns.code, name: campaigns.name }).from(campaigns),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  // Task đăng bài (task cha) của từng content — để hiện link + trạng thái ngay trên danh sách.
  const parentIds = items.map((i) => i.parentTaskId).filter((x): x is string => !!x);
  const parentTasks = parentIds.length ? await db.select({ id: tasks.id, code: tasks.code, status: tasks.status }).from(tasks).where(inArray(tasks.id, parentIds)) : [];
  const taskById = new Map(parentTasks.map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      <PageHeader title="Content calendar" description="Lên lịch bài đăng theo brand & kênh. Mỗi bài tự sinh task Soạn nội dung → Thiết kế → Duyệt → Đăng." />
      <ContentCalendarView
        items={items.map((i) => ({
          id: i.id,
          brandIds: i.brandIds.length ? i.brandIds : [i.brandId],
          campaignId: i.campaignId,
          sbuId: i.sbuId,
          publishDate: i.publishDate,
          channels: i.channels.length ? i.channels : [i.channel],
          topic: i.topic,
          format: i.format,
          keyMessage: i.keyMessage,
          targetAudience: i.targetAudience,
          cta: i.cta,
          ownerId: i.ownerId,
          status: i.status,
          postUrl: i.postUrl,
          contentPillar: i.contentPillar,
          taskId: i.parentTaskId,
          taskCode: i.parentTaskId ? (taskById.get(i.parentTaskId)?.code ?? null) : null,
          taskStatus: i.parentTaskId ? (taskById.get(i.parentTaskId)?.status ?? null) : null,
        }))}
        brands={allBrands.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
        campaigns={allCampaigns}
        sbus={allSbus}
        users={allUsers}
        today={todayVnDayStr()}
        initialOpenId={openItem ?? null}
      />
    </div>
  );
}
