import { asc, eq } from "drizzle-orm";
import { Grid3x3 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
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
  const [rows, { stats, catalogCount }] = await Promise.all([
    db
      .select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind, region: sbus.region, active: sbus.active, ownerName: users.fullName })
      .from(sbus)
      .leftJoin(users, eq(users.id, sbus.hoOwnerId))
      .orderBy(asc(sbus.code)),
    getSbuStats(db, today),
  ]);

  const visible = (user.role === "center_contributor" ? rows.filter((r) => r.id === user.sbuId) : rows).map((r) => ({ ...r, ...(stats.get(r.id) ?? emptySbuStats(catalogCount)) }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="SBU"
        description="Các trung tâm và đầu mối kinh doanh: người phụ trách HO, tiến độ công việc, hạng mục kỳ này, request và cảnh báo giám sát của từng SBU."
        actions={
          user.role !== "center_contributor" && (
            <Link href="/sbu/matrix" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Grid3x3 className="mr-1 h-4 w-4" /> Ma trận hạng mục × SBU
            </Link>
          )
        }
      />
      <SbuGrid rows={visible} period={today.slice(0, 7)} />
    </div>
  );
}
