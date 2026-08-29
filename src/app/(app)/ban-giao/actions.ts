"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isServiceError } from "@/lib/services/errors";
import { setEmsStudentId } from "@/lib/services/ems-handoff";

export async function setEmsAction(
  enrollmentId: string,
  emsId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRole("ADMIN", "MANAGER");
  try {
    await setEmsStudentId(db, enrollmentId, emsId, { id: user.id, role: user.role });
    revalidatePath("/ban-giao");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: isServiceError(e) ? e.message : "Có lỗi xảy ra.",
    };
  }
}
