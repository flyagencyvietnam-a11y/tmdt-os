import { requireRole } from "@/lib/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Nhập liệu — VMG MKT OS" };

export default async function ImportPage() {
  const user = await requireRole("admin", "manager");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nhập liệu bằng file template</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 10 — tải lên → kiểm tra → xem trước → xác nhận. Nạp lại đúng file cũ không
          tạo trùng, không ghi đè trường đã sửa tay (T1/T3). T5–T9 (Request/Content/Media/
          Foundation/Catalog) để Phase 2.
        </p>
      </div>
      <ImportWizard isAdmin={user.role === "admin"} />
    </div>
  );
}
