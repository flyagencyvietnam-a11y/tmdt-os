"use client";

import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAdsCampaignAction, rollupCampaignsAction, upsertAdsCampaignAction } from "./actions";

interface CampaignRow {
  id: string;
  sbuId: string;
  period: string;
  campaignName: string;
  spend: string;
  misaRequestUrl?: string | null;
  messages?: string | null;
  reach?: string | null;
  impressions?: string | null;
  spendWithVat?: string | null;
}

function fmt(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("vi-VN");
}

export function CampaignsDialog({
  sbuId,
  sbuCode,
  period,
  campaigns,
  canManage,
  onOpenChange,
  onDone,
}: {
  sbuId: string;
  sbuCode: string;
  period: string;
  campaigns: CampaignRow[];
  canManage: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ campaignName: "", misaRequestUrl: "", messages: "", impressions: "", spend: "" });

  const totalSpend = campaigns.reduce((s, c) => s + Number(c.spend || 0), 0);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Chiến dịch Facebook — {sbuCode} · {period}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Tên chiến dịch</th>
                  <th className="px-2 py-1.5 text-right">Mess</th>
                  <th className="px-2 py-1.5 text-right">Impression</th>
                  <th className="px-2 py-1.5 text-right">Chi tiêu</th>
                  {canManage && <th className="px-2 py-1.5" />}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-2 py-1.5">
                      {c.misaRequestUrl ? (
                        <a href={c.misaRequestUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          {c.campaignName}
                        </a>
                      ) : (
                        c.campaignName
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.messages)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.impressions)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.spend)}</td>
                    {canManage && (
                      <td className="px-2 py-1.5">
                        <button
                          className="text-muted-foreground hover:text-crit"
                          onClick={() =>
                            window.confirm("Xoá chiến dịch này?") &&
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
                      </td>
                    )}
                  </tr>
                ))}
                {campaigns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                      Chưa có chiến dịch nào.
                    </td>
                  </tr>
                )}
              </tbody>
              {campaigns.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40 font-medium">
                    <td className="px-2 py-1.5">Tổng</td>
                    <td />
                    <td />
                    <td className="px-2 py-1.5 text-right tabular-nums">{totalSpend.toLocaleString("vi-VN")}</td>
                    {canManage && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {canManage && (
            <>
              {adding ? (
                <div className="space-y-2 rounded-md border p-2">
                  <div className="grid grid-cols-2 gap-2">
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
                      disabled={pending || !f.campaignName.trim() || !f.spend}
                      onClick={() =>
                        start(async () => {
                          const res = await upsertAdsCampaignAction({
                            sbuId,
                            period,
                            campaignName: f.campaignName.trim(),
                            misaRequestUrl: f.misaRequestUrl || null,
                            messages: f.messages || null,
                            impressions: f.impressions || null,
                            spend: f.spend,
                          });
                          if (res.ok) {
                            toast.success("Đã thêm.");
                            setAdding(false);
                            setF({ campaignName: "", misaRequestUrl: "", messages: "", impressions: "", spend: "" });
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
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Thêm chiến dịch
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || campaigns.length === 0}
                    onClick={() =>
                      start(async () => {
                        const res = await rollupCampaignsAction(sbuId, period);
                        if (res.ok) {
                          toast.success("Đã cộng dồn vào NS Trung tâm order.");
                          onDone();
                        } else toast.error(res.error);
                      })
                    }
                  >
                    <RefreshCcw className="mr-1 h-4 w-4" /> Cộng dồn vào tháng
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
