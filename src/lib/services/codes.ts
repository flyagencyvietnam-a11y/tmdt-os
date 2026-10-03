import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { mediaShoots, requests, tasks } from "@/lib/db/schema";

/** Mã task: T-000123 (Mục 4.2). */
export async function nextTaskCode(db: DB): Promise<string> {
  const [row] = await db
    .select({ maxN: sql<number>`coalesce(max(substring(${tasks.code} from '[0-9]+')::int), 0)` })
    .from(tasks);
  const n = Number(row?.maxN ?? 0) + 1;
  return `T-${String(n).padStart(6, "0")}`;
}

/** Mã request: REQ-0001 (Mục 4.2). */
export async function nextRequestCode(db: DB): Promise<string> {
  const [row] = await db
    .select({ maxN: sql<number>`coalesce(max(substring(${requests.code} from '[0-9]+')::int), 0)` })
    .from(requests);
  const n = Number(row?.maxN ?? 0) + 1;
  return `REQ-${String(n).padStart(4, "0")}`;
}

/** Mã đợt quay: tiền tố SHOOT-0001 (Mục 7.3, mã tự chọn — đây là gợi ý mặc định). */
export async function nextShootCode(db: DB): Promise<string> {
  const [row] = await db
    .select({ maxN: sql<number>`coalesce(max(substring(${mediaShoots.code} from '[0-9]+')::int), 0)` })
    .from(mediaShoots);
  const n = Number(row?.maxN ?? 0) + 1;
  return `SHOOT-${String(n).padStart(4, "0")}`;
}
