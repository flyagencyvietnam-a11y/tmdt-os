import { describe, expect, it } from "vitest";
import { aggregate, buildGroups } from "./aggregations";
import { evalGroup } from "./filter-engine";
import type { FilterGroup } from "./types";

interface Lead {
  name: string;
  stage: string;
  outcome: string;
  silence: number;
  next: string | null;
  revenue: number;
}

const rows: Lead[] = [
  { name: "Nguyễn Văn An", stage: "MQL", outcome: "OPEN", silence: 4, next: "2020-01-01", revenue: 0 },
  { name: "Trần Thị Bình", stage: "SQL", outcome: "OPEN", silence: 1, next: "2999-01-01", revenue: 0 },
  { name: "Lê Cường", stage: "WON", outcome: "WON", silence: 0, next: null, revenue: 10_000_000 },
  { name: "Phạm Dung", stage: "NEW", outcome: "OPEN", silence: 5, next: "2020-06-01", revenue: 0 },
];

const acc = (f: string) => (r: Lead) => (r as unknown as Record<string, unknown>)[f];

describe("evalGroup — nested AND/OR (SPEC 16.1)", () => {
  it("(outcome = OPEN và quá hạn) hoặc silence >= 4", () => {
    const g: FilterGroup = {
      conjunction: "or",
      conditions: [
        {
          conjunction: "and",
          conditions: [
            { field: "outcome", operator: "is", value: "OPEN" },
            { field: "next", operator: "is_overdue" },
          ],
        },
        { field: "silence", operator: "gte", value: 4 },
      ],
    };
    const matched = rows.filter((r) => evalGroup(r, g, acc));
    expect(matched.map((r) => r.name).sort()).toEqual(
      ["Nguyễn Văn An", "Phạm Dung"].sort(),
    );
  });

  it("bỏ dấu tiếng Việt khi 'contains'", () => {
    const g: FilterGroup = {
      conjunction: "and",
      conditions: [{ field: "name", operator: "contains", value: "nguyen van" }],
    };
    expect(rows.filter((r) => evalGroup(r, g, acc)).length).toBe(1);
  });

  it("nhóm rỗng => khớp tất cả", () => {
    expect(rows.filter((r) => evalGroup(r, undefined, acc)).length).toBe(4);
  });
});

describe("aggregate", () => {
  it("sum / avg / count", () => {
    expect(aggregate([1, 2, 3], "sum")).toBe(6);
    expect(aggregate([1, 2, 3, 4], "avg")).toBe(2.5);
    expect(aggregate(["a", "b"], "count")).toBe(2);
    expect(aggregate([], "avg")).toBeNull();
  });
});

describe("buildGroups", () => {
  it("gom nhóm 2 cấp: outcome -> stage", () => {
    const g = buildGroups(rows, ["outcome", "stage"], acc);
    const open = g.find((x) => x.value === "OPEN");
    expect(open?.rows.length).toBe(3);
    expect(open?.children?.length).toBe(3); // MQL, SQL, NEW
  });
});
