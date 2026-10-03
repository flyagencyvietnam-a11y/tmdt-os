import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus, users } from "@/lib/db/schema";

export const metadata = { title: "SBU — VMG MKT OS" };
export const dynamic = "force-dynamic";

const REGION_LABEL: Record<string, string> = {
  KV1: "Khu vực 1",
  KV2: "Khu vực 2",
  KV3: "Khu vực 3",
  KV2_KV3: "Khu vực 2/3",
  ONLINE: "Online",
  RND: "Nhóm nội bộ",
};

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
      <div>
        <h1 className="text-xl font-semibold">SBU</h1>
        <p className="text-sm text-muted-foreground">12 đầu mối SBU (SPEC Mục 15). Ma trận hạng mục đầy đủ để Phase 2.</p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Khu vực</th>
              <th className="px-3 py-2">HO phụ trách</th>
              <th className="px-3 py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">
                  <a href={`/sbu/${s.id}`} className="hover:underline">
                    {s.code}
                  </a>
                </td>
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{REGION_LABEL[s.region] ?? s.region}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.ownerName ?? "—"}</td>
                <td className="px-3 py-2">{s.active ? "Hoạt động" : "Ngừng"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
