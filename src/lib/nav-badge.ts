/** Badge số trên menu điều hướng (client-safe: chỉ kiểu + hàm định dạng). */

export interface NavBadge {
  /** Tổng điểm nóng của mục (đỏ + vàng). */
  count: number;
  /** "crit" nếu có ít nhất 1 điểm đỏ (quá hạn/thiếu), còn lại "warn" (sắp đến hạn). */
  tone: "crit" | "warn";
  /** Diễn giải ngắn, hiện khi rê chuột: "3 quá hạn · 2 đến hạn hôm nay". */
  hint: string;
}

/** Khoá = `href` của mục menu. Mục không có điểm nóng thì không có khoá. */
export type NavBadges = Record<string, NavBadge>;

/** Gộp các nhóm đếm thành 1 badge; null nếu không có gì. `parts` = [số, nhãn][] theo thứ tự quan trọng. */
export function makeBadge(crit: number, warn: number, parts: [number, string][]): NavBadge | null {
  const count = crit + warn;
  if (count <= 0) return null;
  return {
    count,
    tone: crit > 0 ? "crit" : "warn",
    hint: parts
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${n} ${label}`)
      .join(" · "),
  };
}
