import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { brands, sbus, users } from "@/lib/db/schema";
import { listDeliverables, listShoots } from "@/lib/services/media";
import { MediaPlanView } from "./media-view";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Kế hoạch quay chụp — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function MediaPlanPage() {
  const user = await requireUser();
  if (!canSee(user.role, "media")) redirect("/khong-co-quyen");

  const [shoots, deliverables, allBrands, allSbus, allUsers] = await Promise.all([
    listShoots(db),
    listDeliverables(db),
    db.select({ id: brands.id, code: brands.code }).from(brands),
    db.select({ id: sbus.id, code: sbus.code }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Kế hoạch quay chụp" description="Lịch các đợt quay (mặc định 2 tuần/đợt). Mỗi deliverable tự sinh task chuẩn bị, quay và hậu kỳ." />
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
