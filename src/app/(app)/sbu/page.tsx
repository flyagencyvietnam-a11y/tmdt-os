import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus, users } from "@/lib/db/schema";
import { SbuGrid } from "./sbu-grid";

export const metadata = { title: "SBU — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function SbuPage() {
  const user = await requireUser();
  const rows = await db
    .select({ id: sbus.id, code: sbus.code, name: sbus.name, kind: sbus.kind, region: sbus.region, active: sbus.active, ownerName: users.fullName })
    .from(sbus)
    .leftJoin(users, eq(users.id, sbus.hoOwnerId))
    .orderBy(asc(sbus.code));

  const visible = user.role === "center_contributor" ? rows.filter((r) => r.id === user.sbuId) : rows;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">SBU</h1>
          <p className="text-sm text-muted-foreground">12 đầu mối SBU (SPEC Mục 15).</p>
        </div>
        {user.role !== "center_contributor" && (
          <Link href="/sbu/matrix" className="text-sm text-brand hover:underline">
            Xem ma trận hạng mục × SBU →
          </Link>
        )}
      </div>
      <SbuGrid rows={visible} />
    </div>
  );
}
