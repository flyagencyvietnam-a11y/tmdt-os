import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isAiAssistConfigured } from "@/lib/services/ai-assist";
import { AiAssistView } from "./ai-assist-view";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Trợ lý AI — VMG MKT OS" };
export const dynamic = "force-dynamic";

/** SPEC Mục 14.4 (Phase 3) — tách tài liệu kế hoạch thành action plan, LUÔN có bước người duyệt. */
export default async function AiAssistPage() {
  await requireRole("admin", "manager");
  const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true));

  return (
    <div className="space-y-4">
      <PageHeader title="Trợ lý AI" description="Dán tài liệu kế hoạch, AI gợi ý danh sách việc. Bạn xem, sửa, chọn người phụ trách rồi mới tạo task." />
      {!isAiAssistConfigured() && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          Chưa cấu hình <code>ANTHROPIC_API_KEY</code> trong biến môi trường — tính năng này chưa dùng
          được. Thêm key vào <code>.env.local</code> rồi khởi động lại app.
        </div>
      )}
      <AiAssistView users={allUsers} configured={isAiAssistConfigured()} />
    </div>
  );
}
