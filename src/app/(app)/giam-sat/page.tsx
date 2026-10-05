import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sbus } from "@/lib/db/schema";
import { computeAlert, lastCheckNotes, listMonitoringItems, listPhotoMeta, nextDueDate } from "@/lib/services/monitoring";
import { MonitoringView } from "./monitoring-view";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Giám sát hạng mục — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const user = await requireUser();
  if (!canSee(user.role, "monitoring")) redirect("/khong-co-quyen");

  const [items, allSbus, photos, checks] = await Promise.all([
    listMonitoringItems(db),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name, region: sbus.region, kind: sbus.kind }).from(sbus).where(eq(sbus.active, true)).orderBy(asc(sbus.code)),
    listPhotoMeta(db),
    lastCheckNotes(db),
  ]);

  // Brand/sản phẩm chỉ hiện ở Giám sát khi thật sự có hạng mục (vd. quầy tư vấn VMP).
  const withItems = new Set(items.map((i) => i.sbuId));
  const sbuList = allSbus.filter((s) => s.kind !== "brand" || withItems.has(s.id));

  const photosByItem = new Map<string, typeof photos>();
  for (const p of photos) (photosByItem.get(p.itemId) ?? photosByItem.set(p.itemId, []).get(p.itemId)!).push(p);

  return (
    <div className="space-y-4">
      <PageHeader title="Giám sát hạng mục" description="Theo dõi từng SBU: mở một SBU để xem hiện trạng POSM, bảng hiệu, OOH, Google Maps… kèm ảnh chụp thực tế, ngày rà soát và cảnh báo khi quá hạn." />
      <MonitoringView
        items={items.map((i) => ({
          id: i.id,
          sbuId: i.sbuId,
          kind: i.kind,
          title: i.title,
          currentStateNote: i.currentStateNote,
          lastUpdatedDate: i.lastUpdatedDate,
          cycleMonths: i.cycleMonths,
          photoUrl: i.photoUrl,
          alert: computeAlert(i),
          nextDue: nextDueDate(i),
          checkCount: checks.get(i.id)?.n ?? 0,
          area: i.area,
          quantity: i.quantity,
          sizeText: i.sizeText,
          photos: (photosByItem.get(i.id) ?? []).map((p) => ({ id: p.id, caption: p.caption, bytes: p.bytes, width: p.width, height: p.height, createdAt: p.createdAt.toISOString() })),
        }))}
        sbus={sbuList.map(({ id, code, name, region }) => ({ id, code, name, region }))}
        canEdit={user.role === "admin" || user.role === "manager" || user.role === "member"}
        canManage={user.role === "admin" || user.role === "manager" || user.role === "member"}
      />
    </div>
  );
}
