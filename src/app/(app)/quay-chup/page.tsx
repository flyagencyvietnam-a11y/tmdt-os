import { eq, isNull, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { brands, mediaShoots, sbus, users } from "@/lib/db/schema";
import { listDeliverables, listShoots } from "@/lib/services/media";
import { MediaPlanView } from "./media-view";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CLOSED_VISIBLE_DAYS } from "@/lib/task-view";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kế hoạch quay chụp — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function MediaPlanPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  const showAll = scope === "all";
  const user = await requireUser();
  if (!canSee(user.role, "media")) redirect("/khong-co-quyen");

  // Mặc định ẩn đợt quay đã xong/huỷ quá CLOSED_VISIBLE_DAYS ngày (cùng deliverable của đợt đó).
  const hideClosedBefore = showAll ? undefined : addDaysStr(todayVnDayStr(), -CLOSED_VISIBLE_DAYS);
  const [shoots, allDeliverables, allBrands, allSbus, allUsers, [{ total }]] = await Promise.all([
    listShoots(db, { hideClosedBefore }),
    listDeliverables(db),
    db.select({ id: brands.id, code: brands.code }).from(brands),
    db.select({ id: sbus.id, code: sbus.code }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select({ total: sql<number>`count(*)::int` }).from(mediaShoots).where(isNull(mediaShoots.deletedAt)),
  ]);
  const shownShootIds = new Set(shoots.map((s) => s.id));
  const deliverables = allDeliverables.filter((d) => !d.shootId || shownShootIds.has(d.shootId));
  const hidden = Number(total) - shoots.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kế hoạch quay chụp"
        description="Lịch các đợt quay (mặc định 2 tuần/đợt). Mỗi deliverable tự sinh task chuẩn bị, quay và hậu kỳ."
        actions={
          showAll ? (
            <Link href="/quay-chup" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Ẩn đợt quay đã xong cũ
            </Link>
          ) : hidden > 0 ? (
            <Link href="/quay-chup?scope=all" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Hiện cả {hidden} đợt quay đã xong quá {CLOSED_VISIBLE_DAYS} ngày
            </Link>
          ) : undefined
        }
      />
      <MediaPlanView
        shoots={shoots.map((s) => ({ id: s.id, code: s.code, shootDate: s.shootDate, location: s.location, purpose: s.purpose, status: s.status, sbuId: s.sbuId, brandId: s.brandId }))}
        deliverables={deliverables.map((d) => ({ id: d.id, shootId: d.shootId, deliverableType: d.deliverableType, channel: d.channel, editorId: d.editorId, dueDate: d.dueDate, resultUrl: d.resultUrl }))}
        brands={allBrands}
        sbus={allSbus}
        users={allUsers}
      />
    </div>
  );
}
