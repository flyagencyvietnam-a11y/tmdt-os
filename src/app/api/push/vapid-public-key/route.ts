import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getOrCreateVapidKeys } from "@/lib/services/push";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { publicKey } = await getOrCreateVapidKeys(db);
  return NextResponse.json({ publicKey });
}
