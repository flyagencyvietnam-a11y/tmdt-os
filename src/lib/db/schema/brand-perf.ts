import { boolean, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, pkUuid } from "./_shared";
import { sbus } from "./sbus";

/**
 * Brand Performance — báo cáo hằng THÁNG chỉ số thương hiệu theo từng brand/sản phẩm (SBU kiểu `brand`) × kênh.
 * Mỗi brand có hệ thống kênh riêng (`brand_channels`: Meta, TikTok, YouTube, Website, Zalo…) → ma trận brand × kênh × chỉ số.
 * Engagement rate, tăng trưởng follower… SUY RA tại truy vấn (lib/brand-perf.ts), không lưu cột.
 */
export const brandChannels = pgTable(
  "brand_channels",
  {
    id: pkUuid(),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
    /** facebook | instagram | tiktok | youtube | website | zalo | other (meta = cũ, Facebook+Instagram gộp) — danh sách ở lib/brand-perf.ts */
    channel: text("channel").notNull(),
    /**
     * Khoá tài khoản trong cùng (brand, nền tảng) — 1 brand có thể có nhiều tài khoản cùng nền tảng (vd. 10 fanpage trung tâm).
     * Ổn định, không hiển thị; "" = tài khoản mặc định. Số liệu (brand_perf_metrics) khớp kênh qua (sbu, channel, account).
     */
    account: text("account").notNull().default(""),
    /** Tên hiển thị tuỳ chọn (vd. "Fanpage VMG IELTS"). */
    label: text("label"),
    url: text("url"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns,
  },
  (t) => [uniqueIndex("brand_channels_uniq").on(t.sbuId, t.channel, t.account), index("brand_channels_sbu_idx").on(t.sbuId)],
);

export const brandPerfMetrics = pgTable(
  "brand_perf_metrics",
  {
    id: pkUuid(),
    sbuId: uuid("sbu_id")
      .notNull()
      .references(() => sbus.id),
    channel: text("channel").notNull(),
    /** Khớp brand_channels.account. */
    account: text("account").notNull().default(""),
    /** "2026-10" */
    period: text("period").notNull(),
    impressions: numeric("impressions", { precision: 14, scale: 0 }),
    reach: numeric("reach", { precision: 14, scale: 0 }),
    engagements: numeric("engagements", { precision: 14, scale: 0 }),
    videoViews: numeric("video_views", { precision: 14, scale: 0 }),
    linkClicks: numeric("link_clicks", { precision: 14, scale: 0 }),
    /** Website: lượt truy cập. */
    sessions: numeric("sessions", { precision: 14, scale: 0 }),
    posts: numeric("posts", { precision: 10, scale: 0 }),
    /** Tổng follower/subscriber CUỐI tháng. */
    followers: numeric("followers", { precision: 14, scale: 0 }),
    newFollowers: numeric("new_followers", { precision: 14, scale: 0 }),
    notes: text("notes"),
    ...auditColumns,
  },
  (t) => [uniqueIndex("brand_perf_uniq").on(t.sbuId, t.channel, t.account, t.period), index("brand_perf_period_idx").on(t.period)],
);

export type BrandChannel = typeof brandChannels.$inferSelect;
export type BrandPerfMetric = typeof brandPerfMetrics.$inferSelect;
