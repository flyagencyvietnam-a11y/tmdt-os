import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { UsersManager } from "./users-manager";

export const metadata = { title: "Người dùng — VMG TMĐT OS" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requireRole("ADMIN");
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      jobTitle: users.jobTitle,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.fullName));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Người dùng</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý tài khoản & vai trò. SPEC Mục 3 — chỉ ADMIN. Nghỉ việc thì tắt, không
          xóa.
        </p>
      </div>
      <UsersManager rows={rows} currentUserId={me.id} />
    </div>
  );
}
