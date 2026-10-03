import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reportExports } from "@/lib/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "manager" && user.role !== "viewer")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const [row] = await db.select().from(reportExports).where(eq(reportExports.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(Buffer.from(row.dataBase64, "base64")), {
    headers: {
      "content-type": row.mimeType,
      "content-disposition": `attachment; filename="${row.fileName.replace(/[^\w.-]/g, "_")}"`,
    },
  });
}
