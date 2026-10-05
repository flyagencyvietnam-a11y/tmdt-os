import { asc, eq } from "drizzle-orm";
import { isFanOutSbu } from "@/lib/sbu-kinds";
import { Grid3x3 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ExportMenu } from "@/components/report/export-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus, users } from "@/lib/db/schema";
import { emptySbuStats, getSbuStats } from "@/lib/services/sbu-overview";
import { todayVnDayStr } from "@/lib/time";
import { SbuGrid } from "./sbu-grid";

export const metadata = { title: "SBU — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function SbuPage() {
  const user = await requireUser();
  const today = todayVnDayStr();
  const rows0 = await db
    .select({ id: sbus.id, kind: sbus.kind, hoOwnerId: sbus.hoOwnerId })
    .from(sbus);
  const [rows, { stats, catalogCount }] = await Promise.all([
    db
      .select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind, region: sbus.region, active: sbus.active, hoOwnerId: sbus.hoOwnerId, ownerName: users.fullName })
      .from(sbus)
      .leftJoin(users, eq(users.id, sbus.hoOwnerId))
      .orderBy(asc(sbus.code)),
    getSbuStats(db, today, new Set(rows0.filter(isFanOutSbu).map((r) => r.id))),
  ]);

  const visible = (user.role === "center_contributor" ? rows.filter((r) => r.id === user.sbuId) : rows).map((r) => ({ ...r, ...(stats.get(r.id) ?? emptySbuStats(isFanOutSbu(r) ? catalogCount : 0)) }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="SBU"
        description="SBU gồm các trung tâm và các brand/sản phẩm (VMG, VMG IELTS, VMG TESOL, VMG Tiếng Trung, VMP, VMT, UpLearn): người phụ trách HO, campaign, tiến độ công việc, hạng mục kỳ này, request, cảnh báo giám sát và chỉ số brand."
        actions={
          user.role !== "center_contributor" && (
            <>
              <ExportMenu kind="sbu" />
              <Link href="/sbu/matrix" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Grid3x3 className="mr-1 h-4 w-4" /> Ma trận hạng mục × SBU
              </Link>
            </>
          )
        }
      />
      <SbuGrid rows={visible} period={today.slice(0, 7)} />
    </div>
  );
}
