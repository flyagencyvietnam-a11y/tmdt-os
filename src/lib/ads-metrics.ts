/**
 * Công thức Ads THUẦN (không đụng DB) — dùng chung cho server (lib/services/ads.ts)
 * và client (/ads). CPL/CAC/CVR/ROAS/CPMQL + điểm hiệu quả đều SUY RA tại chỗ,
 * không lưu cột (cùng nguyên tắc `overdue`, SPEC Mục 4.2). Ngưỡng điểm lấy từ
 * app_settings.ads_effectiveness_rubric (server truyền xuống client).
 */

/** Các trường tối thiểu để suy ra chỉ số (khớp cột ads_metrics, số dạng chuỗi numeric). */
export interface AdsMetricLike {
  line: string;
  budget: string | null;
  centerOrderBudget: string | null;
  hoTopupBudget: string | null;
  leads: string | null;
  newStudents: string | null;
  revenue: string | null;
  mql: string | null;
}

export type EffectivenessTier = 5 | 4 | 3 | 2 | 1;
export interface EffectivenessRubric {
  /** Ngưỡng CPL tối đa cho điểm 5/4/3/2 (điểm 1 = còn lại). */
  cplTiers: [number, number, number, number];
  /** Ngưỡng CAC tối đa cho điểm 5/4/3/2 (điểm 1 = còn lại). */
  cacTiers: [number, number, number, number];
  /** Nếu HVM=0: CPL > ngưỡng này → 1 điểm, ngược lại 2 điểm. */
  noConversionCplThreshold: number;
}

/** Mặc định = đúng ngưỡng thật đang dùng (sheet "TỔNG HỢP T7-T9", cột N-Q). */
export const DEFAULT_EFFECTIVENESS_RUBRIC: EffectivenessRubric = {
  cplTiers: [250000, 400000, 500000, 650000],
  cacTiers: [1800000, 2500000, 3500000, 4500000],
  noConversionCplThreshold: 400000,
};

export function tierScore(value: number, tiers: [number, number, number, number]): EffectivenessTier {
  if (value <= tiers[0]) return 5;
  if (value <= tiers[1]) return 4;
  if (value <= tiers[2]) return 3;
  if (value <= tiers[3]) return 2;
  return 1;
}

export const EFFECTIVENESS_LABELS = ["Kém hiệu quả", "Cần tối ưu", "Chấp nhận được", "Hiệu quả", "Rất hiệu quả"] as const;

export function effectivenessLabel(score: number | null): string {
  if (score == null) return "Chưa đủ dữ liệu";
  if (score >= 4.5) return "Rất hiệu quả";
  if (score >= 3.5) return "Hiệu quả";
  if (score >= 2.5) return "Chấp nhận được";
  if (score >= 1.5) return "Cần tối ưu";
  return "Kém hiệu quả";
}

export interface AdsDerived {
  totalBudget: number | null;
  cpl: number | null;
  cac: number | null;
  cvr: number | null;
  roas: number | null;
  cpmql: number | null;
  effectivenessScore: number | null;
  effectivenessLabel: string;
}

/** Suy ra CPL/CAC/CVR/ROAS/CPMQL + điểm hiệu quả từ 1 dòng ads_metrics — đúng công thức sheet gốc. */
export function computeAdsDerived(row: AdsMetricLike, rubric: EffectivenessRubric = DEFAULT_EFFECTIVENESS_RUBRIC): AdsDerived {
  const totalBudget =
    row.line === "b2c_center"
      ? (row.centerOrderBudget ? Number(row.centerOrderBudget) : 0) + (row.hoTopupBudget ? Number(row.hoTopupBudget) : 0)
      : row.budget != null
        ? Number(row.budget)
        : null;
  const leads = row.leads != null ? Number(row.leads) : null;
  const newStudents = row.newStudents != null ? Number(row.newStudents) : null;
  const mql = row.mql != null ? Number(row.mql) : null;
  const revenue = row.revenue != null ? Number(row.revenue) : null;

  const cpl = totalBudget != null && leads ? Math.round(totalBudget / leads) : null;
  const cac = totalBudget != null && newStudents ? Math.round(totalBudget / newStudents) : null;
  const cvr = leads && newStudents != null ? newStudents / leads : null;
  const roas = totalBudget && revenue != null ? revenue / totalBudget : null;
  const cpmql = totalBudget != null && mql ? Math.round(totalBudget / mql) : null;

  let effectivenessScore: number | null = null;
  if (leads != null && newStudents != null && cpl != null) {
    if (newStudents === 0) {
      effectivenessScore = cpl > rubric.noConversionCplThreshold ? 1 : 2;
    } else if (cac != null) {
      const cplTier = tierScore(cpl, rubric.cplTiers);
      const cacTier = tierScore(cac, rubric.cacTiers);
      effectivenessScore = Math.round(((cplTier + cacTier) / 2) * 10) / 10;
    }
  }

  return { totalBudget, cpl, cac, cvr, roas, cpmql, effectivenessScore, effectivenessLabel: effectivenessLabel(effectivenessScore) };
}

/**
 * Nhóm sản phẩm Ecom dùng trong báo cáo "TMĐT theo sản phẩm" (bảng
 * `ads_ecom_products`). Danh sách cố định — thêm nhóm mới thì thêm vào đây.
 */
export const ECOM_PRODUCTS = [
  { key: "tesol_epath", label: "TESOL E-PATH" },
  { key: "ft15", label: "Fast Track 1.5 (FT15)" },
  { key: "chinese", label: "Tiếng Trung" },
  { key: "flextrack", label: "FlexTrack 1-1" },
  { key: "ielts", label: "IELTS (Express + Coaching)" },
  { key: "giao_tiep", label: "Tiếng Anh Giao Tiếp" },
  { key: "other", label: "Khác (VSTEP, SAT, chưa gán SP)" },
] as const;

export type EcomProductKey = (typeof ECOM_PRODUCTS)[number]["key"];

export const ECOM_PRODUCT_LABELS: Record<string, string> = Object.fromEntries(ECOM_PRODUCTS.map((p) => [p.key, p.label]));
