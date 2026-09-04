"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataGrid,
  type GridColumn,
  type SavedViewLike,
  type ViewConfig,
} from "@/components/data-grid";
import { fmtDate, fmtVnd } from "@/lib/format";
import { reassignLeadAction, updateLeadAction } from "./actions";

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
const EMS_STATUS_LABELS: Record<string, string> = {
  CHUA: "Chưa nhập",
  DA_NHAP: "Đã nhập EMS",
};
const SOURCE_LABELS: Record<string, string> = {
  FB: "Facebook",
  GOOGLE: "Google",
  TIKTOK: "TikTok",
  ZALO: "Zalo",
  HOTLINE: "Hotline",
  ORGANIC: "Organic",
  REFERRAL: "Giới thiệu",
  KHAC: "Khác",
};
// Thứ tự giai đoạn (để phát hiện "hạ giai đoạn" cần lý do — SPEC 8.1).
const STAGE_ORDER = ["NEW", "NO_CONTACT", "CONSULTING", "MQL", "SQL", "WON"];
const DISQ_REASONS = ["SPAM", "WRONG_TARGET", "COMPETITOR", "DUPLICATE", "KHAC"];

export interface LeadRow {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  productCode: string | null;
  productId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  consultNote: string | null;
  emsStatus: string;
  emsLink: string | null;
  source: string;
  stage: string;
  maxStage: string;
  outcome: string;
  assignedId: string | null;
  assignedName: string | null;
  nextContactDate: string | null;
  silenceCount: number;
  isCold: boolean;
  lastContactedAt: string | null;
  receivedAt: string | null;
  mqlAt: string | null;
  wonAt: string | null;
  revenue: number;
  interactionCount: number;
  score: number;
  scoreBand: string;
}

// Prebuilt views — SPEC Mục 11.4
const PREBUILT: SavedViewLike[] = [
  {
    id: "v-overdue",
    entity: "LEADS",
    name: "Quá hạn chăm sóc",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "outcome", operator: "is", value: "OPEN" },
          { field: "nextContactDate", operator: "is_overdue" },
        ],
      },
      sorts: [{ field: "nextContactDate", direction: "asc" }],
    },
  },
  {
    id: "v-today",
    entity: "LEADS",
    name: "Hôm nay",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [{ field: "nextContactDate", operator: "today" }],
      },
    },
  },
  {
    id: "v-new",
    entity: "LEADS",
    name: "Mới chưa xử lý",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [{ field: "stage", operator: "is", value: "NEW" }],
      },
    },
  },
  {
    id: "v-nonext",
    entity: "LEADS",
    name: "Thiếu Ngày LH lại",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "outcome", operator: "is", value: "OPEN" },
          { field: "nextContactDate", operator: "empty" },
          { field: "interactionCount", operator: "gte", value: 1 },
        ],
      },
    },
  },
  {
    id: "v-hot",
    entity: "LEADS",
    name: "Đang nóng",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "maxStage", operator: "is", value: "SQL" },
          { field: "outcome", operator: "is", value: "OPEN" },
        ],
      },
    },
  },
  {
    id: "v-cold-soon",
    entity: "LEADS",
    name: "Sắp thành Cold",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "silenceCount", operator: "gte", value: 4 },
          { field: "outcome", operator: "is", value: "OPEN" },
        ],
      },
    },
  },
  {
    id: "v-won-month",
    entity: "LEADS",
    name: "Chốt tháng này",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "outcome", operator: "is", value: "WON" },
          { field: "wonAt", operator: "this_month" },
        ],
      },
    },
  },
  {
    id: "v-remarket",
    entity: "LEADS",
    name: "Kho remarketing",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "outcome", operator: "is", value: "LOST" },
          { field: "nextContactDate", operator: "not_empty" },
        ],
      },
    },
  },
  {
    id: "v-mql-nophone",
    entity: "LEADS",
    name: "Thiếu SĐT nhưng là MQL",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "maxStage", operator: "any_of", value: ["MQL", "SQL", "WON"] },
          { field: "phone", operator: "empty" },
        ],
      },
    },
  },
  {
    id: "v-priority",
    entity: "LEADS",
    name: "Ưu tiên (điểm cao)",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "outcome", operator: "is", value: "OPEN" },
          { field: "score", operator: "gte", value: 45 },
        ],
      },
      sorts: [{ field: "score", direction: "desc" }],
    },
  },
  {
    id: "v-ems-pending",
    entity: "LEADS",
    name: "Chờ bàn giao EMS",
    visibility: "SHARED",
    isDefault: false,
    config: {
      filters: {
        conjunction: "and",
        conditions: [
          { field: "outcome", operator: "is", value: "WON" },
          { field: "emsStatus", operator: "is", value: "CHUA" },
        ],
      },
      columns: [
        { field: "emsStatus", visible: true },
        { field: "emsLink", visible: true },
      ],
      sorts: [{ field: "wonAt", direction: "desc" }],
    },
  },
];

