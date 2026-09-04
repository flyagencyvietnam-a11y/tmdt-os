import { STAGE_RANK } from "@/lib/db/schema";
import { todayVnDayStr } from "@/lib/time";

/**
 * Chấm điểm lead theo luật (SPEC Mục 21 — Phase 4 "chấm điểm lead tự động").
 * Tính on-the-fly, không lưu DB. Thang 0–100, càng cao càng nên ưu tiên.
 */
export interface ScoreInput {
  stage: string;
  maxStage: string;
  outcome: string;
  silenceCount: number;
  phone: string | null;
  nextContactDate: string | null;
  lastContactedAt: Date | string | null;
  source: string;
  isCold: boolean;
}

export interface LeadScore {
  score: number;
  band: "hot" | "warm" | "cool" | "cold";
  factors: string[];
}

export function scoreLead(l: ScoreInput, now = new Date()): LeadScore {
  if (l.outcome === "WON") return { score: 100, band: "hot", factors: ["Đã chốt"] };
  if (l.isCold || l.outcome === "DISQUALIFIED")
    return { score: 0, band: "cold", factors: ["Cold / Không nhu cầu"] };

  const factors: string[] = [];
  let s = 10;

  // Giai đoạn cao nhất từng đạt (trọng số lớn nhất)
  const rank = STAGE_RANK[l.maxStage as keyof typeof STAGE_RANK] ?? 0;
  const stagePts = [5, 12, 22, 45, 65, 100][rank] ?? 5;
  s += stagePts;
  if (rank >= 3) factors.push(`Đã đạt ${l.maxStage}`);

  // Có SĐT
  if (l.phone) {
    s += 8;
    factors.push("Có SĐT");
  }

  // Im lặng — trừ điểm
  s -= Math.min(30, l.silenceCount * 8);
  if (l.silenceCount >= 3) factors.push(`Im lặng ${l.silenceCount} lần`);

  // Trễ hẹn chăm sóc — trừ điểm theo số ngày
  const today = todayVnDayStr(now);
  if (l.nextContactDate && l.nextContactDate < today) {
    const days = Math.round(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${l.nextContactDate}T00:00:00Z`)) /
        86_400_000,
    );
    s -= Math.min(20, days * 2);
    factors.push(`Trễ hẹn ${days} ngày`);
  }

  // Tương tác gần đây — cộng điểm
  if (l.lastContactedAt) {
    const last = new Date(l.lastContactedAt).getTime();
    const dd = (now.getTime() - last) / 86_400_000;
    if (dd <= 3) {
      s += 6;
      factors.push("Vừa tương tác");
    }
  }

  // Nguồn organic/referral thường chất lượng cao hơn
  if (l.source === "REFERRAL") {
    s += 6;
    factors.push("Nguồn giới thiệu");
  }

  const score = Math.max(0, Math.min(100, Math.round(s)));
  const band: LeadScore["band"] =
    score >= 70 ? "hot" : score >= 45 ? "warm" : score >= 20 ? "cool" : "cold";
  return { score, band, factors };
}

export const SCORE_BAND_LABEL: Record<LeadScore["band"], string> = {
  hot: "Nóng",
  warm: "Ấm",
  cool: "Nguội",
  cold: "Lạnh",
};

/** Tên màu (bảng TagColor ở components/data-grid/tag.tsx) cho từng band nhiệt độ. */
export const SCORE_BAND_COLOR: Record<LeadScore["band"], string> = {
  hot: "rose",
  warm: "amber",
  cool: "slate",
  cold: "gray",
};

export const SCORE_BANDS: LeadScore["band"][] = ["hot", "warm", "cool", "cold"];
