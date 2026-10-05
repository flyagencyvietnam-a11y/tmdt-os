import { requireUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";
import { canSee } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { listFoundationGrid } from "@/lib/services/foundation";
import { FoundationGrid } from "./foundation-grid";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Nền tảng — VMG MKT OS" };
export const dynamic = "force-dynamic";

export default async function FoundationPage() {
  const user = await requireUser();
  if (!canSee(user.role, "foundation")) redirect("/khong-co-quyen");

  const { brands, entries } = await listFoundationGrid(db);
  const canEdit = isStaff(user.role);

  return (
    <div className="space-y-4">
      <PageHeader title="Nền tảng brand" description="Các cấu phần nền tảng của từng brand/sản phẩm. Mỗi lần sửa đều được lưu lịch sử." />
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
