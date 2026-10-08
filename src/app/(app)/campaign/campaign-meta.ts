/** Nhãn/màu dùng chung cho trang chi tiết campaign (thuần, dùng được cả server lẫn client). */

export const CAMPAIGN_TYPE_LABEL: Record<string, string> = {
  brand_theme: "Brand Theme",
  product_gtm: "GTM sản phẩm",
  business_program: "Chương trình kinh doanh",
  rebrand: "Rebrand",
  data_program: "Dữ liệu",
  internal_program: "Nội bộ",
  other: "Khác",
};

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  planned: "Đã lên kế hoạch",
  preparing: "Đang chuẩn bị",
  running: "Đang chạy",
  paused: "Tạm dừng",
  done: "Hoàn tất",
  cancelled: "Huỷ",
  needs_confirmation: "Cần xác nhận",
};

export const CAMPAIGN_STATUS_TONE: Record<string, string> = {
  planned: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  preparing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  running: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  paused: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  done: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
  needs_confirmation: "bg-red-500/12 text-red-700 dark:text-red-400",
};

/** Các khối thông tin của campaign, theo thứ tự hiển thị. `wide` = chiếm cả hàng. */
export const CAMPAIGN_INFO_FIELDS = [
  { key: "objective", label: "Mục tiêu", wide: true },
  { key: "tagline", label: "Thông điệp / tagline", wide: false },
  { key: "occasion", label: "Dịp / bối cảnh", wide: false },
  { key: "targetAudience", label: "Đối tượng", wide: false },
  { key: "insightMessage", label: "Insight & thông điệp", wide: false },
  { key: "heroActivity", label: "Hero activity", wide: true },
  { key: "cta", label: "CTA", wide: false },
  { key: "channels", label: "Kênh", wide: false },
  { key: "roleSplit", label: "Phân vai (MKT HO / Trung tâm)", wide: true },
  { key: "budgetNote", label: "Ngân sách", wide: false },
  { key: "kpiNote", label: "KPI / chỉ số theo dõi", wide: false },
  { key: "notes", label: "Ghi chú", wide: true },
  { key: "sourceNote", label: "Nguồn dữ liệu", wide: true },
] as const;

export type CampaignInfoKey = (typeof CAMPAIGN_INFO_FIELDS)[number]["key"];
