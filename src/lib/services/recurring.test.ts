import { describe, expect, it } from "vitest";
import { computeNominalDates, renderTemplate } from "./recurring";

const WORKDAYS = [1, 2, 3, 4, 5];
const NO_HOLIDAYS = new Set<string>();

describe("computeNominalDates — monthly, day_rule=last_working_day (CAD-07)", () => {
  it("SPEC Mục 14.2 tiêu chí #3: tháng 10/2026 sinh đúng 30/10/2026", () => {
    const dates = computeNominalDates(
      {
        freq: "monthly",
        interval: 1,
        byWeekday: null,
        byMonthDay: null,
        byNthWeekday: null,
        dayRule: "last_working_day",
        holidayPolicy: "none",
        startsOn: "2026-01-01",
        endsOn: null,
        skippedDates: [],
      },
      "2026-10-01",
      "2026-10-31",
      WORKDAYS,
      NO_HOLIDAYS,
    );
    expect(dates).toEqual(["2026-10-30"]);
  });
});

describe("computeNominalDates — monthly, calendar_day + shift_earlier (CAD-02 ngày 10)", () => {
  it("10/10/2026 là thứ Bảy -> lùi về 09/10/2026", () => {
    const dates = computeNominalDates(
      {
        freq: "monthly",
        interval: 1,
        byWeekday: null,
        byMonthDay: 10,
        byNthWeekday: null,
        dayRule: "calendar_day",
        holidayPolicy: "shift_earlier",
        startsOn: "2026-01-01",
        endsOn: null,
        skippedDates: [],
      },
      "2026-10-01",
      "2026-10-31",
      WORKDAYS,
      NO_HOLIDAYS,
    );
    expect(dates).toEqual(["2026-10-09"]);
  });
});

describe("computeNominalDates — interval 2 tháng bỏ qua đúng chu kỳ", () => {
  it("interval=2 từ starts_on 2026-01-01 chỉ sinh ở tháng chẵn cách đều", () => {
    const dates = computeNominalDates(
      {
        freq: "monthly",
        interval: 2,
        byWeekday: null,
        byMonthDay: 1,
        byNthWeekday: null,
        dayRule: "calendar_day",
        holidayPolicy: "none",
        startsOn: "2026-01-01",
        endsOn: null,
        skippedDates: [],
      },
      "2026-01-01",
      "2026-05-31",
      WORKDAYS,
      NO_HOLIDAYS,
    );
    expect(dates).toEqual(["2026-01-01", "2026-03-01", "2026-05-01"]);
  });
});

describe("computeNominalDates — by_month_day=-1 (ngày cuối tháng) tháng ngắn", () => {
  it("tháng 2/2027 (không nhuận, 28 ngày) lấy đúng ngày 28", () => {
    const dates = computeNominalDates(
      {
        freq: "monthly",
        interval: 1,
        byWeekday: null,
        byMonthDay: -1,
        byNthWeekday: null,
        dayRule: "calendar_day",
        holidayPolicy: "none",
        startsOn: "2026-01-01",
        endsOn: null,
        skippedDates: [],
      },
      "2027-02-01",
      "2027-02-28",
      WORKDAYS,
      NO_HOLIDAYS,
    );
    expect(dates).toEqual(["2027-02-28"]);
  });
});

describe("computeNominalDates — bỏ qua ngày trong skipped_dates", () => {
  it("ngày bị skip không xuất hiện trong kết quả", () => {
    const dates = computeNominalDates(
      {
        freq: "monthly",
        interval: 1,
        byWeekday: null,
        byMonthDay: 28,
        byNthWeekday: null,
        dayRule: "calendar_day",
        holidayPolicy: "none",
        startsOn: "2026-01-01",
        endsOn: null,
        skippedDates: ["2026-10-28"],
      },
      "2026-10-01",
      "2026-10-31",
      WORKDAYS,
      NO_HOLIDAYS,
    );
    expect(dates).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("thay thế {{month}}/{{year}} và {{due_date}} dạng dd/mm/yyyy", () => {
    const out = renderTemplate("Báo cáo tháng {{month}}/{{year}}, hạn {{due_date}}", {
      occurrenceDate: "2026-10-30",
      dueDate: "2026-10-30",
    });
    expect(out).toBe("Báo cáo tháng 10/2026, hạn 30/10/2026");
  });
  it("{{sbu_code}}/{{sbu_name}} rỗng khi không truyền", () => {
    const out = renderTemplate("SBU: {{sbu_code}} - {{sbu_name}}", {
      occurrenceDate: "2026-10-30",
      dueDate: "2026-10-30",
    });
    expect(out).toBe("SBU:  - ");
  });
});
