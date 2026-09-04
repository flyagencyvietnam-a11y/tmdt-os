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
import { Textarea } from "@/components/ui/textarea";
import type { FormRefs } from "@/lib/services/refs";
import { fmtDate, fmtDateTime, fmtVnd } from "@/lib/format";
import {
  createEnrollmentAction,
  recordInteractionAction,
  updateLeadAction,
} from "../actions";

const STAGE_LABELS: Record<string, string> = {
  NEW: "Mới",
  NO_CONTACT: "Không LH được",
  CONSULTING: "Đang tư vấn",
  MQL: "MQL",
  SQL: "SQL",
  WON: "Chốt HV",
};
const OUTCOME_LABELS: Record<string, string> = {
  OPEN: "Đang theo",
  WON: "Đã chốt",
  LOST: "Không chốt",
  DISQUALIFIED: "Không nhu cầu",
};
// Đồng bộ với src/lib/services/escalate.ts (5 phiên liên tiếp là Cold).
const COLD_AT = 5;
const WARM_OFFSET = 3; // khách phản hồi -> hẹn theo dõi lại sau 3 ngày
const ESC_OFFSET: Record<number, number | null> = { 1: 1, 2: 3, 3: 7, 4: 30 };
const ESC_HINT: Record<number, string> = {
  1: "Nhắc lại vào ngày hôm sau.",
  2: "Nhắc lại kèm chương trình ưu đãi.",
  3: "Nhắn hỏi thăm, không bán.",
  4: "Thăm dò lại nhu cầu — nhịp cuối trước khi chuyển Cold.",
};
const CHANNELS = ["CALL", "ZALO", "MESSENGER", "EMAIL", "SMS", "MEET"];
const RESULTS = [
  { v: "RESPONDED", l: "Có phản hồi" },
  { v: "NO_RESPONSE", l: "Không phản hồi" },
  { v: "RESCHEDULED", l: "Khách hẹn lại" },
  { v: "REFUSED", l: "Từ chối" },
];
const DISQ = [
  { v: "SPAM", l: "Spam" },
  { v: "WRONG_TARGET", l: "Sai đối tượng" },
  { v: "COMPETITOR", l: "Đối thủ" },
  { v: "DUPLICATE", l: "Trùng" },
  { v: "KHAC", l: "Khác" },
];

interface Lead {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  fbProfile: string | null;
  stage: string;
  maxStage: string;
  outcome: string;
  nextContactDate: string | null;
  silenceCount: number;
  isCold: boolean;
  lostReason: string | null;
  consultNote: string | null;
  receivedAt: string;
  mqlAt: string | null;
  sqlAt: string | null;
  wonAt: string | null;
  productId: string;
  source: string;
  emsStatus: string;
  emsLink: string | null;
}

