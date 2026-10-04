import { describe, expect, it } from "vitest";
import { headerKey, parseSheet } from "./parse";

describe("headerKey", () => {
  it("bỏ dấu * và phần gợi ý trong ngoặc", () => {
    expect(headerKey("brand_code* (nhiều: VMG, VMP)")).toBe("brand_code");
    expect(headerKey(" topic* ")).toBe("topic");
    expect(headerKey("campaign_code")).toBe("campaign_code");
  });

  it("CSV có header bắt buộc vẫn đọc ra đúng khoá", async () => {
    const rows = await parseSheet(Buffer.from("content_key*,brand_code*\nC1,\"VMG, VMP\"\n"), "x.csv");
    expect(rows[0].data).toEqual({ content_key: "C1", brand_code: "VMG, VMP" });
  });
});
