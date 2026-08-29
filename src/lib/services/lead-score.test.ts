import { describe, expect, it } from "vitest";
import { scoreLead } from "./lead-score";

const base = {
  stage: "CONSULTING",
  maxStage: "CONSULTING",
  outcome: "OPEN",
  silenceCount: 0,
  phone: "0900000000",
  nextContactDate: null,
  lastContactedAt: null,
  source: "FB",
  isCold: false,
};
const NOW = new Date("2026-08-29T10:00:00+07:00");

describe("scoreLead", () => {
  it("WON -> 100 / hot", () => {
    expect(scoreLead({ ...base, outcome: "WON" }, NOW).score).toBe(100);
  });

  it("Cold / DISQUALIFIED -> 0", () => {
    expect(scoreLead({ ...base, isCold: true }, NOW).score).toBe(0);
    expect(scoreLead({ ...base, outcome: "DISQUALIFIED" }, NOW).score).toBe(0);
  });

  it("SQL + có SĐT cao hơn NEW không SĐT", () => {
    const sql = scoreLead({ ...base, maxStage: "SQL" }, NOW).score;
    const neu = scoreLead({ ...base, maxStage: "NEW", phone: null }, NOW).score;
    expect(sql).toBeGreaterThan(neu);
  });

  it("im lặng nhiều -> band nguội dần", () => {
    const s0 = scoreLead({ ...base, maxStage: "MQL" }, NOW).score;
    const s3 = scoreLead({ ...base, maxStage: "MQL", silenceCount: 3 }, NOW).score;
    expect(s3).toBeLessThan(s0);
  });

  it("trễ hẹn -> trừ điểm", () => {
    const onTime = scoreLead(
      { ...base, maxStage: "MQL", nextContactDate: "2026-09-05" },
      NOW,
    ).score;
    const late = scoreLead(
      { ...base, maxStage: "MQL", nextContactDate: "2026-08-20" },
      NOW,
    ).score;
    expect(late).toBeLessThan(onTime);
  });
});
