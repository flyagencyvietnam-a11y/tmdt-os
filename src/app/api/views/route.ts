import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";

const ENTITIES = ["LEADS", "CAMPAIGNS", "TASKS", "DAILY_METRICS", "ENROLLMENTS"] as const;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const entity = new URL(req.url).searchParams.get("entity");
  const rows = await db
    .select()
    .from(savedViews)
    .where(
      and(
        entity ? eq(savedViews.entity, entity as (typeof ENTITIES)[number]) : undefined,
        or(eq(savedViews.ownerId, user.id), eq(savedViews.visibility, "SHARED")),
      ),
    );
  return NextResponse.json({ views: rows });
}

const createSchema = z.object({
  entity: z.enum(ENTITIES),
  name: z.string().min(1).max(120),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("PRIVATE"),
  config: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().default(false),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const [row] = await db
    .insert(savedViews)
    .values({ ...parsed.data, ownerId: user.id })
    .returning();
  return NextResponse.json({ view: row });
}
