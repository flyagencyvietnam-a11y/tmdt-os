import { sql } from "drizzle-orm";
import type { AnyDb } from "./metrics";
import { campaigns, leads } from "@/lib/db/schema";
import { vnDayStr } from "@/lib/time";

/**
 * Mã lead: L-YYMM-NNNN (SPEC Mục 7.5). NNNN chạy theo tháng, đủ 4 chữ số.
 * Dùng advisory-lock nhẹ bằng cách đếm bản ghi trong tháng + retry khi trùng.
 */
export async function nextLeadCode(db: AnyDb, receivedAt: Date): Promise<string> {
  const ym = vnDayStr(receivedAt).slice(2, 7).replace("-", ""); // "YYMM"
  const prefix = `L-${ym}-`;
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(leads)
    .where(sql`${leads.code} like ${prefix + "%"}`);
  const n = Number(row?.c ?? 0) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Mã campaign nội bộ: {PRODUCT}-{CHANNEL}-{OBJECTIVE}-{YYMM}-{SEQ} (SPEC Mục 7.3.1).
 * Không cho sửa tay.
 */
export async function nextCampaignCode(
  db: AnyDb,
  opts: {
    productCode: string;
    channel: string;
    objective: string | null;
    startedOn: string; // YYYY-MM-DD
  },
): Promise<string> {
  const obj = (opts.objective ?? "KHAC")
    .replace("MESSAGE", "MSG")
    .replace("LEADFORM", "LEADFORM")
    .replace("TRAFFIC", "TRAFFIC");
  const ym = opts.startedOn.slice(2, 7).replace("-", "");
  const prefix = `${opts.productCode}-${opts.channel}-${obj}-${ym}-`;
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(campaigns)
    .where(sql`${campaigns.internalCode} like ${prefix + "%"}`);
  const n = Number(row?.c ?? 0) + 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}
