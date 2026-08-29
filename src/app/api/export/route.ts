import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildXlsx } from "@/lib/export-xlsx";

const schema = z.object({
  filename: z.string().min(1).max(120),
  entity: z.string().max(60).optional(),
  sheets: z
    .array(
      z.object({
        name: z.string(),
        columns: z.array(
          z.object({ header: z.string(), key: z.string(), width: z.number().optional() }),
        ),
        rows: z.array(z.record(z.string(), z.unknown())),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { filename, entity, sheets } = parsed.data;
  const totalRows = sheets.reduce((n, s) => n + s.rows.length, 0);

  // SPEC Mục 16.1 / 7.12 — mọi lần export ghi audit kèm số dòng.
  await writeAudit(db, {
    actorId: user.id,
    entity: entity ?? "export",
    action: "EXPORT",
    changes: { format: "xlsx", rows: totalRows, filename },
  });

  const buf = await buildXlsx(sheets);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}.xlsx"`,
    },
  });
}
