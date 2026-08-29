"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { fmtInt, fmtRatioX, fmtVnd } from "@/lib/format";
import { createCampaignAction, setCampaignStatusAction } from "./actions";

interface Row {
  id: string;
  internalCode: string;
  displayName: string;
  productCode: string | null;
  targetCpmql: number;
  channel: string;
  status: string;
  dailyBudget: number | null;
  ownerName: string | null;
  startedOn: string;
  endedOn: string | null;
  spend: number;
  leads: number;
  mql: number;
  sql: number;
  won: number;
  revenue: number;
  cpl: number | null;
  cpmql: number | null;
  cac: number | null;
  roas: number | null;
  crLeadWon: number | null;
}

function cpmqlTone(cpmql: number | null, target: number, mql: number, spend: number) {
  if (mql === 0) return spend >= target * 1.5 ? "text-crit font-medium" : "";
  if (cpmql == null) return "";
  if (cpmql <= target * 0.7) return "text-ok font-medium";
  if (cpmql <= target) return "";
  if (cpmql <= target * 1.5) return "text-warn font-medium";
  return "text-crit font-medium";
}

export function CampaignTable({
  rows,
  canManage,
  products,
  owners,
}: {
  rows: Row[];
  canManage: boolean;
  products: { id: string; code: string; name: string }[];
  owners: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);

  const total = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      leads: a.leads + r.leads,
      mql: a.mql + r.mql,
      won: a.won + r.won,
      revenue: a.revenue + r.revenue,
    }),
    { spend: 0, leads: 0, mql: 0, won: 0, revenue: 0 },
  );

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            + Campaign
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Trạng thái</th>
              <th className="px-2 py-2">Tên</th>
              <th className="px-2 py-2">SP</th>
              <th className="px-2 py-2 text-right">Ngân sách/ngày</th>
              <th className="px-2 py-2 text-right">Spend</th>
              <th className="px-2 py-2 text-right">Lead</th>
              <th className="px-2 py-2 text-right">MQL</th>
              <th className="px-2 py-2 text-right">SQL</th>
              <th className="px-2 py-2 text-right">HV</th>
              <th className="px-2 py-2 text-right">CPL</th>
              <th className="px-2 py-2 text-right">CPMQL</th>
              <th className="px-2 py-2 text-right">CAC</th>
              <th className="px-2 py-2 text-right">ROAS</th>
              <th className="px-2 py-2">Owner</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-muted/20 font-medium">
              <td className="px-2 py-1.5" colSpan={4}>
                TỔNG ({rows.length})
              </td>
              <td className="px-2 py-1.5 text-right">{fmtVnd(total.spend)}</td>
              <td className="px-2 py-1.5 text-right">{fmtInt(total.leads)}</td>
              <td className="px-2 py-1.5 text-right">{fmtInt(total.mql)}</td>
              <td className="px-2 py-1.5 text-right">–</td>
              <td className="px-2 py-1.5 text-right">{fmtInt(total.won)}</td>
              <td className="px-2 py-1.5 text-right">
                {total.leads ? fmtVnd(total.spend / total.leads) : "–"}
              </td>
              <td className="px-2 py-1.5 text-right">
                {total.mql ? fmtVnd(total.spend / total.mql) : "–"}
              </td>
              <td className="px-2 py-1.5 text-right">
                {total.won ? fmtVnd(total.spend / total.won) : "–"}
              </td>
              <td className="px-2 py-1.5 text-right">
                {total.spend ? fmtRatioX(total.revenue / total.spend) : "–"}
              </td>
              <td />
            </tr>
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/20">
                <td className="px-2 py-1.5">
                  <StatusToggle row={r} disabled={!canManage} onDone={() => router.refresh()} />
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-medium">{r.displayName}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {r.internalCode}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Badge variant="secondary">{r.productCode}</Badge>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.dailyBudget ? fmtVnd(r.dailyBudget) : "–"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtVnd(r.spend)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.leads)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.mql)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.sql)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.won)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtVnd(r.cpl)}</td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right tabular-nums",
                    cpmqlTone(r.cpmql, r.targetCpmql, r.mql, r.spend),
                  )}
                >
                  {fmtVnd(r.cpmql)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtVnd(r.cac)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtRatioX(r.roas)}
                </td>
                <td className="px-2 py-1.5 text-xs">{r.ownerName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        products={products}
        owners={owners}
        onDone={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function StatusToggle({
  row,
  disabled,
  onDone,
}: {
  row: Row;
  disabled: boolean;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const cycle: Record<string, "ON" | "OFF" | "PAUSED"> = {
    ON: "PAUSED",
    PAUSED: "OFF",
    OFF: "ON",
  };
  const color =
    row.status === "ON"
      ? "text-ok"
      : row.status === "PAUSED"
        ? "text-warn"
        : "text-muted-foreground";
  return (
    <button
      disabled={disabled || pending}
      className={cn("text-xs font-medium", color, disabled && "cursor-default")}
      onClick={() =>
        start(async () => {
          const next = cycle[row.status];
          let reason: string | undefined;
          if (next === "OFF") {
            reason = window.prompt("Lý do tắt campaign (bắt buộc):") ?? undefined;
            if (!reason) return;
          }
          const res = await setCampaignStatusAction(row.id, next, reason);
          if (res.ok) onDone();
          else toast.error(res.error);
        })
      }
    >
      {row.status === "ON" ? "● ON" : row.status === "PAUSED" ? "❚❚ PAUSED" : "○ OFF"}
    </button>
  );
}

function CreateCampaignDialog({
  open,
  onOpenChange,
  products,
  owners,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: { id: string; code: string; name: string }[];
  owners: { id: string; fullName: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    displayName: "",
    productId: products[0]?.id ?? "",
    channel: "FB",
    objective: "MESSAGE",
    ownerId: owners[0]?.id ?? "",
    dailyBudget: "",
    externalId: "",
    startedOn: new Date().toISOString().slice(0, 10),
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Campaign mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <F label="Tên hiển thị">
            <Input value={f.displayName} onChange={(e) => set("displayName", e.target.value)} />
          </F>
          <div className="grid grid-cols-2 gap-2">
            <F label="Sản phẩm">
              <SimpleSelect
                value={f.productId}
                onValueChange={(v) => set("productId", v)}
                options={products.map((p) => ({ value: p.id, label: p.code }))}
              />
            </F>
            <F label="Kênh">
              <SimpleSelect
                value={f.channel}
                onValueChange={(v) => set("channel", v)}
                options={["FB", "GOOGLE", "TIKTOK", "KHAC"].map((c) => ({
                  value: c,
                  label: c,
                }))}
              />
            </F>
            <F label="Mục tiêu">
              <SimpleSelect
                value={f.objective}
                onValueChange={(v) => set("objective", v)}
                options={["MESSAGE", "LEADFORM", "TRAFFIC", "KHAC"].map((c) => ({
                  value: c,
                  label: c,
                }))}
              />
            </F>
            <F label="Người phụ trách">
              <SimpleSelect
                value={f.ownerId}
                onValueChange={(v) => set("ownerId", v)}
                options={owners.map((o) => ({ value: o.id, label: o.fullName }))}
              />
            </F>
            <F label="Ngân sách/ngày (đ)">
              <Input
                type="number"
                value={f.dailyBudget}
                onChange={(e) => set("dailyBudget", e.target.value)}
              />
            </F>
            <F label="Ngày bắt đầu">
              <Input
                type="date"
                value={f.startedOn}
                onChange={(e) => set("startedOn", e.target.value)}
              />
            </F>
          </div>
          <F label="ID Meta / Google (tùy chọn)">
            <Input value={f.externalId} onChange={(e) => set("externalId", e.target.value)} />
          </F>
          <Button
            className="w-full"
            disabled={pending || !f.displayName.trim()}
            onClick={() =>
              start(async () => {
                const res = await createCampaignAction({
                  displayName: f.displayName,
                  productId: f.productId,
                  channel: f.channel as never,
                  objective: f.objective as never,
                  ownerId: f.ownerId,
                  dailyBudget: f.dailyBudget ? Number(f.dailyBudget) : null,
                  externalId: f.externalId || null,
                  startedOn: f.startedOn,
                });
                if (res.ok) onDone();
                else toast.error(res.error);
              })
            }
          >
            Tạo
          </Button>
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
