import { requireUser } from "@/lib/auth/session";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listFoundationGrid } from "@/lib/services/foundation";
import { FoundationGrid } from "./foundation-grid";

export const metadata = { title: "Nền tảng — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function FoundationPage() {
  const user = await requireUser();
  if (!canSee(user.role, "foundation")) redirect("/khong-co-quyen");

  const { brands, entries } = await listFoundationGrid(db);
  const canEdit = user.role === "admin" || user.role === "manager";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Nền tảng brand/sản phẩm</h1>
        <p className="text-sm text-muted-foreground">
          SPEC Mục 9.2 — lưới cột brand, dòng cấu phần (A1..I2). Nội dung ít thay đổi; nhập
          bằng form bên dưới hoặc import T8. Mỗi lần sửa lưu bản lịch sử.
        </p>
      </div>
      <FoundationGrid
        brands={brands.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
        entries={entries.map((e) => ({
          id: e.id,
          brandId: e.brandId,
          sectionCode: e.sectionCode,
          componentCode: e.componentCode,
          componentLabel: e.componentLabel,
          content: e.content,
          status: e.status,
          version: e.version,
        }))}
        canEdit={canEdit}
      />
    </div>
  );
}
