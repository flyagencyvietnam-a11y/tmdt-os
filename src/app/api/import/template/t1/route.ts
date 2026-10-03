import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { buildXlsx } from "@/lib/export-xlsx";

/** SPEC Mục 10.4 / Phụ lục B1 — template T1 (Plan campaign tháng). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const buf = await buildXlsx([
    {
      name: "HUONG_DAN",
      columns: [{ header: "Hướng dẫn", key: "note", width: 100 }],
      rows: [
        { note: "Sheet CAMPAIGN: 1 dòng = 1 campaign. Sheet ACTIONS: 1 dòng = 1 task (action plan)." },
        { note: "campaign_code trong ACTIONS phải khớp campaign_code trong sheet CAMPAIGN, hoặc campaign đã có sẵn trong hệ thống." },
        { note: "action_code chỉ cần duy nhất TRONG PHẠM VI 1 campaign_code, không cần duy nhất toàn hệ thống." },
        { note: "parent_action_code / depends_on dùng action_code, phải cùng campaign." },
        { note: "Nhiều giá trị trong 1 ô cách nhau bằng dấu chấm phẩy ';'. Ngày theo dd/mm/yyyy." },
      ],
    },
    {
      name: "CAMPAIGN",
      columns: [
        { header: "campaign_code*", key: "campaign_code", width: 16 },
        { header: "name*", key: "name", width: 30 },
        { header: "type*", key: "type", width: 18 },
        { header: "brand_codes", key: "brand_codes", width: 20 },
        { header: "start_date*", key: "start_date", width: 12 },
        { header: "end_date*", key: "end_date", width: 12 },
        { header: "status", key: "status", width: 16 },
        { header: "owner_email", key: "owner_email", width: 22 },
        { header: "tagline", key: "tagline", width: 20 },
        { header: "occasion", key: "occasion", width: 20 },
        { header: "target_audience", key: "target_audience", width: 24 },
        { header: "insight_message", key: "insight_message", width: 24 },
        { header: "objective", key: "objective", width: 24 },
        { header: "hero_activity", key: "hero_activity", width: 24 },
        { header: "cta", key: "cta", width: 16 },
        { header: "channels", key: "channels", width: 20 },
        { header: "role_split", key: "role_split", width: 24 },
        { header: "budget_note", key: "budget_note", width: 20 },
        { header: "kpi_note", key: "kpi_note", width: 20 },
        { header: "notes", key: "notes", width: 24 },
      ],
      rows: [],
    },
    {
      name: "ACTIONS",
      columns: [
        { header: "campaign_code*", key: "campaign_code", width: 16 },
        { header: "action_code*", key: "action_code", width: 10 },
        { header: "parent_action_code", key: "parent_action_code", width: 16 },
        { header: "workstream", key: "workstream", width: 16 },
        { header: "title*", key: "title", width: 32 },
        { header: "description", key: "description", width: 24 },
        { header: "type", key: "type", width: 16 },
        { header: "assignee_email*", key: "assignee_email", width: 22 },
        { header: "collaborator_emails", key: "collaborator_emails", width: 24 },
        { header: "start_date", key: "start_date", width: 12 },
        { header: "due_date*", key: "due_date", width: 12 },
        { header: "due_time", key: "due_time", width: 10 },
        { header: "time_slot", key: "time_slot", width: 12 },
        { header: "priority", key: "priority", width: 10 },
        { header: "channel", key: "channel", width: 14 },
        { header: "sbu_codes", key: "sbu_codes", width: 20 },
        { header: "depends_on", key: "depends_on", width: 16 },
        { header: "is_milestone", key: "is_milestone", width: 12 },
        { header: "reference_url", key: "reference_url", width: 26 },
        { header: "checklist", key: "checklist", width: 30 },
        { header: "recurring_rule_code", key: "recurring_rule_code", width: 18 },
      ],
      rows: [],
    },
    {
      name: "DANH_MUC",
      columns: [
        { header: "campaign_type", key: "campaign_type", width: 20 },
        { header: "action_type", key: "action_type", width: 20 },
        { header: "priority", key: "priority", width: 14 },
      ],
      rows: [
        { campaign_type: "brand_theme", action_type: "campaign_action", priority: "urgent" },
        { campaign_type: "product_gtm", action_type: "content", priority: "high" },
        { campaign_type: "business_program", action_type: "media", priority: "medium" },
        { campaign_type: "rebrand", action_type: "monitoring", priority: "low" },
        { campaign_type: "data_program", action_type: "ads", priority: "" },
        { campaign_type: "internal_program", action_type: "report", priority: "" },
        { campaign_type: "other", action_type: "meeting", priority: "" },
      ],
    },
  ]);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="MKT_OS_Template_T1_PlanCampaign.xlsx"',
    },
  });
}
