"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth/auth";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { runAllMorningJobs } from "@/lib/services/jobs";
import {
  markAllRead as markAllReadSvc,
  markRead as markReadSvc,
} from "@/lib/services/notifications";
import { getCurrentUser } from "@/lib/auth/session";

export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}

/** ADMIN bấm "chạy tác vụ ngay" — chạy digest quá hạn + rà R1-R5 + Cold Data (SPEC 17.2). */
export async function runMorningJobsAction() {
  await requireRole("ADMIN", "MANAGER");
  const r = await runAllMorningJobs(db);
  revalidatePath("/");
  revalidatePath("/thong-bao");
  return {
    ok: true as const,
    summary:
      `Quá hạn: ${r.overdue.createdNotifications} tb / ${r.overdue.affected} lead. ` +
      `Cảnh báo: ${r.alerts.createdNotifications} tb / ${r.alerts.affected} campaign. ` +
      `Cold Data: ${r.cold.affected} lead.`,
  };
}

export async function markNotificationReadAction(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await markReadSvc(db, id, user.id);
  revalidatePath("/thong-bao");
}

export async function markAllNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllReadSvc(db, user.id);
  revalidatePath("/thong-bao");
}
