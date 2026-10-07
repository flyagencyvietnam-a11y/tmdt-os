import { describe, expect, it } from "vitest";
import { isIncomplete, monitoringIssues, type HealthInput } from "./monitoring-health";
import { makeBadge } from "./nav-badge";

const full: HealthInput = { kind: "posm", alert: "ok", currentStateNote: "Còn tốt", photoUrl: null, quantity: 3 };

describe("monitoringIssues", () => {
  it("đủ thông tin + còn hạn + có ảnh → không có vấn đề", () => {
    expect(monitoringIssues(full, 1)).toEqual([]);
  });
  it("quá hạn / chưa rà soát là vấn đề đỏ", () => {
    expect(monitoringIssues({ ...full, alert: "overdue" }, 1)).toEqual(["overdue"]);
    expect(monitoringIssues({ ...full, alert: "no_data" }, 1)).toEqual(["never_checked"]);
  });
  it("sắp đến hạn chưa phải vấn đề đỏ", () => {
    expect(monitoringIssues({ ...full, alert: "due_soon" }, 1)).toEqual([]);
  });
  it("thiếu ảnh, hiện trạng, số lượng", () => {
    expect(monitoringIssues({ ...full, currentStateNote: "  ", quantity: null }, 0)).toEqual(["no_photo", "no_state", "no_quantity"]);
  });
  it("Google Maps cần link chứ không cần ảnh/số lượng", () => {
    const maps: HealthInput = { kind: "google_maps", alert: "ok", currentStateNote: "4.8 sao", photoUrl: null, quantity: null };
    expect(monitoringIssues(maps, 0)).toEqual(["no_link"]);
    expect(monitoringIssues({ ...maps, photoUrl: "https://maps.app.goo.gl/x" }, 0)).toEqual([]);
  });
  it("isIncomplete chỉ tính nhóm thiếu thông tin", () => {
    expect(isIncomplete(["overdue", "never_checked"])).toBe(false);
    expect(isIncomplete(["overdue", "no_photo"])).toBe(true);
  });
});

describe("makeBadge", () => {
  it("không có điểm nóng → null", () => expect(makeBadge(0, 0, [[0, "x"]])).toBeNull());
  it("có đỏ → tone crit, hint bỏ nhóm 0", () => {
    expect(makeBadge(3, 2, [[3, "quá hạn"], [0, "bỏ"], [2, "hôm nay"]])).toEqual({ count: 5, tone: "crit", hint: "3 quá hạn · 2 hôm nay" });
  });
  it("chỉ vàng → tone warn", () => expect(makeBadge(0, 2, [[2, "sắp hạn"]])?.tone).toBe("warn"));
});
