import { describe, expect, it } from "vitest";
import { appliesTo, engagementRate, followerGrowth, prevPeriod, sumValues } from "./brand-perf";

describe("brand-perf", () => {
  it("cộng các kênh: null chỉ khi tất cả kênh chưa có số", () => {
    const s = sumValues([{ impressions: 100, reach: null }, { impressions: 50, reach: null }, { impressions: null, reach: null }]);
    expect(s.impressions).toBe(150);
    expect(s.reach).toBeNull();
  });
  it("engagement rate = engagement / impression, thiếu số → null", () => {
    expect(engagementRate({ impressions: 1000, engagements: 50 })).toBeCloseTo(0.05);
    expect(engagementRate({ impressions: 0, engagements: 50 })).toBeNull();
    expect(engagementRate({ impressions: 1000, engagements: null })).toBeNull();
  });
  it("tăng trưởng follower = follower mới / follower đầu tháng", () => {
    expect(followerGrowth({ followers: 1100, newFollowers: 100 })).toBeCloseTo(0.1);
    expect(followerGrowth({ followers: 100, newFollowers: 100 })).toBeNull();
  });
  it("ma trận kênh: website không có follower, meta có", () => {
    expect(appliesTo("website", "followers")).toBe(false);
    expect(appliesTo("website", "sessions")).toBe(true);
    expect(appliesTo("meta", "followers")).toBe(true);
    expect(appliesTo("tiktok", "linkClicks")).toBe(false);
  });
  it("kỳ trước qua ranh giới năm", () => {
    expect(prevPeriod("2026-01")).toBe("2025-12");
    expect(prevPeriod("2026-10")).toBe("2026-09");
  });
});
