import type { TagColor } from "@/components/data-grid/tag";

/**
 * Màu cố định cho 7 brand đã seed (scripts/seed.ts) — dùng chung cho List và
 * Lịch content để phân biệt bằng màu sắc theo yêu cầu. Brand mới (chưa có
 * trong map) rơi vào FALLBACK_PALETTE theo thứ tự xuất hiện, ổn định trong 1
 * lần render (không đổi màu lung tung giữa các lượt tải trang).
 */
export const BRAND_COLORS: Record<string, TagColor> = {
  VMG: "red",
  VMG_IELTS: "blue",
  VMG_TESOL: "violet",
  VMG_TRUNG: "orange",
  VMP: "emerald",
  VMT: "purple",
  UPLEARN: "teal",
};

const FALLBACK_PALETTE: TagColor[] = ["slate", "cyan", "lime", "pink", "indigo", "yellow", "gray"];

export function colorForBrand(code: string, fallbackIndex = 0): TagColor {
  return BRAND_COLORS[code] ?? FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
}

/** Kênh đăng — SPEC Mục 9.6 + yêu cầu chủ sản phẩm: mỗi brand/product có 1 Fanpage riêng (phân biệt qua cột Brand, không phải tên kênh). */
export const CHANNEL_OPTIONS = ["Fanpage", "TikTok", "Zalo", "Website", "YouTube", "Khác"] as const;
export type ContentChannel = (typeof CHANNEL_OPTIONS)[number];

export const CHANNEL_COLORS: Record<string, TagColor> = {
  Fanpage: "sky",
  TikTok: "pink",
  Zalo: "blue",
  Website: "slate",
  YouTube: "red",
  Khác: "gray",
};

export function colorForChannel(channel: string): TagColor {
  return CHANNEL_COLORS[channel] ?? "gray";
}
