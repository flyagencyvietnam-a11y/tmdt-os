import { asc, eq, isNull, and } from "drizzle-orm";
import { campaigns, products, users } from "@/lib/db/schema";
import type { AnyDb } from "./metrics";

/** Danh mục dùng cho form (sản phẩm, campaign đang chạy, EC). */
export async function getFormRefs(db: AnyDb) {
  const [productList, campaignList, ecList] = await Promise.all([
    db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        isActive: products.isActive,
      })
      .from(products)
      .orderBy(asc(products.sortOrder)),
    db
      .select({
        id: campaigns.id,
        internalCode: campaigns.internalCode,
        displayName: campaigns.displayName,
        productId: campaigns.productId,
        channel: campaigns.channel,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(isNull(campaigns.deletedAt))
      .orderBy(asc(campaigns.displayName)),
    db
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(and(eq(users.isActive, true)))
      .orderBy(asc(users.fullName)),
  ]);
  return {
    products: productList,
    campaigns: campaignList,
    users: ecList,
    ecUsers: ecList.filter((u) => u.role === "EC" || u.role === "ADMIN" || u.role === "MANAGER"),
  };
}

export type FormRefs = Awaited<ReturnType<typeof getFormRefs>>;
