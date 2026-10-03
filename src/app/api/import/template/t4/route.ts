import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** SPEC Phụ lục B4 — template T4 (Quy tắc lặp). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Mỗi dòng là 1 quy tắc lặp (SPEC Mục 6.2). Đọc kỹ Mục 6 trước khi nạp — hay làm sai." },
        { note: "title_template hỗ trợ biến: {{month}} {{month_name}} {{year}} {{prev_month}} {{next_month}} {{due_date}} {{sbu_code}} {{sbu_name}} {{owner_name}}." },
        { note: "assignment_mode=fixed_user cần assignee_email. scope_mode=per_sbu cần scope_sbu_codes ('ALL' hoặc danh sách cách nhau ';')." },
      ],
    },
    {
      name: "RECURRING",
      columns: [
        { header: "rule_code*", key: "rule_code", width: 14 },
        { header: "name*", key: "name", width: 24 },
        { header: "title_template*", key: "title_template", width: 36 },
        { header: "description_template", key: "description_template", width: 24 },
        { header: "type", key: "type", width: 16 },
        { header: "priority", key: "priority", width: 10 },
        { header: "freq*", key: "freq", width: 10 },
        { header: "interval", key: "interval", width: 8 },
        { header: "by_weekday", key: "by_weekday", width: 12 },
        { header: "by_month_day", key: "by_month_day", width: 12 },
        { header: "day_rule", key: "day_rule", width: 18 },
        { header: "holiday_policy", key: "holiday_policy", width: 16 },
        { header: "due_offset_days", key: "due_offset_days", width: 14 },
        { header: "start_offset_days", key: "start_offset_days", width: 16 },
        { header: "due_time", key: "due_time", width: 10 },
        { header: "starts_on*", key: "starts_on", width: 12 },
        { header: "ends_on", key: "ends_on", width: 12 },
        { header: "assignment_mode*", key: "assignment_mode", width: 16 },
        { header: "assignee_email", key: "assignee_email", width: 22 },
        { header: "scope_mode", key: "scope_mode", width: 12 },
        { header: "scope_sbu_codes", key: "scope_sbu_codes", width: 20 },
        { header: "fan_out_mode", key: "fan_out_mode", width: 18 },
        { header: "checklist", key: "checklist", width: 30 },
        { header: "campaign_code", key: "campaign_code", width: 16 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [
        { header: "freq", key: "freq", width: 12 },
        { header: "day_rule", key: "day_rule", width: 18 },
        { header: "holiday_policy", key: "holiday_policy", width: 16 },
        { header: "assignment_mode", key: "assignment_mode", width: 16 },
        { header: "scope_mode", key: "scope_mode", width: 12 },
        { header: "fan_out_mode", key: "fan_out_mode", width: 18 },
      ],
      rows: [
        { freq: "daily", day_rule: "calendar_day", holiday_policy: "none", assignment_mode: "fixed_user", scope_mode: "single", fan_out_mode: "checklist_per_owner" },
        { freq: "weekly", day_rule: "last_working_day", holiday_policy: "shift_earlier", assignment_mode: "sbu_ho_owner", scope_mode: "per_sbu", fan_out_mode: "task_per_sbu" },
        { freq: "monthly", day_rule: "first_working_day", holiday_policy: "shift_later", assignment_mode: "round_robin", scope_mode: "", fan_out_mode: "" },
        { freq: "yearly", day_rule: "", holiday_policy: "", assignment_mode: "unassigned", scope_mode: "", fan_out_mode: "" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T4_Recurring.xlsx"',
    },
  });
}
