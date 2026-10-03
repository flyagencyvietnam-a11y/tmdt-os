import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { appSettings, brands, contentWorkflowTemplates, holidays, pushSubscriptions, requestRouting, sbus, users } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";
import { isAiAssistConfigured } from "@/lib/services/ai-assist";
import { AppSettingsPanel } from "./app-settings-panel";
import { ContentWorkflowPanel } from "./content-workflow-panel";
import { JobsPanel } from "./jobs-panel";
import { RequestRoutingPanel } from "./request-routing-panel";

export const metadata = { title: "Cài đặt — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [settings, holidayRows, routing, workflowTemplates, pushCount, allSbus, allUsers, allBrands] = await Promise.all([
    db.select().from(appSettings),
    db.select().from(holidays).orderBy(asc(holidays.holidayDate)),
    db.select().from(requestRouting),
    db.select().from(contentWorkflowTemplates),
    db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions),
    db.select({ id: sbus.id, code: sbus.code }).from(sbus),
    db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.active, true)),
    db.select({ id: brands.id, code: brands.code }).from(brands),
  ]);

  const distinctPushUsers = new Set(pushCount.map((p) => p.userId)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cài đặt hệ thống</h1>
        <p className="text-sm text-muted-foreground">SPEC Mục 13.4 — chỉ admin. Ngày lễ còn sửa trực tiếp trong DB (bảng <code>holidays</code>).</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Tác vụ định kỳ — chạy ngay</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Bình thường chạy tự động theo lịch (Mục 11.2). Dùng nút dưới khi cần chạy ngay không chờ lịch đêm.
        </p>
        <JobsPanel />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Cấu hình chung</h2>
        <AppSettingsPanel settings={settings.map((s) => ({ key: s.key, description: s.description, value: s.value }))} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Web push (Mục 11.1)</div>
          <div className="text-muted-foreground">{distinctPushUsers} người dùng đã đăng ký nhận thông báo đẩy trên ít nhất 1 trình duyệt.</div>
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium">Trợ lý AI (Mục 14.4)</div>
          <div className="text-muted-foreground">
            {isAiAssistConfigured() ? "Đã cấu hình ANTHROPIC_API_KEY — tính năng đang hoạt động." : "Chưa cấu hình ANTHROPIC_API_KEY — xem trang Trợ lý AI."}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Định tuyến request ({routing.length})</h2>
        <p className="mb-2 text-xs text-muted-foreground">SPEC Mục 7.4 — (loại request, SBU tuỳ chọn) → người tiếp nhận.</p>
        <RequestRoutingPanel
          routing={routing.map((r) => ({ id: r.id, requestType: r.requestType, sbuId: r.sbuId, assigneeId: r.assigneeId, defaultSlaDays: r.defaultSlaDays }))}
          sbus={allSbus}
          users={allUsers}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Quy trình content ({workflowTemplates.length})</h2>
        <p className="mb-2 text-xs text-muted-foreground">SPEC Mục 7.2/13.4 — chưa cấu hình riêng thì dùng mặc định: Soạn nội dung (-3 NLV), Thiết kế (-2 NLV), Duyệt (-1 NLV), Đăng bài (đúng ngày).</p>
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
