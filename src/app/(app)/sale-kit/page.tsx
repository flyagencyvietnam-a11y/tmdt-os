import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listSaleKit } from "@/lib/services/sale-kit";
import { getFormRefs } from "@/lib/services/refs";
import { SaleKitBrowser } from "./sale-kit-browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sale Enablement — VMG TMĐT OS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const canManage = can(user.role, "saleEnablement", "create");

  const [items, refs] = await Promise.all([
    listSaleKit(db, {
      forEc: !canManage,
      q: sp.q,
      productId: sp.product,
    }),
    getFormRefs(db),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sale Enablement</h1>
        <p className="text-sm text-muted-foreground">
          Tra cứu nhanh khi tư vấn. Chỉ nội dung đã duyệt & còn hạn hiển thị cho EC. Có
          nút sao chép để dán vào Zalo/Messenger (SPEC Mục 15).
        </p>
      </div>
      <SaleKitBrowser
        items={items.map((i) => ({
          id: i.id,
          category: i.category,
          productId: i.productId,
          title: i.title,
          body: i.body,
          linkUrl: i.linkUrl,
          validUntil: i.validUntil,
          status: i.status,
          expired: i.expired,
        }))}
        products={refs.products}
        canManage={canManage}
        initialQ={sp.q ?? ""}
      />
    </div>
  );
}