export function LeadDetail(props: {
  lead: Lead;
  productLabel: string;
  campaignLabel: string | null;
  assigneeLabel: string;
  interactions: {
    id: string;
    occurredAt: string;
    channel: string;
    direction: string;
    result: string;
    content: string | null;
    stageBefore: string | null;
    stageAfter: string | null;
    nextContactDateSet: string | null;
  }[];
  history: {
    id: string;
    changedAt: string;
    fromStage: string | null;
    toStage: string | null;
    fromOutcome: string | null;
    toOutcome: string | null;
    reason: string | null;
  }[];
  enrollments: {
    id: string;
    contractDate: string;
    grossAmount: number;
    discountAmount: number;
    collectedAmount: number;
    studentCount: number;
    note: string | null;
  }[];
  refs: FormRefs;
  perms: {
    showContact: boolean;
    canEditStatus: boolean;
    canRevenue: boolean;
    canInteract: boolean;
    canEdit: boolean;
  };
}) {
  const { lead, perms } = props;
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const overdue =
    lead.outcome === "OPEN" && lead.nextContactDate && lead.nextContactDate < today;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{lead.fullName}</h1>
                {lead.isCold && <Badge variant="outline">Cold Data</Badge>}
              </div>
              <div className="font-mono text-xs text-muted-foreground">{lead.code}</div>
            </div>
            <div className="flex gap-1">
              <Badge variant="secondary">{STAGE_LABELS[lead.stage]}</Badge>
              <Badge
                variant={lead.outcome === "WON" ? "default" : "outline"}
              >
                {OUTCOME_LABELS[lead.outcome]}
              </Badge>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Row k="Sản phẩm" v={props.productLabel} />
            <Row k="Campaign" v={props.campaignLabel ?? "—"} />
            <Row k="Phụ trách" v={props.assigneeLabel} />
            <Row k="Tiếp nhận" v={fmtDate(lead.receivedAt)} />
            <Row
              k="Ngày LH lại"
              v={lead.nextContactDate ? fmtDate(lead.nextContactDate) : "—"}
              warn={!!overdue}
            />
            <Row k="Số lần im lặng" v={String(lead.silenceCount)} />
            {perms.showContact && <Row k="SĐT" v={lead.phone ?? "—"} />}
            {perms.showContact && <Row k="Email" v={lead.email ?? "—"} />}
            <Row k="Giai đoạn cao nhất" v={STAGE_LABELS[lead.maxStage]} />
            <Row
              k="Mốc"
              v={[
                lead.mqlAt && `MQL ${fmtDate(lead.mqlAt)}`,
                lead.sqlAt && `SQL ${fmtDate(lead.sqlAt)}`,
                lead.wonAt && `WON ${fmtDate(lead.wonAt)}`,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            />
          </dl>
          {lead.lostReason && (
            <p className="mt-2 rounded bg-muted/50 p-2 text-sm">
              <span className="text-muted-foreground">Lý do không chốt: </span>
              {lead.lostReason}
            </p>
          )}
          {lead.consultNote && (
            <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
              {lead.consultNote}
            </p>
          )}
        </div>

        {perms.canEditStatus && lead.outcome !== "DISQUALIFIED" && (
          <StatusControls
            lead={lead}
            onDone={() => router.refresh()}
          />
        )}

        {perms.canRevenue && (
          <RevenueSection
            lead={lead}
            refs={props.refs}
            enrollments={props.enrollments}
            onDone={() => router.refresh()}
          />
        )}

        {perms.canEdit && lead.outcome === "WON" && (
          <EmsSection lead={lead} onDone={() => router.refresh()} />
        )}

        {/* Lịch sử giai đoạn */}
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold">Lịch sử giai đoạn</h2>
          <ul className="space-y-1 text-sm">
            {props.history.length === 0 && (
              <li className="text-muted-foreground">Chưa có.</li>
            )}
            {props.history.map((h) => (
              <li key={h.id} className="flex gap-2">
                <span className="text-muted-foreground">
                  {fmtDateTime(h.changedAt)}
                </span>
                <span>
                  {h.fromStage ? STAGE_LABELS[h.fromStage] : "—"} →{" "}
                  {h.toStage ? STAGE_LABELS[h.toStage] : "—"}
                  {h.toOutcome && h.toOutcome !== h.fromOutcome
                    ? ` (${OUTCOME_LABELS[h.toOutcome]})`
                    : ""}
                  {h.reason ? ` — ${h.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right: care + interaction log */}
      <div className="space-y-4">
        {perms.canInteract && lead.outcome === "OPEN" && (
          <CareForm lead={lead} onDone={() => router.refresh()} />
        )}
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold">
            Lịch sử tương tác ({props.interactions.length})
          </h2>
          <ul className="space-y-2 text-sm">
            {props.interactions.length === 0 && (
              <li className="text-muted-foreground">Chưa có tương tác nào.</li>
            )}
            {[...props.interactions].reverse().map((i) => (
              <li key={i.id} className="rounded border p-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {i.channel} · {i.direction === "OUTBOUND" ? "gọi ra" : "khách nhắn"} ·{" "}
                    {RESULTS.find((r) => r.v === i.result)?.l ?? i.result}
                  </span>
                  <span>{fmtDateTime(i.occurredAt)}</span>
                </div>
                {i.content && <p className="mt-1 whitespace-pre-wrap">{i.content}</p>}
                {i.nextContactDateSet && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hẹn lại: {fmtDate(i.nextContactDateSet)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={warn ? "font-medium text-crit" : ""}>{v}</dd>
    </>
  );
}

function CareForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [pending, start] = React.useTransition();
  const [channel, setChannel] = React.useState("CALL");
  const [direction, setDirection] = React.useState("OUTBOUND");
  const [result, setResult] = React.useState("NO_RESPONSE");
  const [content, setContent] = React.useState("");
  const [stageAfter, setStageAfter] = React.useState("__keep");
  const [stageReason, setStageReason] = React.useState("");

  // Ngày LH lại tự điền theo bảng escalate (SPEC 8.2)
  const projectedSilence = result === "NO_RESPONSE" ? lead.silenceCount + 1 : 0;
  const willCold = projectedSilence >= COLD_AT;
  const autoOffset =
    result === "NO_RESPONSE" ? ESC_OFFSET[projectedSilence] ?? null : WARM_OFFSET;
  const suggested =
    autoOffset == null
      ? null
      : addDaysLocal(new Date().toISOString().slice(0, 10), autoOffset);
  // Không mirror `suggested` vào state: giá trị hiển thị = chỉnh tay (nếu có) ?? gợi ý.
  const [nextDateEdit, setNextDateEdit] = React.useState<string | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");
  const nextDate = nextDateEdit ?? suggested ?? "";
  const overridden = suggested != null && nextDate !== suggested;
  const setNextDate = (v: string) => setNextDateEdit(v);

  function submit() {
    start(async () => {
      const res = await recordInteractionAction({
        leadId: lead.id,
        channel: channel as never,
        direction: direction as never,
        result: result as never,
        content: content || null,
        stageAfter: stageAfter === "__keep" ? undefined : (stageAfter as never),
        stageChangeReason: stageReason || undefined,
        // Chỉ gửi override khi EC thực sự sửa; nếu không, để server tự tính (tránh
        // lệch do client không đẩy ngày nghỉ / lễ).
        nextContactDateOverride:
          !willCold && nextDateEdit != null ? nextDate || null : undefined,
        overrideReason: overrideReason || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã ghi nhận chăm sóc.");
      setContent("");
      setNextDateEdit(null);
      setOverrideReason("");
      onDone();
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 text-sm font-semibold">Chăm sóc nhanh</h2>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Mini label="Kênh">
            <SimpleSelect
              triggerClassName="h-8 w-full"
              value={channel}
              onValueChange={setChannel}
              options={CHANNELS.map((c) => ({ value: c, label: c }))}
            />
          </Mini>
          <Mini label="Hướng">
            <SimpleSelect
              triggerClassName="h-8 w-full"
              value={direction}
              onValueChange={setDirection}
              options={[
                { value: "OUTBOUND", label: "Mình liên hệ" },
                { value: "INBOUND", label: "Khách nhắn" },
              ]}
            />
          </Mini>
        </div>
        <Mini label="Kết quả">
          <SimpleSelect
            triggerClassName="h-8 w-full"
            value={result}
            onValueChange={(v) => {
              setResult(v);
              setNextDateEdit(null);
            }}
            options={RESULTS.map((r) => ({ value: r.v, label: r.l }))}
          />
        </Mini>
        <Mini label="Nội dung trao đổi">
          <Textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Mini>
        <Mini label="Giai đoạn mới (nếu có)">
          <SimpleSelect
            triggerClassName="h-8 w-full"
            value={stageAfter}
            onValueChange={setStageAfter}
            options={[
              { value: "__keep", label: "— giữ nguyên —" },
              ...["NO_CONTACT", "CONSULTING", "MQL", "SQL"].map((s) => ({
                value: s,
                label: STAGE_LABELS[s],
              })),
            ]}
          />
        </Mini>
        {stageAfter !== "__keep" && (
          <Input
            placeholder="Lý do (bắt buộc nếu hạ giai đoạn)"
            className="h-8"
            value={stageReason}
            onChange={(e) => setStageReason(e.target.value)}
          />
        )}

        {result === "NO_RESPONSE" && (
          <div className="rounded-md bg-muted/50 p-2 text-sm">
            {willCold ? (
              <p className="text-crit">
                Đây là lần im lặng thứ {projectedSilence}. Hệ thống sẽ tự chuyển{" "}
                <b>Cold Data</b> và đóng lead (SPEC 8.2).
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Lần im lặng thứ {projectedSilence} — {ESC_HINT[projectedSilence]}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ngày LH lại:</span>
                  <Input
                    type="date"
                    className="h-7 w-40"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                  />
                </div>
                {overridden && (
                  <Input
                    className="mt-1 h-7"
                    placeholder="Lý do sửa ngày (bắt buộc)"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                )}
              </>
            )}
          </div>
        )}

        <Button className="w-full" disabled={pending} onClick={submit}>
          Lưu chăm sóc
        </Button>
      </div>
    </div>
  );
}

function StatusControls({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [pending, start] = React.useTransition();
  const [lostOpen, setLostOpen] = React.useState(false);
  const [disqOpen, setDisqOpen] = React.useState(false);
  const [lostReason, setLostReason] = React.useState("");
  const [disqReason, setDisqReason] = React.useState("SPAM");

  function bump(stage: string, reason?: string) {
    start(async () => {
      const res = await updateLeadAction(lead.id, {
        stage: stage as never,
        reason,
      });
      if (res.ok) {
        toast.success("Đã cập nhật giai đoạn.");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-semibold">Giai đoạn & kết quả</h2>
      <div className="flex flex-wrap gap-1">
        {["NO_CONTACT", "CONSULTING", "MQL", "SQL"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={lead.stage === s ? "default" : "outline"}
            disabled={pending || lead.outcome === "WON"}
            onClick={() => {
              if (s === lead.stage) return;
              const lowering =
                ["NEW", "NO_CONTACT", "CONSULTING", "MQL", "SQL", "WON"].indexOf(s) <
                ["NEW", "NO_CONTACT", "CONSULTING", "MQL", "SQL", "WON"].indexOf(lead.stage);
              if (lowering) {
                const r = window.prompt("Lý do hạ giai đoạn:");
                if (!r) return;
                bump(s, r);
              } else bump(s);
            }}
          >
            {STAGE_LABELS[s]}
          </Button>
        ))}
      </div>
      {lead.outcome === "OPEN" && (
        <div className="mt-2 flex gap-1">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => setLostOpen(true)}
          >
            Không chốt
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setDisqOpen(true)}
          >
            Không nhu cầu / Spam
          </Button>
        </div>
      )}

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đánh dấu Không chốt</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Lý do (từ 10 ký tự — V03)</Label>
            <Textarea
              rows={3}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Hệ thống giữ lead làm warm audience, tự đặt Ngày LH lại +45 ngày.
            </p>
            <Button
              className="w-full"
              disabled={pending || lostReason.trim().length < 10}
              onClick={() =>
                start(async () => {
                  const res = await updateLeadAction(lead.id, {
                    outcome: "LOST",
                    lostReason,
                  });
                  if (res.ok) {
                    toast.success("Đã cập nhật.");
                    setLostOpen(false);
                    onDone();
                  } else toast.error(res.error);
                })
              }
            >
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={disqOpen} onOpenChange={setDisqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Không nhu cầu / Spam</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Lý do</Label>
            <SimpleSelect
              value={disqReason}
              onValueChange={setDisqReason}
              options={DISQ.map((d) => ({ value: d.v, label: d.l }))}
            />
            <Button
              className="w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateLeadAction(lead.id, {
                    outcome: "DISQUALIFIED",
                    disqualifyReason: disqReason as never,
                  });
                  if (res.ok) {
                    toast.success("Đã đóng lead.");
                    setDisqOpen(false);
                    onDone();
                  } else toast.error(res.error);
                })
              }
            >
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RevenueSection({
  lead,
  refs,
  enrollments,
  onDone,
}: {
  lead: Lead;
  refs: FormRefs;
  enrollments: {
    id: string;
    contractDate: string;
    grossAmount: number;
    discountAmount: number;
    collectedAmount: number;
    studentCount: number;
    note: string | null;
  }[];
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    productId: lead.productId,
    contractDate: new Date().toISOString().slice(0, 10),
    grossAmount: "",
    discountAmount: "0",
    collectedAmount: "",
    studentCount: "1",
    note: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Doanh thu ({enrollments.length})</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          Ghi doanh thu
        </Button>
      </div>
      {enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có. Tạo doanh thu đầu tiên sẽ tự chuyển lead sang “Chốt HV”.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {enrollments.map((e) => (
            <li key={e.id} className="flex justify-between">
              <span>
                {fmtDate(e.contractDate)} · {e.studentCount} HVM
                {e.note ? ` · ${e.note}` : ""}
              </span>
              <span className="font-medium">{fmtVnd(e.grossAmount - e.discountAmount)}</span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi doanh thu — {lead.fullName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Mini label="Sản phẩm">
              <SimpleSelect
                value={f.productId}
                onValueChange={(v) => set("productId", v)}
                options={refs.products.map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}`,
                }))}
              />
            </Mini>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Ngày hợp đồng">
                <Input
                  type="date"
                  value={f.contractDate}
                  onChange={(e) => set("contractDate", e.target.value)}
                />
              </Mini>
              <Mini label="Số HVM">
                <Input
                  type="number"
                  value={f.studentCount}
                  onChange={(e) => set("studentCount", e.target.value)}
                />
              </Mini>
              <Mini label="Doanh thu gộp (đ)">
                <Input
                  type="number"
                  value={f.grossAmount}
                  onChange={(e) => set("grossAmount", e.target.value)}
                />
              </Mini>
              <Mini label="Giảm trừ (đ)">
                <Input
                  type="number"
                  value={f.discountAmount}
                  onChange={(e) => set("discountAmount", e.target.value)}
                />
              </Mini>
              <Mini label="Tiền thực thu (đ)">
                <Input
                  type="number"
                  value={f.collectedAmount}
                  onChange={(e) => set("collectedAmount", e.target.value)}
                />
              </Mini>
            </div>
            <Mini label="Ghi chú">
              <Input value={f.note} onChange={(e) => set("note", e.target.value)} />
            </Mini>
            <Button
              className="w-full"
              disabled={pending || !f.grossAmount}
              onClick={() =>
                start(async () => {
                  const res = await createEnrollmentAction({
                    leadId: lead.id,
                    productId: f.productId,
                    contractDate: f.contractDate,
                    grossAmount: Number(f.grossAmount),
                    discountAmount: Number(f.discountAmount || 0),
                    collectedAmount: Number(f.collectedAmount || 0),
                    studentCount: Number(f.studentCount || 1),
                    note: f.note || null,
                  });
                  if (res.ok) {
                    toast.success("Đã ghi doanh thu.");
                    setOpen(false);
                    onDone();
                  } else toast.error(res.error);
                })
              }
            >
              Lưu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** Bàn giao DotB EMS (gộp từ tab "Bàn giao EMS" cũ) — chỉ cho lead đã chốt. */
function EmsSection({
  lead,
  onDone,
}: {
  lead: { id: string; emsStatus: string; emsLink: string | null };
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [link, setLink] = React.useState(lead.emsLink ?? "");
  const done = lead.emsStatus === "DA_NHAP";

  const save = (patch: { emsStatus?: "CHUA" | "DA_NHAP"; emsLink?: string | null }) =>
    start(async () => {
      const res = await updateLeadAction(lead.id, patch);
      if (res.ok) {
        toast.success("Đã lưu.");
        onDone();
      } else toast.error(res.error);
    });

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Bàn giao DotB EMS</h2>
        <Badge variant={done ? "secondary" : "outline"}>
          {done ? "Đã nhập EMS" : "Chưa nhập"}
        </Badge>
      </div>
      <div className="space-y-2">
        <Mini label="Link hồ sơ EMS của học viên">
          <div className="flex gap-2">
            <Input
              value={link}
              placeholder="https://ems.dotb..."
              onChange={(e) => setLink(e.target.value)}
              onBlur={() => {
                if ((link.trim() || null) !== (lead.emsLink ?? null))
                  save({ emsLink: link.trim() || null });
              }}
            />
            {lead.emsLink && (
              <Button
                variant="outline"
                render={
                  <a href={lead.emsLink} target="_blank" rel="noreferrer">
                    Mở
                  </a>
                }
              />
            )}
          </div>
        </Mini>
        <Button
          variant={done ? "outline" : "default"}
          disabled={pending}
          onClick={() => save({ emsStatus: done ? "CHUA" : "DA_NHAP" })}
        >
          {done ? "Đánh dấu chưa nhập" : "Đánh dấu đã nhập EMS"}
        </Button>
      </div>
    </div>
  );
}

function addDaysLocal(dayStr: string, days: number): string {
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  // Xem trước: đẩy khỏi Chủ nhật (ngày lễ do server xử lý khi lưu).
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
