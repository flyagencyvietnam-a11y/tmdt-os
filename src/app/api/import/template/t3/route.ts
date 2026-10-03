import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** SPEC Mục 10.1 — tải template T3 (Task lẻ hàng loạt), Phụ lục B3. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Mỗi dòng là 1 task. Cột có * là bắt buộc. Ngày theo dd/mm/yyyy." },
        { note: "task_key: khoá duy nhất để nạp lại không bị trùng (ví dụ TK-001)." },
        { note: "assignee_email: phải là email đã có trong hệ thống (mục Người dùng)." },
        { note: "sbu_codes: nhiều mã cách nhau bằng dấu chấm phẩy ';', hoặc 'ALL'." },
        { note: "checklist: các mục cách nhau bằng dấu chấm phẩy ';'." },
      ],
    },
    {
      name: "TASKS",
      columns: [
        { header: "task_key*", key: "task_key", width: 14 },
        { header: "title*", key: "title", width: 40 },
        { header: "description", key: "description", width: 30 },
        { header: "type", key: "type", width: 14 },
        { header: "assignee_email*", key: "assignee_email", width: 24 },
        { header: "collaborator_emails", key: "collaborator_emails", width: 24 },
        { header: "start_date", key: "start_date", width: 12 },
        { header: "due_date*", key: "due_date", width: 12 },
        { header: "time_slot", key: "time_slot", width: 12 },
        { header: "priority", key: "priority", width: 10 },
        { header: "campaign_code", key: "campaign_code", width: 16 },
        { header: "brand_code", key: "brand_code", width: 14 },
        { header: "sbu_codes", key: "sbu_codes", width: 20 },
        { header: "channel", key: "channel", width: 14 },
        { header: "reference_url", key: "reference_url", width: 30 },
        { header: "checklist", key: "checklist", width: 30 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [
        { header: "type", key: "type", width: 20 },
        { header: "priority", key: "priority", width: 20 },
        { header: "time_slot", key: "time_slot", width: 20 },
      ],
      rows: [
        { type: "campaign_action", priority: "urgent", time_slot: "morning" },
        { type: "content", priority: "high", time_slot: "afternoon" },
        { type: "media", priority: "medium", time_slot: "all_day" },
        { type: "monitoring", priority: "low", time_slot: "" },
        { type: "ads", priority: "", time_slot: "" },
        { type: "report", priority: "", time_slot: "" },
        { type: "meeting", priority: "", time_slot: "" },
        { type: "general", priority: "", time_slot: "" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T3_Task.xlsx"',
    },
  });
}
