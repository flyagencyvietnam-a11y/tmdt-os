import { requireRole } from "@/lib/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Nhập liệu — VMG MKT OS" };

export default async function ImportPage() {
  await requireRole("admin", "manager");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nhập liệu bằng file template</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 10 — tải lên → kiểm tra → xem trước → xác nhận. Nạp lại đúng file cũ không
          tạo trùng, không ghi đè trường đã sửa tay.
        </p>
      </div>
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Đợt này mới làm xong <strong>T3 — Task lẻ hàng loạt</strong>. T1 (Plan campaign tháng),
        T2 (Người dùng/SBU) và T4 (Quy tắc lặp) sẽ làm ở lượt kế tiếp — hiện tạo qua giao diện
        Campaign / Người dùng / Cài đặt trực tiếp.
      </div>
      <ImportWizard />
    </div>
  );
}
