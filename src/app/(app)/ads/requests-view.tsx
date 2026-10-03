"use client";

import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { deleteAdsCampaignAction, rollupCampaignsAction, upsertAdsCampaignAction } from "./actions";
import type { CampaignRow, SbuLite } from "./shared";

function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("vi-VN");
}

/**
 * Report THEO REQUEST — mỗi dòng là 1 chiến dịch Facebook ứng với 1 request
 * ads riêng của trung tâm (sheet gốc "ads tt.xlsx"), KHÔNG gộp theo kỳ như
 * tab Tuần/Tháng. "Cộng dồn vào tháng" chỉ tổng hợp thủ công khi cần đối
 * chiếu với report tháng — xem SPEC Mục 9.4 / CLAUDE.md "Ads redesign".
 */
export function RequestsView({ campaigns, sbus, canManage }: { campaigns: CampaignRow[]; sbus: SbuLite[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [sbuFilter, setSbuFilter] = React.useState<string>("");
  const [periodFilter, setPeriodFilter] = React.useState<string>("");
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ sbuId: "", period: "", campaignName: "", misaRequestUrl: "", messages: "", impressions: "", spend: "" });

  const sbuName = (id: string) => sbus.find((s) => s.id === id)?.code ?? "?";
  const periods = [...new Set(campaigns.map((c) => c.period))].sort().reverse();

  const filtered = campaigns
    .filter((c) => (sbuFilter ? c.sbuId === sbuFilter : true))
    .filter((c) => (periodFilter ? c.period === periodFilter : true))
    .sort((a, b) => (a.period === b.period ? sbuName(a.sbuId).localeCompare(sbuName(b.sbuId)) : b.period.localeCompare(a.period)));

  const totalSpend = filtered.reduce((s, c) => s + Number(c.spend || 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Mỗi dòng = 1 request ads riêng theo trung tâm (file gốc &quot;ads tt.xlsx&quot;), độc lập với chu kỳ tuần/tháng. Dùng
        &quot;Cộng dồn vào tháng&quot; khi cần đưa tổng chi tiêu các request của 1 SBU+kỳ vào report Theo tháng.
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
          options={[{ value: "", label: "Tất cả kỳ" }, ...periods.map((p) => ({ value: p, label: p }))]}
        />
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Thêm request
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <F label="SBU">
              <SimpleSelect triggerClassName="h-8" value={f.sbuId} onValueChange={(v) => setF((p) => ({ ...p, sbuId: v ?? "" }))} placeholder="Chọn SBU" options={sbus.map((s) => ({ value: s.id, label: s.code }))} />
            </F>
            <F label="Kỳ (tháng)">
              <Input className="h-8" value={f.period} onChange={(e) => setF((p) => ({ ...p, period: e.target.value }))} placeholder="2026-10" />
            </F>
            <F label="Tên chiến dịch">
              <Input className="h-8" value={f.campaignName} onChange={(e) => setF((p) => ({ ...p, campaignName: e.target.value }))} />
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
            <F label="Chi tiêu (VND)">
              <Input className="h-8" type="number" value={f.spend} onChange={(e) => setF((p) => ({ ...p, spend: e.target.value }))} />
            </F>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !f.sbuId || !f.period || !f.campaignName.trim() || !f.spend}
              onClick={() =>
                start(async () => {
                  const res = await upsertAdsCampaignAction({
                    sbuId: f.sbuId,
                    period: f.period,
                    campaignName: f.campaignName.trim(),
                    misaRequestUrl: f.misaRequestUrl || null,
                    messages: f.messages || null,
                    impressions: f.impressions || null,
                    spend: f.spend,
                  });
                  if (res.ok) {
                    toast.success("Đã thêm.");
                    setAdding(false);
                    setF({ sbuId: "", period: "", campaignName: "", misaRequestUrl: "", messages: "", impressions: "", spend: "" });
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

      <div className="overflow-auto rounded-md border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Kỳ</th>
              <th className="px-2 py-2">SBU</th>
              <th className="px-2 py-2">Tên chiến dịch / request</th>
              <th className="px-2 py-2 text-right">Mess</th>
              <th className="px-2 py-2 text-right">Impression</th>
              <th className="px-2 py-2 text-right">Chi tiêu</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/30">
                <td className="px-2 py-1.5 tabular-nums">{c.period}</td>
                <td className="px-2 py-1.5 font-medium">{sbuName(c.sbuId)}</td>
                <td className="px-2 py-1.5">
                  {c.misaRequestUrl ? (
                    <a href={c.misaRequestUrl as string} target="_blank" rel="noreferrer" className="hover:underline">
                      {c.campaignName}
                    </a>
                  ) : (
                    c.campaignName
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.messages as string)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.impressions as string)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.spend)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    {canManage && (
                      <button
                        className="text-xs text-muted-foreground hover:underline"
                        title="Cộng dồn chi tiêu của SBU+kỳ này vào report Theo tháng"
                        onClick={() =>
                          start(async () => {
                            const res = await rollupCampaignsAction(c.sbuId, c.period);
                            if (res.ok) {
                              toast.success("Đã cộng dồn vào NS Trung tâm order.");
                              router.refresh();
                            } else toast.error(res.error);
                          })
                        }
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canManage && (
                      <button
                        className="text-muted-foreground hover:text-crit"
                        onClick={() =>
                          start(async () => {
                            const res = await deleteAdsCampaignAction(c.id);
                            if (res.ok) {
                              toast.success("Đã xoá.");
                              router.refresh();
                            } else toast.error(res.error);
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-10 text-center text-muted-foreground">
                  Chưa có request nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-medium">
                <td colSpan={5} className="px-2 py-1.5">
                  Tổng ({filtered.length} request)
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{totalSpend.toLocaleString("vi-VN")}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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
