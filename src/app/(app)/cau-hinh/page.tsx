import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listProductConfigs } from "@/lib/services/product-config";
import { ProductConfigTable } from "./product-config-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cấu hình sản phẩm & ngưỡng — VMG TMĐT OS" };

export default async function Page() {
  await requireRole("ADMIN", "MANAGER");
  const rows = await listProductConfigs(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Cấu hình sản phẩm & ngưỡng CPMQL</h1>
        <p className="text-sm text-muted-foreground">
          Ngưỡng CPMQL theo <b>từng sản phẩm</b> (SPEC Mục 9.5), không phải hằng số toàn
          cục. Cột “Ngưỡng gợi ý” = giá niêm yết × room CAC% × tỷ lệ MQL→Chốt 90 ngày
          thực tế — để tham chiếu khi chỉnh.
        </p>
      </div>
      <ProductConfigTable rows={rows} />
    </div>
  );
}
