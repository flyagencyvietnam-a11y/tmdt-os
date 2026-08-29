import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  // Chỉ chủ sở hữu mới xóa được view.
  await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.ownerId, user.id)));
  return NextResponse.json({ ok: true });
}
