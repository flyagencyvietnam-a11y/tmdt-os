import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sbus, users } from "@/lib/db/schema";
import { UsersManager } from "./users-manager";

export const metadata = { title: "Người dùng — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireRole("admin");
  const [rows, sbuRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        sbuId: users.sbuId,
        canAssign: users.canAssign,
        active: users.active,
        mustChangePassword: users.mustChangePassword,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(asc(users.fullName)),
    db.select({ id: sbus.id, code: sbus.code, name: sbus.name }).from(sbus).orderBy(asc(sbus.code)),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Người dùng</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý tài khoản &amp; vai trò (SPEC Mục 3) — chỉ admin. Nghỉ việc thì tắt, không
          xóa.
        </p>
      </div>
      <UsersManager rows={rows} sbus={sbuRows} currentUserId={me.id} />
    </div>
  );
}
