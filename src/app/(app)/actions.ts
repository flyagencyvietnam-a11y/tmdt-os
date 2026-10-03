"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { markAllRead, markRead } from "@/lib/services/notifications";

export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}

export async function markNotificationReadAction(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await markRead(db, id, user.id);
}

export async function markAllNotificationsReadAction() {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllRead(db, user.id);
}
