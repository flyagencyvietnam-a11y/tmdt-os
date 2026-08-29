"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import {
  updateProductConfig,
  type ProductConfigPatch,
} from "@/lib/services/product-config";

export async function updateProductConfigAction(
  productId: string,
  patch: ProductConfigPatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRole("ADMIN", "MANAGER");
  try {
    await updateProductConfig(db, productId, patch, {
      id: user.id,
      role: user.role,
    });
    revalidatePath("/cau-hinh");
    revalidatePath("/campaign");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: isServiceError(e) ? e.message : "Có lỗi xảy ra.",
    };
  }
}
