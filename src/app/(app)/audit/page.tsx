import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireRole("ADMIN", "MANAGER");

  const rows = await db
    .select({
      id: auditLogs.id,
      occurredAt: auditLogs.occurredAt,
      actor: users.fullName,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      changes: auditLogs.changes,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .orderBy(desc(auditLogs.occurredAt))
    .limit(200);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nhật ký kiểm toán</h1>
        <p className="text-sm text-muted-foreground">
          200 bản ghi gần nhất. SPEC Mục 18.2 — chỉ ADMIN/MANAGER xem được.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Thời điểm</th>
              <th className="px-3 py-2">Người thực hiện</th>
              <th className="px-3 py-2">Đối tượng</th>
              <th className="px-3 py-2">Hành động</th>
              <th className="px-3 py-2">Thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Chưa có bản ghi nào.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="whitespace-nowrap px-3 py-2">
                  {fmtDateTime(r.occurredAt)}
                </td>
                <td className="px-3 py-2">{r.actor ?? "hệ thống"}</td>
                <td className="px-3 py-2">
                  {r.entity}
                  {r.entityId ? ` · ${String(r.entityId).slice(0, 8)}` : ""}
                </td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="max-w-md truncate px-3 py-2 text-xs text-muted-foreground">
                  {r.changes ? JSON.stringify(r.changes) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
