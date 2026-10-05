"use client";

import { Coins, ListChecks, MessageCircle, RefreshCcw, Target, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { MonthInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";
import { ROW_TONE_CLASS } from "../task/task-style";
import { deleteAdsCampaignAction, patchAdsCampaignAction, rollupCampaignsAction, upsertAdsCampaignAction } from "./actions";
import { axisProps, ChartCard, ChartTooltip, gridProps } from "./charts";
import { fmt, fmtMoney, monthLabel, num, type CampaignRow, type SbuLite } from "./shared";

/**
 * Report THEO REQUEST — mỗi dòng là 1 chiến dịch Facebook ứng với 1 request
 * ads riêng của trung tâm (sheet gốc "ads tt.xlsx"), KHÔNG gộp theo kỳ như
 * tab Tuần/Tháng. "Cộng dồn vào tháng" chỉ tổng hợp thủ công khi cần đối
 * chiếu với report tháng — xem SPEC Mục 9.4 / CLAUDE.md "Ads redesign".
 *
 * Bảng sửa trực tiếp như Excel: bấm ô → gõ → Enter/Tab; "+ Cột" ở cuối hàng tiêu đề để thêm cột mới.
 */
const INITIAL_VIEW = { sorts: [{ field: "period", direction: "asc" as const }, { field: "sbuCode", direction: "asc" as const }] };

const EMPTY_FORM = { sbuId: "", period: "", campaignName: "", runnerId: "", plannedBudget: "", misaRequestUrl: "", messages: "", impressions: "", spend: "" };

export function RequestsView({ campaigns, sbus, users, canManage }: { campaigns: CampaignRow[]; sbus: SbuLite[]; users: { id: string; fullName: string }[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [sbuFilter, setSbuFilter] = useSessionState<string>("ads:req:sbu", "");
  const [periodFilter, setPeriodFilter] = useSessionState<string>("ads:req:period", "");
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState(EMPTY_FORM);

  const sbuCode = React.useCallback((id: string) => sbus.find((s) => s.id === id)?.code ?? "?", [sbus]);
  const userName = React.useCallback((id: string | null | undefined) => users.find((u) => u.id === id)?.fullName ?? "", [users]);
  const periods = [...new Set(campaigns.map((c) => c.period))].sort().reverse();

  const filtered = React.useMemo(
    () => campaigns.filter((c) => (sbuFilter ? c.sbuId === sbuFilter : true)).filter((c) => (periodFilter ? c.period === periodFilter : true)),
    [campaigns, sbuFilter, periodFilter],
  );

  const totalSpend = filtered.reduce((s, c) => s + Number(c.spend || 0), 0);
  const totalPlanned = filtered.reduce((s, c) => s + (num(c.plannedBudget) ?? 0), 0);
  const plannedCount = filtered.filter((c) => num(c.plannedBudget) != null).length;
  const totalMess = filtered.reduce((s, c) => s + (num(c.messages as string) ?? 0), 0);
  const bySbu = sbus
    .map((s) => {
      const rows = filtered.filter((c) => c.sbuId === s.id);
      const spend = rows.reduce((a, c) => a + Number(c.spend || 0), 0);
      return { code: s.code, spend, count: rows.length };
    })
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  const patch = React.useCallback(
    async (id: string, p: Parameters<typeof patchAdsCampaignAction>[1]) => {
      const res = await patchAdsCampaignAction(id, p);
      if (res.ok) router.refresh();
      else toast.error(res.error);
    },
    [router],
  );

  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      const v = raw.trim();
      const numeric = (x: string) => x.replace(/[.\s₫đ]/g, "").replace(/,/g, "");
      switch (field) {
        case "period":
          return patch(rowId, { period: v });
        case "sbuCode":
          return patch(rowId, { sbuId: v });
        case "campaignName":
          return patch(rowId, { campaignName: v });
        case "runnerId":
          return patch(rowId, { runnerId: v || null });
        case "plannedBudget":
          return patch(rowId, { plannedBudget: v ? numeric(v) : null });
        case "spend":
          return patch(rowId, { spend: v ? numeric(v) : "0" });
        case "messages":
          return patch(rowId, { messages: v ? numeric(v) : null });
        case "impressions":
          return patch(rowId, { impressions: v ? numeric(v) : null });
        case "misaRequestUrl":
          return patch(rowId, { misaRequestUrl: v || null });
      }
    },
    [patch],
  );

  const columns: GridColumn<CampaignRow>[] = React.useMemo(() => {
    const sbuOpts = sbus.map((s) => ({ value: s.id, label: s.code }));
    const userOpts = users.map((u) => ({ value: u.id, label: u.fullName }));
    const numCol = (field: string, header: string, get: (c: CampaignRow) => string | null | undefined, w = 120): GridColumn<CampaignRow> => ({
      field,
      header,
      kind: "number",
      accessor: (r) => num(get(r) as string),
      cell: (r) => (num(get(r) as string) == null ? <span className="text-muted-foreground/60">—</span> : fmt(get(r) as string)),
      editable: canManage,
      editInputType: "number",
      editValue: (r) => String(num(get(r) as string) ?? ""),
      align: "right",
      defaultWidth: w,
      groupable: false,
    });
    return [
      {
        field: "period",
        header: "Kỳ",
        kind: "text",
        accessor: (r) => r.period,
        cell: (r) => monthLabel(r.period),
        editable: canManage,
        editInputType: "month",
        editValue: (r) => r.period,
        defaultWidth: 90,
      },
      {
        field: "sbuCode",
        header: "SBU",
        kind: "enum",
        accessor: (r) => r.sbuId,
        cell: (r) => <span className="font-medium">{sbuCode(r.sbuId)}</span>,
        enumOptions: sbuOpts,
        filterOptions: sbuOpts,
        editable: canManage,
        editKind: "select",
        editOptions: sbuOpts,
        editValue: (r) => r.sbuId,
        defaultWidth: 90,
      },
      {
        field: "campaignName",
        header: "Tên chiến dịch / request",
        kind: "text",
        accessor: (r) => r.campaignName,
        cell: (r) =>
          r.misaRequestUrl ? (
            <a href={r.misaRequestUrl as string} target="_blank" rel="noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {r.campaignName}
            </a>
          ) : (
            r.campaignName
          ),
        editable: canManage,
        editValue: (r) => r.campaignName,
        defaultWidth: 300,
        groupable: false,
      },
      {
        field: "runnerId",
        header: "Người chạy",
        kind: "enum",
        accessor: (r) => r.runnerId ?? "",
        cell: (r) => userName(r.runnerId) || <span className="text-muted-foreground/60">Chưa gán</span>,
        enumOptions: userOpts,
        filterOptions: userOpts,
        editable: canManage,
        editKind: "select",
        editOptions: [{ value: "", label: "— Chưa gán —" }, ...userOpts],
        editValue: (r) => r.runnerId ?? "",
        defaultWidth: 150,
      },
      numCol("plannedBudget", "NS kế hoạch", (c) => c.plannedBudget, 130),
      numCol("spend", "Chi tiêu thực tế", (c) => c.spend, 130),
      {
        field: "usage",
        header: "% so với kế hoạch",
        kind: "number",
        accessor: (r) => (num(r.plannedBudget) ? Math.round((Number(r.spend || 0) / num(r.plannedBudget)!) * 100) : null),
        cell: (r) => {
          const planned = num(r.plannedBudget);
          if (!planned) return <span className="text-muted-foreground/60">—</span>;
          const pct = Math.round((Number(r.spend || 0) / planned) * 100);
          return (
            <span className={cn("inline-flex items-center gap-2 tabular-nums", pct > 100 && "font-semibold text-red-700 dark:text-red-300")} title={`${fmt(r.spend)} / ${fmt(planned)}`}>
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, pct)}%` }} />
              </span>
              {pct}%
            </span>
          );
        },
        align: "right",
        defaultWidth: 150,
        groupable: false,
      },
      numCol("messages", "Mess", (c) => c.messages as string, 90),
      numCol("impressions", "Impression", (c) => c.impressions as string, 110),
      {
        field: "costPerMess",
        header: "Chi phí / mess",
        kind: "number",
        accessor: (r) => (num(r.messages as string) ? Number(r.spend) / num(r.messages as string)! : null),
        cell: (r) => (num(r.messages as string) ? fmtMoney(Number(r.spend) / num(r.messages as string)!) : <span className="text-muted-foreground/60">—</span>),
        align: "right",
        defaultWidth: 120,
        groupable: false,
      },
      {
        field: "misaRequestUrl",
        header: "Link MISA",
        kind: "text",
        accessor: (r) => (r.misaRequestUrl as string | null) ?? "",
        cell: (r) => (r.misaRequestUrl ? <span className="text-muted-foreground">Có link</span> : <span className="text-muted-foreground/60">—</span>),
        editable: canManage,
        editValue: (r) => (r.misaRequestUrl as string | null) ?? "",
        defaultWidth: 100,
        groupable: false,
      },
      ...(canManage
        ? ([
            {
              field: "__actions",
              header: "",
              kind: "text",
              accessor: () => "",
              sortable: false,
              groupable: false,
              defaultWidth: 70,
              cell: (c) => (
                <div className="flex items-center gap-2">
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    title="Cộng dồn chi tiêu của SBU + kỳ này vào report Theo tháng"
                    onClick={(e) => {
                      e.stopPropagation();
                      start(async () => {
                        const res = await rollupCampaignsAction(c.sbuId, c.period);
                        if (res.ok) {
                          toast.success("Đã cộng dồn vào NS Trung tâm order.");
                          router.refresh();
                        } else toast.error(res.error);
                      });
                    }}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-crit"
                    title="Xoá request"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!window.confirm(`Xoá request "${c.campaignName}" (${sbuCode(c.sbuId)}, ${monthLabel(c.period)})?`)) return;
                      start(async () => {
                        const res = await deleteAdsCampaignAction(c.id);
                        if (res.ok) {
                          toast.success("Đã xoá.");
                          router.refresh();
                        } else toast.error(res.error);
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ] as GridColumn<CampaignRow>[])
        : []),
    ];
  }, [sbus, users, canManage, sbuCode, userName, router]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Số request" value={filtered.length} icon={ListChecks} tone="info" hint={periodFilter ? monthLabel(periodFilter) : "Mọi kỳ"} />
        <StatCard label="Ngân sách kế hoạch" value={plannedCount ? fmtMoney(totalPlanned) : "—"} icon={Wallet} hint={plannedCount ? `${plannedCount}/${filtered.length} request có kế hoạch` : "Chưa nhập kế hoạch"} />
        <StatCard
          label="Tổng chi tiêu"
          value={fmtMoney(totalSpend)}
          icon={Coins}
          tone={totalPlanned && totalSpend > totalPlanned ? "crit" : "brand"}
          hint={totalPlanned ? `${Math.round((totalSpend / totalPlanned) * 100)}% so với kế hoạch` : undefined}
        />
        <StatCard label="Tổng mess" value={fmt(totalMess)} icon={MessageCircle} tone="info" />
        <StatCard label="Chi phí / mess" value={fmtMoney(totalMess ? totalSpend / totalMess : null)} icon={Target} hint="bình quân theo bộ lọc" />
      </div>

      {bySbu.length > 0 && (
        <ChartCard title="Chi tiêu request theo trung tâm" description="Theo bộ lọc đang chọn, cao → thấp.">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySbu} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="code" {...axisProps} />
                <YAxis {...axisProps} width={52} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip fmtValue={(v) => fmtMoney(v)} />} />
                <Bar dataKey="spend" name="Chi tiêu" fill="var(--series-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      <p className="text-xs text-muted-foreground">
        Mỗi dòng = 1 request ads riêng của trung tâm, độc lập chu kỳ tuần/tháng. {canManage ? "Bấm ô để sửa ngay trên bảng (Enter/Tab sang ô kế, Ctrl+V để dán từ Excel); dấu + ở cuối hàng tiêu đề để thêm cột. " : ""}Nút ⟳ “Cộng dồn” đưa tổng chi tiêu các request của 1 SBU + kỳ vào báo cáo Theo tháng.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          triggerClassName="h-8 w-40"
          value={sbuFilter}
          onValueChange={(v) => setSbuFilter(v ?? "")}
          placeholder="Tất cả SBU"
          options={[{ value: "", label: "Tất cả SBU" }, ...sbus.map((s) => ({ value: s.id, label: s.code }))]}
        />
        <SimpleSelect
          triggerClassName="h-8 w-40"
          value={periodFilter}
          onValueChange={(v) => setPeriodFilter(v ?? "")}
          placeholder="Tất cả kỳ"
          options={[{ value: "", label: "Tất cả kỳ" }, ...periods.map((p) => ({ value: p, label: monthLabel(p) }))]}
        />
      </div>

      {adding && (
        <div className="space-y-2 rounded-xl border bg-card p-3 shadow-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <F label="SBU">
              <SimpleSelect triggerClassName="h-8" value={f.sbuId} onValueChange={(v) => setF((p) => ({ ...p, sbuId: v ?? "" }))} placeholder="Chọn SBU" options={sbus.map((s) => ({ value: s.id, label: s.code }))} />
            </F>
            <F label="Kỳ (tháng)">
              <MonthInput className="h-8" value={f.period} onChange={(v) => setF((p) => ({ ...p, period: v }))} />
            </F>
            <div className="col-span-2">
              <F label="Tên chiến dịch / request">
                <Input className="h-8" value={f.campaignName} onChange={(e) => setF((p) => ({ ...p, campaignName: e.target.value }))} />
              </F>
            </div>
            <F label="Người chạy">
              <SimpleSelect triggerClassName="h-8" value={f.runnerId} onValueChange={(v) => setF((p) => ({ ...p, runnerId: v ?? "" }))} placeholder="Chọn người chạy" options={[{ value: "", label: "— Chưa gán —" }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]} />
            </F>
            <F label="Ngân sách kế hoạch (VND)">
              <Input className="h-8" type="number" value={f.plannedBudget} onChange={(e) => setF((p) => ({ ...p, plannedBudget: e.target.value }))} />
            </F>
            <F label="Chi tiêu thực tế (VND)">
              <Input className="h-8" type="number" value={f.spend} onChange={(e) => setF((p) => ({ ...p, spend: e.target.value }))} />
            </F>
            <F label="Link MISA (tuỳ chọn)">
              <Input className="h-8" value={f.misaRequestUrl} onChange={(e) => setF((p) => ({ ...p, misaRequestUrl: e.target.value }))} />
            </F>
            <F label="Mess">
              <Input className="h-8" type="number" value={f.messages} onChange={(e) => setF((p) => ({ ...p, messages: e.target.value }))} />
            </F>
            <F label="Impression">
              <Input className="h-8" type="number" value={f.impressions} onChange={(e) => setF((p) => ({ ...p, impressions: e.target.value }))} />
            </F>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !f.sbuId || !f.period || !f.campaignName.trim() || (!f.spend && !f.plannedBudget)}
              onClick={() =>
                start(async () => {
                  const res = await upsertAdsCampaignAction({
                    sbuId: f.sbuId,
                    period: f.period,
                    campaignName: f.campaignName.trim(),
                    runnerId: f.runnerId || null,
                    plannedBudget: f.plannedBudget || null,
                    misaRequestUrl: f.misaRequestUrl || null,
                    messages: f.messages || null,
                    impressions: f.impressions || null,
                    spend: f.spend || "0",
                  });
                  if (res.ok) {
                    toast.success("Đã thêm.");
                    setAdding(false);
                    setF(EMPTY_FORM);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Thêm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      <DataGrid
        entity="ads_requests"
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.id}
        initialView={INITIAL_VIEW}
        onEditCell={canManage ? onEditCell : undefined}
        onAddRow={canManage ? () => setAdding(true) : undefined}
        addRowLabel="Thêm request"
        rowClassName={(r) => (num(r.plannedBudget) && Number(r.spend || 0) > num(r.plannedBudget)! ? ROW_TONE_CLASS.overdue : undefined)}
        emptyText="Chưa có request nào khớp bộ lọc."
      />
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
