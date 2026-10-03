import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { appSettings, holidays } from "@/lib/db/schema";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Cài đặt — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const [settings, holidayRows] = await Promise.all([
    db.select().from(appSettings),
    db.select().from(holidays).orderBy(asc(holidays.holidayDate)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cài đặt hệ thống</h1>
        <p className="text-sm text-muted-foreground">SPEC Mục 13.4 — chỉ admin. Phiên bản xem, sửa trực tiếp trong DB ở đợt này.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Cấu hình chung</h2>
        <div className="divide-y rounded-lg border text-sm">
          {settings.map((s) => (
            <div key={s.key} className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="font-medium">{s.key}</div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
              </div>
              <code className="text-xs">{JSON.stringify(s.value)}</code>
            </div>
          ))}
        </div>
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
