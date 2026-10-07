import { describe, expect, it } from "vitest";
import { accountKeyFromUrl, appliesTo, engagementRate, followerGrowth, prevPeriod, sameChannel, sumValues } from "./brand-perf";

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

describe("nhiều tài khoản cùng nền tảng", () => {
  it("khoá tài khoản sinh từ link, ổn định", () => {
    expect(accountKeyFromUrl("https://www.facebook.com/anhnguvmglongthanh/")).toBe("anhnguvmglongthanh");
    expect(accountKeyFromUrl("https://www.facebook.com/profile.php?id=61594027016472")).toBe("61594027016472");
    expect(accountKeyFromUrl("https://www.facebook.com/groups/651724113782194")).toBe("g-651724113782194");
    expect(accountKeyFromUrl("https://www.tiktok.com/@vmg_english")).toBe("@vmg_english");
    expect(accountKeyFromUrl("https://www.tiktok.com/@ielts.with.vmg?is_from_webapp=1&sender_device=pc")).toBe("@ielts.with.vmg");
    expect(accountKeyFromUrl("https://zalo.me/3856493312075808344")).toBe("3856493312075808344");
    expect(accountKeyFromUrl("https://www.youtube.com/@anhnguvietmy-vmg")).toBe("@anhnguvietmy-vmg");
    expect(accountKeyFromUrl("https://khuyenmai.vmgenglish.edu.vn/speaking-fast-track")).toBe("khuyenmai.vmgenglish.edu.vn/speaking-fast-track");
    expect(accountKeyFromUrl("https://vmgenglish.edu.vn/")).toBe("vmgenglish.edu.vn");
    expect(accountKeyFromUrl("vmgenglish.edu.vn")).toBe("vmgenglish.edu.vn");
    expect(accountKeyFromUrl("")).toBe("");
    expect(accountKeyFromUrl(null)).toBe("");
  });
  it("số liệu khớp kênh theo (brand, nền tảng, tài khoản)", () => {
    const a = { sbuId: "b1", channel: "facebook", account: "x" };
    expect(sameChannel(a, { ...a })).toBe(true);
    expect(sameChannel(a, { ...a, account: "y" })).toBe(false);
    expect(sameChannel(a, { ...a, channel: "instagram" })).toBe(false);
    expect(sameChannel(a, { ...a, sbuId: "b2" })).toBe(false);
  });
  it("Facebook và Instagram có chỉ số riêng", () => {
    expect(appliesTo("facebook", "followers")).toBe(true);
    expect(appliesTo("instagram", "sessions")).toBe(false);
  });
});
