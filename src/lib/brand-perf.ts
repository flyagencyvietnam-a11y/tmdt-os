/**
 * Brand Performance — hằng số + công thức THUẦN (client-safe). Báo cáo hằng THÁNG, mỗi brand/sản phẩm (SBU kiểu brand)
 * có hệ thống kênh riêng; ma trận = brand × kênh × chỉ số. Chỉ số suy ra (ER, CTR, tăng trưởng follower) tính tại đây, không lưu.
 */

export type ChannelKey = "meta" | "tiktok" | "youtube" | "website" | "zalo" | "other";
export type MetricKey = "impressions" | "reach" | "engagements" | "videoViews" | "linkClicks" | "sessions" | "posts" | "followers" | "newFollowers";

export const CHANNELS: { key: ChannelKey; label: string; short: string; color: string }[] = [
  { key: "meta", label: "Meta (Facebook / Instagram)", short: "Meta", color: "#1877f2" },
  { key: "tiktok", label: "TikTok", short: "TikTok", color: "#111827" },
  { key: "youtube", label: "YouTube", short: "YouTube", color: "#dc2626" },
  { key: "website", label: "Website", short: "Website", color: "#059669" },
  { key: "zalo", label: "Zalo OA", short: "Zalo", color: "#0068ff" },
  { key: "other", label: "Kênh khác", short: "Khác", color: "#7c3aed" },
];
export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label]));
export const CHANNEL_SHORT: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.short]));

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Tiêu đề cột ngắn. */
  short: string;
  /** flow = cộng dồn trong tháng; snapshot = số dư CUỐI tháng (follower). */
  kind: "flow" | "snapshot";
  hint?: string;
}

export const METRICS: MetricDef[] = [
  { key: "impressions", label: "Impression", short: "Impression", kind: "flow", hint: "Lượt hiển thị (TikTok: lượt xem; Website: hiển thị trên tìm kiếm)" },
  { key: "reach", label: "Reach", short: "Reach", kind: "flow", hint: "Số người tiếp cận" },
  { key: "engagements", label: "Engagement", short: "Engagement", kind: "flow", hint: "Tương tác: reaction, comment, share, save, click…" },
  { key: "videoViews", label: "Video views", short: "Video views", kind: "flow" },
  { key: "linkClicks", label: "Link click", short: "Click", kind: "flow", hint: "Click link/CTA" },
  { key: "sessions", label: "Sessions", short: "Sessions", kind: "flow", hint: "Lượt truy cập website" },
  { key: "posts", label: "Số bài đăng", short: "Bài đăng", kind: "flow" },
  { key: "followers", label: "Follower", short: "Follower", kind: "snapshot", hint: "Tổng follower/subscriber cuối tháng" },
  { key: "newFollowers", label: "Follower mới", short: "+Follower", kind: "flow", hint: "Follower tăng thêm trong tháng" },
];

/** Chỉ số áp dụng cho từng loại kênh — ô không áp dụng hiện "–" và không nhập được (xác định rõ ma trận kênh). */
export const CHANNEL_METRICS: Record<ChannelKey, MetricKey[]> = {
  meta: ["impressions", "reach", "engagements", "videoViews", "linkClicks", "posts", "followers", "newFollowers"],
  tiktok: ["impressions", "reach", "engagements", "videoViews", "posts", "followers", "newFollowers"],
  youtube: ["impressions", "engagements", "videoViews", "linkClicks", "posts", "followers", "newFollowers"],
  website: ["impressions", "sessions", "linkClicks", "posts"],
  zalo: ["impressions", "reach", "engagements", "linkClicks", "posts", "followers", "newFollowers"],
  other: ["impressions", "reach", "engagements", "videoViews", "linkClicks", "sessions", "posts", "followers", "newFollowers"],
};

export const appliesTo = (channel: string, metric: MetricKey): boolean => (CHANNEL_METRICS[channel as ChannelKey] ?? CHANNEL_METRICS.other).includes(metric);

export type MetricValues = Partial<Record<MetricKey, number | null>>;

export interface BrandPerfRow {
  sbuId: string;
  channel: string;
  period: string;
  impressions: string | null;
  reach: string | null;
  engagements: string | null;
  videoViews: string | null;
  linkClicks: string | null;
  sessions: string | null;
  posts: string | null;
  followers: string | null;
  newFollowers: string | null;
}

const n = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export function valuesOf(r: Partial<BrandPerfRow> | null | undefined): MetricValues {
  const out: MetricValues = {};
  for (const m of METRICS) out[m.key] = n(r?.[m.key] as string | null | undefined);
  return out;
}

/** Cộng các kênh: số null chỉ thành null khi TẤT CẢ kênh đều chưa có số. */
export function sumValues(list: MetricValues[]): MetricValues {
  const out: MetricValues = {};
  for (const m of METRICS) {
    const vals = list.map((v) => v[m.key]).filter((x): x is number => x != null);
    out[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

/** Engagement rate = engagement ÷ impression. */
export const engagementRate = (v: MetricValues): number | null => (v.impressions && v.engagements != null ? v.engagements / v.impressions : null);
/** CTR = click ÷ impression. */
export const clickRate = (v: MetricValues): number | null => (v.impressions && v.linkClicks != null ? v.linkClicks / v.impressions : null);
/** Tăng trưởng follower trong tháng = follower mới ÷ follower đầu tháng. */
export function followerGrowth(v: MetricValues): number | null {
  if (v.followers == null || v.newFollowers == null) return null;
  const start = v.followers - v.newFollowers;
  return start > 0 ? v.newFollowers / start : null;
}

export const prevPeriod = (p: string): string => {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export const periodLabel = (p: string): string => `T${Number(p.slice(5, 7))}/${p.slice(0, 4)}`;
