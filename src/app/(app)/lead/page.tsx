import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns, enrollments, leadInteractions, leads, products, users } from "@/lib/db/schema";
import { scoreLead } from "@/lib/services/lead-score";
import { getFormRefs } from "@/lib/services/refs";
import { LeadTable } from "./lead-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead — VMG TMĐT OS" };

export default async function Page() {
  const user = await requireUser();
  if (!can(user.role, "lead", "read"))
    return <p className="text-sm">Không có quyền xem danh sách lead.</p>;

  const rows = await db
    .select({
      id: leads.id,
      code: leads.code,
      fullName: leads.fullName,
      phone: leads.phone,
      productCode: products.code,
      campaignName: campaigns.displayName,
      source: leads.source,
      stage: leads.stage,
      maxStage: leads.maxStage,
      outcome: leads.outcome,
      assignedName: users.fullName,
      nextContactDate: leads.nextContactDate,
      silenceCount: leads.silenceCount,
      isCold: leads.isCold,
      lastContactedAt: leads.lastContactedAt,
      receivedAt: leads.receivedAt,
      mqlAt: leads.mqlAt,
      wonAt: leads.wonAt,
      revenue: sql<number>`coalesce((
        select sum(e.gross_amount) from ${enrollments} e
        where e.lead_id = ${leads.id} and e.deleted_at is null), 0)`,
      interactionCount: sql<number>`(
        select count(*) from ${leadInteractions} li where li.lead_id = ${leads.id})`,
    })
    .from(leads)
    .leftJoin(products, eq(products.id, leads.productId))
    .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(and(isNull(leads.deletedAt), isNull(leads.duplicateOf)))
    .orderBy(desc(leads.receivedAt))
    .limit(2000);

  const refs = await getFormRefs(db);
  const canCreate = can(user.role, "lead", "create");
  const showContact = can(user.role, "lead.contactInfo", "read");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lead ({rows.length})</h1>
          <p className="text-sm text-muted-foreground">
            SPEC Mục 11.4 — dùng Data Grid: lọc, gom nhóm, view lưu được.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href="/lead/moi" />}>+ Lead mới</Button>
        )}
      </div>
      <LeadTable
        rows={rows.map((r) => {
          const sc = scoreLead({
            stage: r.stage,
            maxStage: r.maxStage,
            outcome: r.outcome,
            silenceCount: r.silenceCount,
            phone: r.phone,
            nextContactDate: r.nextContactDate,
            lastContactedAt: r.lastContactedAt,
            source: r.source,
            isCold: r.isCold,
          });
          return {
            ...r,
            receivedAt: r.receivedAt ? new Date(r.receivedAt).toISOString() : null,
            mqlAt: r.mqlAt ? new Date(r.mqlAt).toISOString() : null,
            wonAt: r.wonAt ? new Date(r.wonAt).toISOString() : null,
            lastContactedAt: r.lastContactedAt
              ? new Date(r.lastContactedAt).toISOString()
              : null,
            revenue: Number(r.revenue ?? 0),
            interactionCount: Number(r.interactionCount ?? 0),
            score: sc.score,
            scoreBand: sc.band,
          };
        })}
        showContact={showContact}
        ecUsers={refs.ecUsers}
        canReassign={can(user.role, "lead.reassign", "update")}
      />
    </div>
  );
}
