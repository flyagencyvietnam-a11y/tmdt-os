import { requireRole } from "@/lib/auth/session";
import { ImportWizard } from "./import-wizard";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Nhập liệu — VMG MKT OS" };

export default async function ImportPage() {
  const user = await requireRole("admin", "manager", "member");

  return (
    <div className="space-y-4">
      <PageHeader title="Nhập liệu" description="Tải file template lên → kiểm tra → xem trước → xác nhận. Nạp lại cùng file không tạo trùng và không ghi đè chỗ đã sửa tay." />
      <ImportWizard isAdmin={user.role === "admin"} />
    </div>
  );
}
