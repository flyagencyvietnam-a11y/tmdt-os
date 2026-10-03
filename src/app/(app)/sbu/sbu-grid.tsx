"use client";

import * as React from "react";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import type { TagColor } from "@/components/data-grid/tag";

export interface SbuRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  region: string;
  active: boolean;
  ownerName: string | null;
}

const REGION_LABEL: Record<string, string> = {
  KV1: "Khu vực 1",
  KV2: "Khu vực 2",
  KV3: "Khu vực 3",
  KV2_KV3: "Khu vực 2/3",
  ONLINE: "Online",
  RND: "Nhóm nội bộ",
};
const REGION_COLORS: Record<string, TagColor> = {
  KV1: "blue",
  KV2: "violet",
  KV3: "purple",
  KV2_KV3: "indigo",
  ONLINE: "emerald",
  RND: "slate",
};
const KIND_LABEL: Record<string, string> = { center: "Trung tâm", online_center: "Trung tâm online", group: "Nhóm nội bộ" };

export function SbuGrid({ rows }: { rows: SbuRow[] }) {
  const columns: GridColumn<SbuRow>[] = React.useMemo(
    () => [
      {
        field: "code",
        header: "Mã",
        kind: "text",
        accessor: (r) => r.code,
        defaultWidth: 100,
        groupable: false,
        cell: (r) => (
          <a href={`/sbu/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.code}
          </a>
        ),
      },
      { field: "name", header: "Tên", kind: "text", accessor: (r) => r.name, defaultWidth: 220, groupable: false },
      { field: "kind", header: "Loại", kind: "enum", accessor: (r) => r.kind, enumLabels: KIND_LABEL, defaultWidth: 150 },
      {
        field: "region",
        header: "Khu vực",
        kind: "enum",
        accessor: (r) => r.region,
        enumLabels: REGION_LABEL,
        enumColors: REGION_COLORS,
        defaultWidth: 130,
      },
      {
        field: "ownerName",
        header: "HO phụ trách",
        kind: "enum",
        accessor: (r) => r.ownerName ?? "",
        cell: (r) => r.ownerName ?? <span className="text-muted-foreground">—</span>,
        defaultWidth: 150,
      },
      {
        field: "active",
        header: "Trạng thái",
        kind: "boolean",
        accessor: (r) => r.active,
        cell: (r) => (r.active ? "Hoạt động" : "Ngừng"),
        defaultWidth: 100,
        groupable: false,
      },
    ],
    [],
  );

  return <DataGrid entity="sbus" columns={columns} rows={rows} getRowId={(r) => r.id} emptyText="Chưa có SBU." />;
}
