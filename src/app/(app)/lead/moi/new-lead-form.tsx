"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormRefs } from "@/lib/services/refs";
import { checkDuplicatesAction, createLeadAction } from "../actions";

const SOURCES = [
  { v: "FB", l: "Facebook" },
  { v: "GOOGLE", l: "Google" },
  { v: "TIKTOK", l: "TikTok" },
  { v: "ZALO", l: "Zalo" },
  { v: "HOTLINE", l: "Hotline" },
  { v: "ORGANIC", l: "Organic / tự nhiên" },
  { v: "REFERRAL", l: "Giới thiệu" },
  { v: "KHAC", l: "Khác" },
];
const NO_CAMPAIGN = new Set(["ORGANIC", "REFERRAL", "HOTLINE"]);
const STAGES = [
  { v: "NEW", l: "Mới" },
  { v: "NO_CONTACT", l: "Không liên hệ được" },
  { v: "CONSULTING", l: "Đang tư vấn" },
  { v: "MQL", l: "MQL" },
  { v: "SQL", l: "SQL" },
];

const str = (v: unknown) => (v == null ? "" : String(v));

export function NewLeadForm({
  refs,
  currentUserId,
}: {
  refs: FormRefs;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [showOptional, setShowOptional] = React.useState(false);
  const [dups, setDups] = React.useState<Awaited<
    ReturnType<typeof checkDuplicatesAction>
  > | null>(null);

  const [f, setF] = React.useState({
    fullName: "",
    productId: refs.products[0]?.id ?? "",
    source: "FB",
    campaignId: "",
    stage: "NEW",
    assignedTo: currentUserId,
    phone: "",
    email: "",
    fbProfile: "",
    consultNote: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const showCampaign = !NO_CAMPAIGN.has(f.source);
  const campaignOptions = refs.campaigns.filter(
    (c) => c.productId === f.productId && c.status !== "OFF",
  );

  async function runDedup() {
    if (f.fullName.trim().length < 2) return;
    const res = await checkDuplicatesAction({
      fullName: f.fullName,
      phone: f.phone || null,
      email: f.email || null,
      productId: f.productId,
      campaignId: showCampaign && f.campaignId ? f.campaignId : null,
    });
    setDups(res);
  }

  function submit(keepAndNext: boolean) {
    start(async () => {
      const res = await createLeadAction({
        fullName: f.fullName,
        productId: f.productId,
        source: f.source as never,
        campaignId: showCampaign && f.campaignId ? f.campaignId : null,
        stage: f.stage as never,
        assignedTo: f.stage === "NEW" && !f.assignedTo ? null : f.assignedTo,
        phone: f.phone || null,
        email: f.email || null,
        fbProfile: f.fbProfile || null,
        consultNote: f.consultNote || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Đã tạo lead ${res.data?.code}`);
      if (keepAndNext) {
        setF((p) => ({
          ...p,
          fullName: "",
          phone: "",
          email: "",
          fbProfile: "",
          consultNote: "",
          stage: "NEW",
        }));
        setDups(null);
      } else {
        router.push(`/lead/${res.data?.id}`);
      }
    });
  }

  return (
    <form
      className="space-y-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <Field label="Họ tên khách *">
        <Input
          value={f.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          onBlur={runDedup}
          required
          autoFocus
        />
      </Field>

      {dups && dups.level !== "none" && (
        <div
          className={
            dups.level === "red"
              ? "rounded-md border border-crit/40 bg-crit/10 p-2 text-sm"
              : "rounded-md border border-warn/40 bg-warn/10 p-2 text-sm"
          }
        >
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {dups.level === "red"
              ? "Nghi trùng cao — cân nhắc gộp vào lead cũ"
              : "Có thể trùng — vẫn tạo mới được"}
          </div>
          <ul className="space-y-0.5">
            {dups.candidates.map((c) => (
              <li key={c.id}>
                <span className="font-mono text-xs">{c.code}</span> · {c.fullName}
                {c.phone ? ` · ${c.phone}` : ""} · {c.reasons.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sản phẩm *">
          <Select value={f.productId} onValueChange={(v) => set("productId", str(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {refs.products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                  {!p.isActive ? " (ngừng)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Nguồn *">
          <Select value={f.source} onValueChange={(v) => set("source", str(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((s) => (
                <SelectItem key={s.v} value={s.v}>
                  {s.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {showCampaign && (
        <Field label="Campaign">
          <Select
            value={f.campaignId || "__none"}
            onValueChange={(v) => set("campaignId", str(v) === "__none" ? "" : str(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="— chưa gán —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— chưa gán —</SelectItem>
              {campaignOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.displayName} ({c.internalCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Giai đoạn *">
          <Select value={f.stage} onValueChange={(v) => set("stage", str(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s.v} value={s.v}>
                  {s.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Người phụ trách">
          <Select value={f.assignedTo} onValueChange={(v) => set("assignedTo", str(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {refs.ecUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground"
        onClick={() => setShowOptional((s) => !s)}
      >
        <ChevronDown
          className={`h-4 w-4 transition ${showOptional ? "rotate-180" : ""}`}
        />
        Thông tin thêm (SĐT, email, ghi chú)
      </button>

      {showOptional && (
        <div className="space-y-3 rounded-md border border-dashed p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số điện thoại">
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
          <Field label="Facebook (link/tên)">
            <Input
              value={f.fbProfile}
              onChange={(e) => set("fbProfile", e.target.value)}
            />
          </Field>
          <Field label="Ghi chú tư vấn">
            <Textarea
              value={f.consultNote}
              onChange={(e) => set("consultNote", e.target.value)}
              rows={3}
            />
          </Field>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={pending || f.fullName.trim().length < 2}>
          Lưu
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || f.fullName.trim().length < 2}
          onClick={() => submit(true)}
        >
          Lưu và nhập tiếp
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
