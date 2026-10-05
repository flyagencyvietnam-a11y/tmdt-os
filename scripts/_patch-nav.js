const fs = require("fs");
function edit(p, fn) {
  let s = fs.readFileSync(p, "utf8");
  const o = s;
  s = fn(s);
  if (s === o) console.log("NOCHANGE", p);
  fs.writeFileSync(p, s);
}
function rep(s, a, b) {
  if (!s.includes(a)) console.log("  MISSING:", a.slice(0, 90).replace(/\n/g, "\\n"));
  return s.replace(a, () => b);
}
const A = "src/app/(app)/";

edit("src/components/shell/sidebar-nav.tsx", (s) => {
  s = rep(s, '{ href: "/ads", label: "Ads", icon: LineChart, roles: STAFF },', '{ href: "/brand-performance", label: "Brand Performance", icon: Sparkles, roles: [...STAFF, "viewer"] },\n      { href: "/ads", label: "Growth Performance", icon: LineChart, roles: [...STAFF, "viewer"] },');
  s = rep(s, "  Settings,\n", "  Settings,\n  Sparkles,\n");
  return s;
});
edit(A + "ads/page.tsx", (s) => {
  s = rep(s, 'export const metadata = { title: "Ads — VMG MKT OS" };', 'export const metadata = { title: "Growth Performance — VMG MKT OS" };');
  s = rep(s, 'title="Ads — Digital Marketing"', 'title="Growth Performance"');
  s = rep(s, "description=\"Chi tiêu và hiệu quả quảng cáo của 5 mảng:", "description=\"Hiệu quả tăng trưởng (quảng cáo/Ads) — chi tiêu, lead, học viên mới, CPL, CAC của 5 mảng:");
  return s;
});
edit(A + "cai-dat/app-settings-panel.tsx", (s) => rep(s, 'label: "Ngưỡng điểm hiệu quả Ads",', 'label: "Ngưỡng điểm hiệu quả Growth Performance (Ads)",'));
edit("src/app/login/page.tsx", (s) => rep(s, "Số liệu Ads & báo cáo quản lý", "Growth & Brand Performance, báo cáo quản lý"));

// Nút xuất báo cáo
edit(A + "sbu/page.tsx", (s) => {
  s = rep(s, "          user.role !== \"center_contributor\" && (\n            <Link", "          user.role !== \"center_contributor\" && (\n            <>\n              <ExportMenu kind=\"sbu\" />\n              <Link");
  s = rep(s, "              <Grid3x3 className=\"mr-1 h-4 w-4\" /> Ma trận hạng mục × SBU\n            </Link>\n          )", "              <Grid3x3 className=\"mr-1 h-4 w-4\" /> Ma trận hạng mục × SBU\n              </Link>\n            </>\n          )");
  s = rep(s, 'import { PageHeader } from "@/components/shell/page-header";', 'import { PageHeader } from "@/components/shell/page-header";\nimport { ExportMenu } from "@/components/report/export-menu";');
  return s;
});
edit(A + "bao-cao/page.tsx", (s) => {
  s = rep(s, "      <PageHeader title=\"Dashboard quản lý\" description={`Sức khoẻ vận hành của phòng trong tháng ${period.slice(5)}/${period.slice(0, 4)}: việc trễ hạn, tiến độ campaign, mức hoàn thành theo SBU.`} />", "      <PageHeader\n        title=\"Dashboard quản lý\"\n        description={`Sức khoẻ vận hành của phòng trong tháng ${period.slice(5)}/${period.slice(0, 4)}: việc trễ hạn, tiến độ campaign, mức hoàn thành theo SBU.`}\n        actions={<ExportMenu kind=\"management\" period={period} />}\n      />");
  s = rep(s, 'import { PageHeader } from "@/components/shell/page-header";', 'import { PageHeader } from "@/components/shell/page-header";\nimport { ExportMenu } from "@/components/report/export-menu";');
  return s;
});
edit(A + "ads/ads-view.tsx", (s) => {
  s = rep(s, '        {canManage && (tab === "week" || tab === "month" || tab === "request") && (', '        <div className={canManage && (tab === "week" || tab === "month" || tab === "request") ? "" : "ml-auto"}>\n          <ExportMenu kind="growth" period={tab === "overview" && mode === "quarter" ? undefined : month} />\n        </div>\n        {canManage && (tab === "week" || tab === "month" || tab === "request") && (');
  s = rep(s, 'import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";', 'import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";\nimport { ExportMenu } from "@/components/report/export-menu";');
  return s;
});