export function LeadTable({
  rows,
  showContact,
  ecUsers,
  campaigns,
  products,
  canEdit,
  canChangeStatus,
  canReassign,
}: {
  rows: LeadRow[];
  showContact: boolean;
  ecUsers: { id: string; fullName: string }[];
  campaigns: { id: string; name: string }[];
  products: { id: string; code: string; name: string }[];
  canEdit: boolean;
  canChangeStatus: boolean;
  canReassign: boolean;
}) {
  const router = useRouter();
  const [savedViews, setSavedViews] = React.useState<SavedViewLike[]>(PREBUILT);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/views?entity=LEADS")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.views) && d.views.length)
          setSavedViews([...PREBUILT, ...d.views]);
      })
      .catch(() => {});
  }, []);

  /** Sửa tại chỗ trên grid. Trường có tùy chọn (Sản phẩm, Campaign, Nguồn, Giai đoạn,
   *  Kết quả, Phụ trách) hiện dạng dropdown. Đổi Giai đoạn/Kết quả chạy đúng máy trạng
   *  thái ở service (đóng dấu mql_at/sql_at, cập nhật max_stage, đóng task chăm sóc). */
  const onEditCell = React.useCallback(
    async (rowId: string, field: string, raw: string) => {
      const v = raw.trim();
      const row = rows.find((r) => r.id === rowId);
      type Patch = Parameters<typeof updateLeadAction>[1];
      let run: (() => Promise<{ ok: boolean; error?: string }>) | null = null;

      if (field === "assignedName") {
        if (!v || v === (row?.assignedId ?? "")) return;
        run = () => reassignLeadAction(rowId, v);
      } else {
        let patch: Patch | null = null;
        if (field === "fullName") {
          if (!v) return toast.error("Tên khách không được để trống.");
          patch = { fullName: v };
        } else if (field === "phone") patch = { phone: v || null };
        else if (field === "email") patch = { email: v || null };
        else if (field === "consultNote") patch = { consultNote: v || null };
        else if (field === "campaignName") patch = { campaignId: v || null };
        else if (field === "productCode") {
          if (!v || v === (row?.productId ?? "")) return;
          patch = { productId: v };
        } else if (field === "source") {
          if (!v || v === (row?.source ?? "")) return;
          patch = { source: v as Patch["source"] };
        } else if (field === "nextContactDate") {
          patch = { nextContactDate: v || null };
        } else if (field === "emsStatus") {
          patch = { emsStatus: v === "DA_NHAP" ? "DA_NHAP" : "CHUA" };
        } else if (field === "emsLink") patch = { emsLink: v || null };
        else if (field === "stage") {
          if (!v || v === (row?.stage ?? "")) return;
          if (v === "WON")
            return toast.error("Lên 'Chốt HV' phải qua tạo doanh thu (enrollment).");
          let reason: string | undefined;
          if (STAGE_ORDER.indexOf(v) < STAGE_ORDER.indexOf(row?.stage ?? "NEW")) {
            reason = window.prompt("Hạ giai đoạn — nhập lý do:")?.trim() || undefined;
            if (!reason) return;
          }
          patch = { stage: v as Patch["stage"], reason };
        } else if (field === "outcome") {
          if (!v || v === (row?.outcome ?? "")) return;
          if (v === "WON")
            return toast.error("Chốt HV phải qua tạo doanh thu (enrollment).");
          const p: Patch = { outcome: v as Patch["outcome"] };
          if (row?.outcome === "WON") {
            p.reason =
              window.prompt("Đổi trạng thái lead đã chốt — nhập lý do:")?.trim() ||
              undefined;
            if (!p.reason) return;
          }
          if (v === "LOST") {
            const lr = window.prompt("Lý do KHÔNG chốt (tối thiểu 10 ký tự):")?.trim() ?? "";
            if (lr.length < 10) return toast.error("Lý do phải từ 10 ký tự (V03).");
            p.lostReason = lr;
          }
          if (v === "DISQUALIFIED") {
            const dr = (
              window.prompt(
                "Lý do loại: " + DISQ_REASONS.join(" / "),
                "KHAC",
              ) ?? ""
            )
              .trim()
              .toUpperCase();
            if (!DISQ_REASONS.includes(dr))
              return toast.error("Lý do loại không hợp lệ.");
            p.disqualifyReason = dr as Patch["disqualifyReason"];
          }
          patch = p;
        }
        if (!patch) return;
        const finalPatch = patch;
        run = () => updateLeadAction(rowId, finalPatch);
      }

      if (!run) return;
      setSaving(true);
      const res = await run();
      setSaving(false);
      if (res.ok) {
        toast.success("Đã lưu.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Không lưu được.");
      }
    },
    [router, rows],
  );

  const columns: GridColumn<LeadRow>[] = React.useMemo(
    () => [
      {
        field: "code",
        header: "Mã",
        kind: "text",
        accessor: (r) => r.code,
        cell: (r) => (
          <Link href={`/lead/${r.id}`} className="font-mono text-xs text-brand hover:underline">
            {r.code}
          </Link>
        ),
        defaultWidth: 110,
        groupable: false,
      },
      {
        field: "fullName",
        header: "Khách",
        kind: "text",
        accessor: (r) => r.fullName,
        editable: canEdit,
        cell: (r) => {
          const inner = (
            <>
              {r.fullName}
              {r.isCold && (
                <Badge variant="outline" className="ml-1">
                  Cold
                </Badge>
              )}
            </>
          );
          // Khi được phép sửa: bỏ link để nhấp đôi không điều hướng (mở chi tiết qua cột Mã).
          return canEdit ? (
            <span>{inner}</span>
          ) : (
            <Link href={`/lead/${r.id}`} className="hover:underline">
              {inner}
            </Link>
          );
        },
        groupable: false,
      },
      ...(showContact
        ? [
            {
              field: "phone",
              header: "SĐT",
              kind: "text" as const,
              accessor: (r: LeadRow) => r.phone,
              editable: canEdit,
              groupable: false,
            },
            {
              field: "email",
              header: "Email",
              kind: "text" as const,
              accessor: (r: LeadRow) => r.email,
              editable: canEdit,
              groupable: false,
            },
          ]
        : []),
      {
        field: "productCode",
        header: "Sản phẩm",
        kind: "enum",
        accessor: (r) => r.productCode,
        enumOptions: [...new Set(rows.map((r) => r.productCode).filter(Boolean))].map(
          (c) => ({ value: c as string, label: c as string }),
        ),
        editable: canEdit,
        editKind: "select",
        editOptions: products.map((p) => ({
          value: p.id,
          label: `${p.code} — ${p.name}`,
        })),
        editValue: (r) => r.productId ?? "",
      },
      {
        field: "campaignName",
        header: "Campaign",
        kind: "text",
        accessor: (r) => r.campaignName ?? "—",
        filterOptions: campaigns.map((c) => ({ value: c.name, label: c.name })),
        editable: canEdit,
        editKind: "select",
        editOptions: [
          { value: "", label: "— bỏ campaign —" },
          ...campaigns.map((c) => ({ value: c.id, label: c.name })),
        ],
        editValue: (r) => r.campaignId ?? "",
      },
      {
        field: "consultNote",
        header: "Ghi chú",
        kind: "text",
        accessor: (r) => r.consultNote,
        editable: canEdit,
        groupable: false,
        cell: (r) =>
          r.consultNote ? (
            <span className="line-clamp-1" title={r.consultNote}>
              {r.consultNote}
            </span>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
      {
        field: "emsStatus",
        header: "EMS",
        kind: "enum",
        accessor: (r) => r.emsStatus,
        enumLabels: EMS_STATUS_LABELS,
        enumOptions: Object.entries(EMS_STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(EMS_STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editValue: (r) => r.emsStatus,
        cell: (r) => (
          <Badge variant={r.emsStatus === "DA_NHAP" ? "secondary" : "outline"}>
            {EMS_STATUS_LABELS[r.emsStatus] ?? r.emsStatus}
          </Badge>
        ),
      },
      {
        field: "emsLink",
        header: "Link EMS",
        kind: "text",
        accessor: (r) => r.emsLink,
        editable: canEdit,
        groupable: false,
        cell: (r) =>
          r.emsLink ? (
            <a
              href={r.emsLink}
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              mở EMS
            </a>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
      {
        field: "source",
        header: "Nguồn",
        kind: "enum",
        accessor: (r) => r.source,
        enumLabels: SOURCE_LABELS,
        enumOptions: Object.entries(SOURCE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editable: canEdit,
        editKind: "select",
        editOptions: Object.entries(SOURCE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editValue: (r) => r.source,
      },
      {
        field: "stage",
        header: "Giai đoạn",
        kind: "enum",
        accessor: (r) => r.stage,
        enumLabels: STAGE_LABELS,
        enumOptions: Object.entries(STAGE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editable: canEdit && canChangeStatus,
        editKind: "select",
        editOptions: Object.entries(STAGE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editValue: (r) => r.stage,
        cell: (r) => <Badge variant="secondary">{STAGE_LABELS[r.stage]}</Badge>,
      },
      {
        field: "maxStage",
        header: "Cao nhất",
        kind: "enum",
        accessor: (r) => r.maxStage,
        enumLabels: STAGE_LABELS,
        enumOptions: Object.entries(STAGE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      },
      {
        field: "outcome",
        header: "Kết quả",
        kind: "enum",
        accessor: (r) => r.outcome,
        enumLabels: OUTCOME_LABELS,
        enumOptions: Object.entries(OUTCOME_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editable: canEdit && canChangeStatus,
        editKind: "select",
        editOptions: Object.entries(OUTCOME_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        editValue: (r) => r.outcome,
      },
      {
        field: "assignedName",
        header: "Phụ trách",
        kind: "text",
        accessor: (r) => r.assignedName ?? "—",
        filterOptions: ecUsers.map((u) => ({
          value: u.fullName,
          label: u.fullName,
        })),
        editable: canReassign,
        editKind: "select",
        editOptions: ecUsers.map((u) => ({ value: u.id, label: u.fullName })),
        editValue: (r) => r.assignedId ?? "",
      },
      {
        field: "nextContactDate",
        header: "Ngày LH lại",
        kind: "date",
        accessor: (r) => r.nextContactDate,
        editable: canEdit,
        editInputType: "date",
        editValue: (r) => r.nextContactDate ?? "",
        cell: (r) => {
          if (!r.nextContactDate) return <span className="text-muted-foreground">–</span>;
          const overdue =
            r.outcome === "OPEN" &&
            r.nextContactDate < new Date().toISOString().slice(0, 10);
          return (
            <span className={overdue ? "font-medium text-crit" : ""}>
              {fmtDate(r.nextContactDate)}
            </span>
          );
        },
      },
      {
        field: "score",
        header: "Điểm",
        kind: "number",
        accessor: (r) => r.score,
        align: "right",
        cell: (r) => (
          <span
            className={
              r.scoreBand === "hot"
                ? "font-semibold text-crit"
                : r.scoreBand === "warm"
                  ? "font-medium text-warn"
                  : "text-muted-foreground"
            }
          >
            {r.score}
          </span>
        ),
      },
      {
        field: "silenceCount",
        header: "Im lặng",
        kind: "number",
        accessor: (r) => r.silenceCount,
        align: "right",
      },
      {
        field: "interactionCount",
        header: "Lần CS",
        kind: "number",
        accessor: (r) => r.interactionCount,
        align: "right",
      },
      {
        field: "revenue",
        header: "Doanh thu",
        kind: "money",
        accessor: (r) => r.revenue,
        cell: (r) => (r.revenue ? fmtVnd(r.revenue) : "–"),
        align: "right",
      },
      {
        field: "receivedAt",
        header: "Tiếp nhận",
        kind: "date",
        accessor: (r) => r.receivedAt,
        cell: (r) => fmtDate(r.receivedAt),
      },
      {
        field: "wonAt",
        header: "Ngày chốt",
        kind: "date",
        accessor: (r) => r.wonAt,
        cell: (r) => fmtDate(r.wonAt),
      },
    ],
    [
      rows,
      showContact,
      canEdit,
      canChangeStatus,
      canReassign,
      campaigns,
      products,
      ecUsers,
    ],
  );

  const initialView: ViewConfig = {
    columns: [
      { field: "maxStage", visible: false },
      { field: "wonAt", visible: false },
      { field: "email", visible: false },
      { field: "consultNote", visible: false },
      { field: "emsStatus", visible: false },
      { field: "emsLink", visible: false },
      { field: "revenue", aggregate: "sum" },
    ],
    rowHeight: "medium",
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {PREBUILT.map((v) => (
          <QuickViewButton
            key={v.id}
            name={v.name}
            count={
              rows.filter((r) => matchesView(r, v.config)).length
            }
          />
        ))}
        {canEdit && (
          <span className="ml-auto text-xs text-muted-foreground">
            {saving ? "Đang lưu…" : "Nhấp đôi ô để sửa"}
          </span>
        )}
      </div>
      <DataGrid
        entity="LEADS"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        initialView={initialView}
        savedViews={savedViews}
        onEditCell={canEdit || canReassign ? onEditCell : undefined}
        onSaveView={async (name, config) => {
          const res = await fetch("/api/views", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entity: "LEADS", name, config, visibility: "PRIVATE" }),
          });
          if (res.ok) {
            const d = await res.json();
            setSavedViews((s) => [...s, d.view]);
            toast.success("Đã lưu view.");
          } else toast.error("Không lưu được view.");
        }}
        onDeleteView={async (id) => {
          await fetch(`/api/views/${id}`, { method: "DELETE" });
          setSavedViews((s) => s.filter((v) => v.id !== id));
        }}
        onExportAudit={() => {}}
        bulkActions={
          canReassign
            ? (selected, clear) => (
                <ReassignBulk
                  ids={selected.map((r) => r.id)}
                  ecUsers={ecUsers}
                  onDone={() => {
                    clear();
                    router.refresh();
                  }}
                />
              )
            : undefined
        }
      />
    </div>
  );
}

function QuickViewButton({ name, count }: { name: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
      {name}
      <Badge variant="secondary">{count}</Badge>
    </span>
  );
}

function ReassignBulk({
  ids,
  ecUsers,
  onDone,
}: {
  ids: string[];
  ecUsers: { id: string; fullName: string }[];
  onDone: () => void;
}) {
  const [to, setTo] = React.useState(ecUsers[0]?.id ?? "");
  const [pending, start] = React.useTransition();
  return (
    <span className="flex items-center gap-2">
      <select
        className="h-7 rounded border bg-background px-1 text-sm"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      >
        {ecUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending || !to}
        onClick={() =>
          start(async () => {
            for (const id of ids) await reassignLeadAction(id, to);
            toast.success(`Đã chuyển ${ids.length} lead.`);
            onDone();
          })
        }
      >
        Chuyển {ids.length}
      </Button>
    </span>
  );
}

// đánh giá nhanh 1 lớp filter cho badge đếm (không đệ quy — prebuilt view chỉ 1 cấp)
function matchesView(r: LeadRow, cfg: ViewConfig): boolean {
  const g = cfg.filters;
  if (!g) return true;
  const today = new Date().toISOString().slice(0, 10);
  return g.conditions.every((c) => {
    if ("conditions" in c) return true;
    const v = (r as unknown as Record<string, unknown>)[c.field];
    switch (c.operator) {
      case "is":
        return v === c.value;
      case "any_of":
        return Array.isArray(c.value) && (c.value as unknown[]).includes(v);
      case "empty":
        return v == null || v === "";
      case "not_empty":
        return v != null && v !== "";
      case "gte":
        return Number(v) >= Number(c.value);
      case "today":
        return v === today;
      case "is_overdue":
        return typeof v === "string" && v < today;
      case "this_month":
        return typeof v === "string" && v.slice(0, 7) === today.slice(0, 7);
      default:
        return true;
    }
  });
}
