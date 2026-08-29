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
import { reassignLeadAction } from "./actions";

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

export interface LeadRow {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  productCode: string | null;
  campaignName: string | null;
  source: string;
  stage: string;
  maxStage: string;
  outcome: string;
  assignedName: string | null;
  nextContactDate: string | null;
  silenceCount: number;
  isCold: boolean;
  receivedAt: string | null;
  mqlAt: string | null;
  wonAt: string | null;
  revenue: number;
  interactionCount: number;
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
];

export function LeadTable({
  rows,
  showContact,
  ecUsers,
  canReassign,
}: {
  rows: LeadRow[];
  showContact: boolean;
  ecUsers: { id: string; fullName: string }[];
  canReassign: boolean;
}) {
  const router = useRouter();
  const [savedViews, setSavedViews] = React.useState<SavedViewLike[]>(PREBUILT);

  React.useEffect(() => {
    fetch("/api/views?entity=LEADS")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.views) && d.views.length)
          setSavedViews([...PREBUILT, ...d.views]);
      })
      .catch(() => {});
  }, []);

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
        cell: (r) => (
          <Link href={`/lead/${r.id}`} className="hover:underline">
            {r.fullName}
            {r.isCold && (
              <Badge variant="outline" className="ml-1">
                Cold
              </Badge>
            )}
          </Link>
        ),
        groupable: false,
      },
      ...(showContact
        ? [
            {
              field: "phone",
              header: "SĐT",
              kind: "text" as const,
              accessor: (r: LeadRow) => r.phone,
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
      },
      {
        field: "campaignName",
        header: "Campaign",
        kind: "text",
        accessor: (r) => r.campaignName ?? "—",
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
      },
      {
        field: "assignedName",
        header: "Phụ trách",
        kind: "text",
        accessor: (r) => r.assignedName ?? "—",
      },
      {
        field: "nextContactDate",
        header: "Ngày LH lại",
        kind: "date",
        accessor: (r) => r.nextContactDate,
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
    [rows, showContact],
  );

  const initialView: ViewConfig = {
    columns: [
      { field: "maxStage", visible: false },
      { field: "wonAt", visible: false },
      { field: "revenue", aggregate: "sum" },
    ],
    rowHeight: "medium",
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {PREBUILT.map((v) => (
          <QuickViewButton
            key={v.id}
            name={v.name}
            count={
              rows.filter((r) => matchesView(r, v.config)).length
            }
          />
        ))}
      </div>
      <DataGrid
        entity="LEADS"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        initialView={initialView}
        savedViews={savedViews}
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
