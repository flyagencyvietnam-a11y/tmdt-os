import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { campaigns, leads, products, users } from "@/lib/db/schema";
import { listEnrollments } from "@/lib/services/enrollments";
import { listInteractions } from "@/lib/services/interactions";
import { getStageHistory } from "@/lib/services/leads";
import { getFormRefs } from "@/lib/services/refs";
import { LeadDetail } from "./lead-detail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "lead", "read")) notFound();
  const { id } = await params;

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
    .limit(1);
  if (!lead) notFound();

  const [product] = await db
    .select({ code: products.code, name: products.name })
    .from(products)
    .where(eq(products.id, lead.productId));
  const campaign = lead.campaignId
    ? (
        await db
          .select({ name: campaigns.displayName, code: campaigns.internalCode })
          .from(campaigns)
          .where(eq(campaigns.id, lead.campaignId))
      )[0]
    : null;
  const assignee = lead.assignedTo
    ? (
        await db
          .select({ name: users.fullName })
          .from(users)
          .where(eq(users.id, lead.assignedTo))
      )[0]
    : null;

  const [interactions, history, enrollments, refs] = await Promise.all([
    listInteractions(db, id),
    getStageHistory(db, id),
    listEnrollments(db, id),
    getFormRefs(db),
  ]);

  const showContact = can(user.role, "lead.contactInfo", "read");
  const canEditStatus = can(user.role, "lead.statusChange", "update");
  const canRevenue = can(user.role, "lead.revenue", "create");
  const canInteract = can(user.role, "leadInteraction", "create");

  return (
    <div className="space-y-4">
      <Link href="/lead" className="text-sm text-brand underline">
        ← Danh sách lead
      </Link>
      <LeadDetail
        lead={{
          id: lead.id,
          code: lead.code,
          fullName: lead.fullName,
          phone: showContact ? lead.phone : maskPhone(lead.phone),
          email: showContact ? lead.email : null,
          fbProfile: lead.fbProfile,
          stage: lead.stage,
          maxStage: lead.maxStage,
          outcome: lead.outcome,
          nextContactDate: lead.nextContactDate,
          silenceCount: lead.silenceCount,
          isCold: lead.isCold,
          lostReason: lead.lostReason,
          consultNote: lead.consultNote,
          receivedAt: lead.receivedAt.toISOString(),
          mqlAt: lead.mqlAt?.toISOString() ?? null,
          sqlAt: lead.sqlAt?.toISOString() ?? null,
          wonAt: lead.wonAt?.toISOString() ?? null,
          productId: lead.productId,
          source: lead.source,
        }}
        productLabel={product ? `${product.code} — ${product.name}` : "—"}
        campaignLabel={campaign ? `${campaign.name} (${campaign.code})` : null}
        assigneeLabel={assignee?.name ?? "Chưa phân công"}
        interactions={interactions.map((i) => ({
          ...i,
          occurredAt: i.occurredAt.toISOString(),
          createdAt: i.createdAt.toISOString(),
        }))}
        history={history.map((h) => ({
          ...h,
          changedAt: h.changedAt.toISOString(),
        }))}
        enrollments={enrollments.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        }))}
        refs={refs}
        perms={{ showContact, canEditStatus, canRevenue, canInteract }}
      />
    </div>
  );
}

function maskPhone(p: string | null): string | null {
  if (!p) return null;
  return p.length > 4 ? p.slice(0, 3) + "****" + p.slice(-2) : "***";
}
