import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { getConfirmationToken } from "@/lib/services/confirmation-tokens";
import { ConfirmActions } from "./confirm-actions";

export const metadata = { title: "Xác nhận task — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await getConfirmationToken(db, token);

  if (!row) return <Shell>Liên kết không hợp lệ.</Shell>;
  if (row.usedAt) return <Shell>Liên kết này đã được dùng trước đó.</Shell>;
  if (row.expiresAt < new Date()) return <Shell>Liên kết đã hết hạn (quá 7 ngày).</Shell>;

  const [task] = await db.select().from(tasks).where(eq(tasks.id, row.taskId)).limit(1);
  if (!task) return <Shell>Không tìm thấy task.</Shell>;

  return (
    <Shell>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{task.code}</div>
        <h1 className="text-lg font-semibold">{task.title}</h1>
        {task.dueDate && <p className="text-sm text-muted-foreground">Hạn: {task.dueDate}</p>}
      </div>
      <ConfirmActions token={token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand">VMG MKT OS</div>
        {children}
      </div>
    </div>
  );
}
