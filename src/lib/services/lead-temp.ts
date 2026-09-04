import { and, eq, isNull } from "drizzle-orm";
import { leads } from "@/lib/db/schema";
import { scoreLead } from "./lead-score";
import type { AnyDb } from "./metrics";

export type TempBand = "hot" | "warm" | "cool" | "cold";
export interface TempBands {
  hot: number;
  warm: number;
  cool: number;
  cold: number;
  total: number;
}
function emptyBands(): TempBands {
  return { hot: 0, warm: 0, cool: 0, cold: 0, total: 0 };
}

export interface LeadTempBreakdown {
  /** Toàn bộ lead OPEN theo nhiệt độ. */
  total: TempBands;
  /** Lead Nóng nhưng chưa đặt Ngày LH lại — cần đặt lịch ngay. */
  hotNoSchedule: number;
  byUser: { userId: string; bands: TempBands }[];
  byProduct: { productId: string; bands: TempBands }[];
}

/**
 * Gom lead đang OPEN theo "nhiệt độ" (`scoreLead().band`) — tổng, theo người phụ
 * trách, theo sản phẩm. Tính trong JS trên vài trăm bản ghi, 1 truy vấn.
 * Không phụ thuộc bộ lọc thời gian (phản ánh trạng thái hiện tại).
 */
export async function getLeadTempBreakdown(
  db: AnyDb,
  now = new Date(),
): Promise<LeadTempBreakdown> {
  const rows = await db
    .select({
      stage: leads.stage,
      maxStage: leads.maxStage,
      outcome: leads.outcome,
      silenceCount: leads.silenceCount,
      phone: leads.phone,
      nextContactDate: leads.nextContactDate,
      lastContactedAt: leads.lastContactedAt,
      source: leads.source,
      isCold: leads.isCold,
      assignedTo: leads.assignedTo,
      productId: leads.productId,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        eq(leads.outcome, "OPEN"),
      ),
    );

  const total = emptyBands();
  const uMap = new Map<string, TempBands>();
  const pMap = new Map<string, TempBands>();
  let hotNoSchedule = 0;

  const bump = (b: TempBands, band: TempBand) => {
    b[band]++;
    b.total++;
  };

  for (const r of rows) {
    const { band } = scoreLead(
      {
        stage: r.stage,
        maxStage: r.maxStage,
        outcome: r.outcome,
        silenceCount: r.silenceCount,
        phone: r.phone,
        nextContactDate: r.nextContactDate,
        lastContactedAt: r.lastContactedAt,
        source: r.source,
        isCold: r.isCold,
      },
      now,
    );
    bump(total, band);
    if (band === "hot" && !r.nextContactDate) hotNoSchedule++;
    if (r.assignedTo) {
      const b = uMap.get(r.assignedTo) ?? emptyBands();
      bump(b, band);
      uMap.set(r.assignedTo, b);
    }
    if (r.productId) {
      const b = pMap.get(r.productId) ?? emptyBands();
      bump(b, band);
      pMap.set(r.productId, b);
    }
  }

  return {
    total,
    hotNoSchedule,
    byUser: [...uMap].map(([userId, bands]) => ({ userId, bands })),
    byProduct: [...pMap].map(([productId, bands]) => ({ productId, bands })),
  };
}
