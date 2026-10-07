import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { canSee, isStaff } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listBrandPerf, listBrandSbus } from "@/lib/services/brand-perf";
import { todayVnDayStr } from "@/lib/time";
import { BrandPerformanceView } from "./brand-view";

export const metadata = { title: "Brand Performance — VMG MKT OS" };
export const dynamic = "force-dynamic";

/**
 * Brand Performance: báo cáo chỉ số thương hiệu HẰNG THÁNG (Impression, Reach, Engagement, Follower…) cho từng brand/sản phẩm,
 * theo ma trận kênh riêng của brand (Facebook, Instagram, TikTok, YouTube, Website, Zalo…; mỗi tài khoản một dòng).
 */
export default async function BrandPerformancePage() {
  const user = await requireUser();
  if (!canSee(user.role, "brandPerformance")) redirect("/khong-co-quyen");

  const [brands, { channels, metrics }] = await Promise.all([listBrandSbus(db), listBrandPerf(db)]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Brand Performance"
        description="Chỉ số thương hiệu theo tháng của từng brand/sản phẩm: Impression, Reach, Engagement, Follower… trên hệ thống kênh riêng của brand (Facebook, Instagram, TikTok, YouTube, Website, Zalo — mỗi tài khoản một dòng). Bấm vào ô để nhập số ngay trên bảng."
      />
      <BrandPerformanceView
        brands={brands.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
        channels={channels.map((c) => ({ id: c.id, sbuId: c.sbuId, channel: c.channel, account: c.account, label: c.label, url: c.url, active: c.active }))}
        metrics={metrics.map((m) => ({
          sbuId: m.sbuId,
          channel: m.channel,
          account: m.account,
          period: m.period,
          impressions: m.impressions,
          reach: m.reach,
          engagements: m.engagements,
          videoViews: m.videoViews,
          linkClicks: m.linkClicks,
          sessions: m.sessions,
          posts: m.posts,
          followers: m.followers,
          newFollowers: m.newFollowers,
        }))}
        canEdit={isStaff(user.role)}
        currentMonth={todayVnDayStr().slice(0, 7)}
      />
    </div>
  );
}
