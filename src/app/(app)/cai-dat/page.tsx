import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { appSettings, brands, contentWorkflowTemplates, holidays, pushSubscriptions, users } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { isAiAssistConfigured } from "@/lib/services/ai-assist";
import { AppSettingsPanel } from "./app-settings-panel";
import { ContentWorkflowPanel } from "./content-workflow-panel";
import { JobsPanel } from "./jobs-panel";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Cài đặt — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [settings, holidayRows, workflowTemplates, pushCount, allUsers, allBrands] = await Promise.all([
    db.select().from(appSettings),
    db.select().from(holidays).orderBy(asc(holidays.holidayDate)),
    db.select().from(contentWorkflowTemplates),
    db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select({ id: brands.id, code: brands.code }).from(brands),
  ]);

  const distinctPushUsers = new Set(pushCount.map((p) => p.userId)).size;

  return (
    <div className="space-y-6">
      <PageHeader title="Cài đặt hệ thống" description="Cấu hình chung, quy trình content và tác vụ định kỳ." />

      <div>
        <h2 className="mb-2 text-sm font-semibold">Tác vụ định kỳ — chạy ngay</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Bình thường chạy tự động theo lịch. Dùng nút dưới khi cần chạy ngay không chờ lịch đêm.
        </p>
        <JobsPanel />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Cấu hình chung</h2>
        {/* Khoá VAPID do hệ thống tự sinh — KHÔNG gửi xuống trình duyệt (private key là bí mật). */}
        <AppSettingsPanel settings={settings.filter((s) => !s.key.startsWith("vapid_")).map((s) => ({ key: s.key, description: s.description, value: s.value }))} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Web push</div>
          <div className="text-muted-foreground">{distinctPushUsers} người dùng đã đăng ký nhận thông báo đẩy trên ít nhất 1 trình duyệt.</div>
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Trợ lý AI</div>
          <div className="text-muted-foreground">
            {isAiAssistConfigured() ? "Đã cấu hình ANTHROPIC_API_KEY — tính năng đang hoạt động." : "Chưa cấu hình ANTHROPIC_API_KEY — xem trang Trợ lý AI."}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Quy trình content ({workflowTemplates.length})</h2>
        <p className="mb-2 text-xs text-muted-foreground">chưa cấu hình riêng thì dùng mặc định: Soạn nội dung (-3 NLV), Thiết kế (-2 NLV), Duyệt (-1 NLV), Đăng bài (đúng ngày).</p>
        <ContentWorkflowPanel
          templates={workflowTemplates.map((w) => ({ id: w.id, brandId: w.brandId, channel: w.channel, steps: w.steps as never }))}
          brands={allBrands}
          users={allUsers}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Ngày lễ ({holidayRows.length})</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Chỉ seed ngày dương lịch cố định. Tết Nguyên Đán / Giỗ Tổ Hùng Vương chưa có — thêm
          thủ công vào bảng <code>holidays</code> khi có lịch nghỉ chính thức.
        </p>
        <div className="grid grid-cols-2 gap-1 rounded-lg border p-3 text-sm sm:grid-cols-4">
          {holidayRows.map((h) => (
            <div key={h.id}>
              {fmtDate(h.holidayDate)} — {h.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
