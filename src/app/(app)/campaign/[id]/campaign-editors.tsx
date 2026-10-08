"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/date-input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateCampaignAction } from "../actions";
import { CAMPAIGN_INFO_FIELDS, CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE, CAMPAIGN_TYPE_LABEL, type CampaignInfoKey } from "../campaign-meta";

type Patch = Parameters<typeof updateCampaignAction>[0];

function useSave(id: string) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const save = React.useCallback(
    (patch: Omit<Patch, "id">, ok?: string) =>
      start(async () => {
        const res = await updateCampaignAction({ id, ...patch } as Patch);
        if (res.ok) {
          if (ok) toast.success(ok);
          router.refresh();
        } else toast.error(res.error);
      }),
    [id, router],
  );
  return { save, pending };
}

/** Trạng thái · loại · owner · thời gian của campaign — sửa ngay tại chỗ (nhân sự Marketing). */
export function CampaignMetaBar({
  id,
  status,
  type,
  ownerId,
  startDate,
  endDate,
  owners,
  canEdit,
}: {
  id: string;
  status: string;
  type: string;
  ownerId: string | null;
  startDate: string;
  endDate: string;
  owners: { id: string; fullName: string }[];
  canEdit: boolean;
}) {
  const { save, pending } = useSave(id);
  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {node}
    </div>
  );
  const ownerName = owners.find((o) => o.id === ownerId)?.fullName;
  return (
    <div className={cn("grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-5", pending && "opacity-70")}>
      {field(
        "Trạng thái",
        canEdit ? (
          <SimpleSelect value={status} onValueChange={(v) => v && v !== status && save({ status: v }, "Đã đổi trạng thái.")} options={Object.entries(CAMPAIGN_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        ) : (
          <span className={cn("inline-block rounded-md px-2 py-1 text-xs font-semibold", CAMPAIGN_STATUS_TONE[status])}>{CAMPAIGN_STATUS_LABEL[status] ?? status}</span>
        ),
      )}
      {field(
        "Loại campaign",
        canEdit ? (
          <SimpleSelect value={type} onValueChange={(v) => v && v !== type && save({ type: v as never }, "Đã đổi loại.")} options={Object.entries(CAMPAIGN_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        ) : (
          <span className="text-sm">{CAMPAIGN_TYPE_LABEL[type] ?? type}</span>
        ),
      )}
      {field(
        "Owner (chịu trách nhiệm)",
        canEdit ? (
          <SimpleSelect value={ownerId ?? ""} onValueChange={(v) => v && v !== ownerId && save({ ownerId: v }, "Đã đổi owner.")} placeholder="Chọn owner" options={owners.map((o) => ({ value: o.id, label: o.fullName }))} />
        ) : (
          <span className={cn("text-sm", !ownerName && "font-medium text-red-600")}>{ownerName ?? "Chưa có owner"}</span>
        ),
      )}
      {field("Bắt đầu", canEdit ? <DateInput value={startDate} onChange={(v) => v && v !== startDate && v <= endDate && save({ startDate: v }, "Đã đổi ngày bắt đầu.")} /> : <span className="text-sm tabular-nums">{startDate}</span>)}
      {field("Kết thúc", canEdit ? <DateInput value={endDate} onChange={(v) => v && v !== endDate && v >= startDate && save({ endDate: v }, "Đã đổi ngày kết thúc.")} /> : <span className="text-sm tabular-nums">{endDate}</span>)}
    </div>
  );
}

/** Các khối thông tin mô tả campaign (mục tiêu, hero, kênh, KPI…) — bấm vào khối để sửa, rời ô là lưu. */
export function CampaignInfoPanel({ id, values, canEdit }: { id: string; values: Record<CampaignInfoKey, string | null>; canEdit: boolean }) {
  const { save } = useSave(id);
  const [editing, setEditing] = React.useState<CampaignInfoKey | null>(null);
  const shown = CAMPAIGN_INFO_FIELDS.filter((f) => canEdit || values[f.key]);
  if (shown.length === 0) return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Campaign chưa có thông tin mô tả.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {shown.map((f) => {
        const v = values[f.key];
        const isEditing = editing === f.key;
        return (
          <div key={f.key} className={cn("group rounded-xl border bg-card p-3 shadow-xs", f.wide && "md:col-span-2")}>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {f.label}
              {canEdit && !isEditing && (
                <button type="button" onClick={() => setEditing(f.key)} className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Sửa ${f.label}`}>
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {isEditing ? (
              <Textarea
                autoFocus
                rows={Math.min(10, Math.max(3, Math.ceil((v ?? "").length / 90) + (v ?? "").split("\n").length))}
                defaultValue={v ?? ""}
                className="text-sm"
                onBlur={(e) => {
                  setEditing(null);
                  const next = e.target.value.trim();
                  if (next !== (v ?? "")) save({ [f.key]: next } as never, "Đã lưu.");
                }}
                onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
              />
            ) : v ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed" onDoubleClick={() => canEdit && setEditing(f.key)}>
                {v}
              </p>
            ) : (
              <button type="button" className="text-sm text-muted-foreground/70 hover:text-foreground" onClick={() => setEditing(f.key)}>
                Chưa có — bấm để thêm
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
