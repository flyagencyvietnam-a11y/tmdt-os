import { and, isNull, ne, or, sql } from "drizzle-orm";
import { leads } from "@/lib/db/schema";
import type { AnyDb } from "./metrics";
import { normalizeName, normalizePhone, similarity } from "./text-normalize";

/**
 * Kiểm tra trùng lặp khi nhập lead mới — SPEC Mục 8.3.
 * KHÔNG chặn cứng: chỉ cảnh báo có xếp hạng.
 *
 * Điểm trùng (thang 100):
 *   +60  phone_normalized khớp hoàn toàn
 *   +25  name_normalized khớp hoàn toàn
 *   +15  name_normalized giống >= 85%
 *   +10  cùng product_id
 *   +10  cùng campaign_id
 *   +10  received_at cách nhau <= 7 ngày
 *   +15  email hoặc fb_profile trùng
 *
 *   >= 60  -> "red"    (mặc định gợi ý gộp)
 *   35-59  -> "yellow" (cho phép tạo mới)
 *   < 35   -> tạo bình thường
 */
export interface DedupCandidate {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  score: number;
  reasons: string[];
  receivedAt: Date;
  stage: string;
  outcome: string;
}

export interface DedupInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  fbProfile?: string | null;
  productId?: string | null;
  campaignId?: string | null;
  receivedAt?: Date;
}

export async function findDuplicates(
  db: AnyDb,
  input: DedupInput,
): Promise<{ level: "red" | "yellow" | "none"; candidates: DedupCandidate[] }> {
  const nameN = normalizeName(input.fullName);
  const phoneN = normalizePhone(input.phone);
  const received = input.receivedAt ?? new Date();

  // Thu hẹp bằng SQL: cùng phone_normalized, HOẶC cùng name_normalized,
  // HOẶC name gần đúng (prefix 4 ký tự), HOẶC email/fb trùng.
  const namePrefix = nameN.slice(0, 4);
  const rows = await db
    .select({
      id: leads.id,
      code: leads.code,
      fullName: leads.fullName,
      nameNormalized: leads.nameNormalized,
      phone: leads.phone,
      phoneNormalized: leads.phoneNormalized,
      email: leads.email,
      fbProfile: leads.fbProfile,
      productId: leads.productId,
      campaignId: leads.campaignId,
      receivedAt: leads.receivedAt,
      stage: leads.stage,
      outcome: leads.outcome,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.duplicateOf),
        or(
          phoneN ? sql`${leads.phoneNormalized} = ${phoneN}` : sql`false`,
          nameN ? sql`${leads.nameNormalized} = ${nameN}` : sql`false`,
          namePrefix
            ? sql`${leads.nameNormalized} like ${namePrefix + "%"}`
            : sql`false`,
          input.email ? sql`lower(${leads.email}) = ${input.email.toLowerCase()}` : sql`false`,
          input.fbProfile
            ? sql`lower(${leads.fbProfile}) = ${input.fbProfile.toLowerCase()}`
            : sql`false`,
        ),
      ),
    )
    .limit(50);

  const candidates: DedupCandidate[] = [];
  for (const r of rows) {
    let score = 0;
    const reasons: string[] = [];

    if (phoneN && r.phoneNormalized && r.phoneNormalized === phoneN) {
      score += 60;
      reasons.push("Trùng số điện thoại");
    }
    if (nameN && r.nameNormalized === nameN) {
      score += 25;
      reasons.push("Trùng tên");
    } else if (nameN && r.nameNormalized && similarity(nameN, r.nameNormalized) >= 0.85) {
      score += 15;
      reasons.push("Tên gần giống");
    }
    if (input.productId && r.productId === input.productId) {
      score += 10;
      reasons.push("Cùng sản phẩm");
    }
    if (input.campaignId && r.campaignId === input.campaignId) {
      score += 10;
      reasons.push("Cùng campaign");
    }
    const daysApart = Math.abs(
      (received.getTime() - new Date(r.receivedAt).getTime()) / 86_400_000,
    );
    if (daysApart <= 7) {
      score += 10;
      reasons.push("Tiếp nhận trong 7 ngày");
    }
    if (
      (input.email && r.email && input.email.toLowerCase() === r.email.toLowerCase()) ||
      (input.fbProfile &&
        r.fbProfile &&
        input.fbProfile.toLowerCase() === r.fbProfile.toLowerCase())
    ) {
      score += 15;
      reasons.push("Trùng email / Facebook");
    }

    if (score > 0)
      candidates.push({
        id: r.id,
        code: r.code,
        fullName: r.fullName,
        phone: r.phone,
        score,
        reasons,
        receivedAt: new Date(r.receivedAt),
        stage: r.stage,
        outcome: r.outcome,
      });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0]?.score ?? 0;
  const level = top >= 60 ? "red" : top >= 35 ? "yellow" : "none";
  return { level, candidates: candidates.slice(0, 5) };
}

/** Gộp lead mới vào lead cũ — SPEC Mục 8.3 "Thao tác gộp". */
export async function mergeLead(
  db: AnyDb,
  opts: { keepId: string; mergeId: string; actorId: string },
) {
  const { leadInteractions } = await import("@/lib/db/schema");
  await db
    .update(leadInteractions)
    .set({ leadId: opts.keepId })
    .where(sql`${leadInteractions.leadId} = ${opts.mergeId}`);
  await db
    .update(leads)
    .set({ duplicateOf: opts.keepId, updatedBy: opts.actorId })
    .where(and(sql`${leads.id} = ${opts.mergeId}`, ne(leads.id, opts.keepId)));
}
