"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EffectivenessRubric } from "@/lib/ads-metrics";
import { upsertAdsMetricAction } from "./actions";
import { EffBadge, F, Preview } from "./ads-ui";
import { aggregate, conversionLabel, derive, fmtMoney, LINE_LABELS, monthLabel, type Line, type MetricRow } from "./shared";

export function MetricEditDialog({
  target,
  line,
  period,
  rubric,
  onOpenChange,
  onDone,
}: {
  target: { row: MetricRow | null; sbuId: string | null; label: string };
  line: Line;
  period: string;
  rubric: EffectivenessRubric;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const row = target.row;
  const [f, setF] = React.useState({
    budget: row?.budget ?? "",
    centerOrderBudget: row?.centerOrderBudget ?? "",
    hoTopupBudget: row?.hoTopupBudget ?? "",
    leads: row?.leads ?? "",
    newStudents: row?.newStudents ?? "",
    messages: row?.messages ?? "",
    revenue: row?.revenue ?? "",
    actualRevenue: row?.actualRevenue ?? "",
    mql: row?.mql ?? "",
    deals: row?.deals ?? "",
    centerFeedback: row?.centerFeedback ?? "",
    mktAssessment: row?.mktAssessment ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isCenter = line === "b2c_center";
  const preview = derive(
    aggregate([{ ...(row ?? ({} as MetricRow)), line, periodType: "month", period, sbuId: target.sbuId, budget: f.budget || null, centerOrderBudget: f.centerOrderBudget || null, hoTopupBudget: f.hoTopupBudget || null, leads: f.leads || null, newStudents: f.newStudents || null, messages: f.messages || null, revenue: f.revenue || null, mql: f.mql || null, deals: f.deals || null } as MetricRow]),
    line,
    rubric,
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.label}</DialogTitle>
          <DialogDescription>
            {LINE_LABELS[line]} · {monthLabel(period)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {isCenter ? (
              <>
                <F label="NS Trung tâm order">
                  <Input type="number" value={f.centerOrderBudget} onChange={(e) => set("centerOrderBudget", e.target.value)} />
                </F>
                <F label="NS P.MKT thêm">
                  <Input type="number" value={f.hoTopupBudget} onChange={(e) => set("hoTopupBudget", e.target.value)} />
                </F>
              </>
            ) : (
              <div className="col-span-2">
                <F label="Ngân sách chi (VND)">
                  <Input type="number" value={f.budget} onChange={(e) => set("budget", e.target.value)} />
                </F>
              </div>
            )}
            <F label={isCenter ? "Lead (từ ads riêng của TT)" : "Lead / Data"} hint={isCenter ? "Chỉ phần quy riêng cho ads ngân sách trung tâm (báo cáo hiệu quả ads TT). Lead tổng của cả B2C nhập ở dòng \"Tổng B2C\"." : undefined}>
              <Input type="number" value={f.leads} onChange={(e) => set("leads", e.target.value)} />
            </F>
            <F label={isCenter ? "HVM (từ ads riêng của TT)" : conversionLabel(line)}>
              <Input type="number" value={f.newStudents} onChange={(e) => set("newStudents", e.target.value)} />
            </F>
            {line === "ecom" && (
              <>
                <F label="MQL">
                  <Input type="number" value={f.mql} onChange={(e) => set("mql", e.target.value)} />
                </F>
                <F label="Doanh thu">
                  <Input type="number" value={f.revenue} onChange={(e) => set("revenue", e.target.value)} />
                </F>
                <F label="Thực thu">
                  <Input type="number" value={f.actualRevenue} onChange={(e) => set("actualRevenue", e.target.value)} />
                </F>
              </>
            )}
            {line === "b2b" && (
              <>
                <F label="Mess">
                  <Input type="number" value={f.messages} onChange={(e) => set("messages", e.target.value)} />
                </F>
                <F label="Hợp đồng / Deal chốt">
                  <Input type="number" value={f.deals} onChange={(e) => set("deals", e.target.value)} />
                </F>
              </>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
            <Preview label="Tổng NS" value={fmtMoney(preview.spend)} />
            <Preview label="CPL" value={fmtMoney(preview.cpl)} />
            <Preview label="CAC" value={fmtMoney(preview.cac)} />
            <Preview label="Hiệu quả" value={<EffBadge label={preview.effectivenessLabel} />} />
          </div>

          {isCenter && (
            <>
              <F label="Feedback trung tâm">
                <Textarea rows={2} value={f.centerFeedback} onChange={(e) => set("centerFeedback", e.target.value)} />
              </F>
              <F label="MKT đánh giá">
                <Textarea rows={2} value={f.mktAssessment} onChange={(e) => set("mktAssessment", e.target.value)} />
              </F>
            </>
          )}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await upsertAdsMetricAction({
                    id: row?.id,
                    line,
                    periodType: "month",
                    period,
                    sbuId: target.sbuId,
                    budget: f.budget || null,
                    centerOrderBudget: f.centerOrderBudget || null,
                    hoTopupBudget: f.hoTopupBudget || null,
                    leads: f.leads || null,
                    newStudents: f.newStudents || null,
                    messages: f.messages || null,
                    revenue: f.revenue || null,
                    actualRevenue: f.actualRevenue || null,
                    mql: f.mql || null,
                    deals: f.deals || null,
                    centerFeedback: f.centerFeedback || null,
                    mktAssessment: f.mktAssessment || null,
                  });
                  if (res.ok) {
                    toast.success("Đã lưu.");
                    onDone();
                  } else toast.error(res.error);
                })
              }
            >
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
