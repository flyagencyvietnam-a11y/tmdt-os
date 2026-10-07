import { describe, expect, it } from "vitest";
import { can, canAssignOthers } from "./permissions";

describe("giao việc cho người khác", () => {
  it("mọi nhân sự Marketing (admin/manager/member) luôn được, không cần cờ can_assign", () => {
    expect(canAssignOthers({ role: "admin", canAssign: false })).toBe(true);
    expect(canAssignOthers({ role: "manager", canAssign: false })).toBe(true);
    expect(canAssignOthers({ role: "member", canAssign: false })).toBe(true);
    expect(canAssignOthers({ role: "member" })).toBe(true);
  });
  it("vai trò ngoài nhóm Marketing chỉ được khi có cờ", () => {
    expect(canAssignOthers({ role: "center_contributor", canAssign: false })).toBe(false);
    expect(canAssignOthers({ role: "center_contributor", canAssign: true })).toBe(true);
    expect(canAssignOthers({ role: "viewer", canAssign: false })).toBe(false);
  });
  it("ma trận quyền: member tạo/sửa task và giao người khác", () => {
    expect(can("member", "task", "create")).toBe(true);
    expect(can("member", "task", "update")).toBe(true);
    expect(can("member", "task.assignOthers", "update")).toBe(true);
  });
});
