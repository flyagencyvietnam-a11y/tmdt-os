"use client";

import Link from "next/link";
import * as React from "react";
import { DataGrid, type GridColumn } from "@/components/data-grid";
import { Tag, type TagColor } from "@/components/data-grid/tag";
import { fmtDate } from "@/lib/format";

export interface CampaignContentRow {
  id: string;
  publishDate: string;
  topic: string;
  channels: string[];
  pillar: string | null;
  status: string;
  ownerName: string;
  taskCode: string | null;
  taskId: string | null;
}

const STATUS_LABELS: Record<string, string> = { brief: "Brief", drafting: "Đang soạn", designing: "Đang thiết kế", in_review: "Chờ duyệt", approved: "Đã duyệt", published: "Đã đăng", cancelled: "Huỷ" };
const STATUS_COLORS: Record<string, TagColor> = { brief: "slate", drafting: "blue", designing: "violet", in_review: "amber", approved: "teal", published: "emerald", cancelled: "gray" };
const CHANNEL_COLORS: Record<string, TagColor> = { Fanpage: "sky", TikTok: "pink", Zalo: "blue", Website: "slate", YouTube: "red", Khác: "gray" };

/** Bài content thuộc campaign (chỉ xem; sửa ở trang Content). */
export function CampaignContent({ rows }: { rows: CampaignContentRow[] }) {
  const columns: GridColumn<CampaignContentRow>[] = React.useMemo(
    () => [
      { field: "publishDate", header: "Ngày đăng", kind: "date", accessor: (r) => r.publishDate, cell: (r) => fmtDate(r.publishDate), defaultWidth: 110 },
      {
        field: "topic",
        header: "Chủ đề",
        kind: "text",
        accessor: (r) => r.topic,
        groupable: false,
        defaultWidth: 380,
        cell: (r) => (
          <Link href={`/content?item=${r.id}`} className="truncate font-medium hover:text-brand hover:underline" title={r.topic}>
            {r.topic}
          </Link>
        ),
      },
      {
        field: "channels",
        header: "Kênh",
        kind: "enum",
        accessor: (r) => r.channels,
        enumOptions: Object.keys(CHANNEL_COLORS).map((c) => ({ value: c, label: c })),
        cell: (r) => (
          <span className="flex gap-1 overflow-hidden">
            {r.channels.map((c) => (
              <Tag key={c} color={CHANNEL_COLORS[c] ?? "gray"}>
                {c}
              </Tag>
            ))}
          </span>
        ),
        defaultWidth: 180,
      },
      { field: "pillar", header: "Trụ cột", kind: "text", accessor: (r) => r.pillar ?? "", defaultWidth: 110 },
      { field: "status", header: "Trạng thái", kind: "enum", accessor: (r) => r.status, enumLabels: STATUS_LABELS, enumColors: STATUS_COLORS, defaultWidth: 120 },
      { field: "ownerName", header: "Phụ trách", kind: "text", accessor: (r) => r.ownerName, cell: (r) => r.ownerName || <span className="text-muted-foreground">—</span>, defaultWidth: 130 },
      {
        field: "taskCode",
        header: "Task đăng bài",
        kind: "text",
        accessor: (r) => r.taskCode ?? "",
        sortable: false,
        groupable: false,
        cell: (r) =>
          r.taskId ? (
            <Link href={`/task/${r.taskId}`} className="font-mono text-xs text-brand hover:underline">
              {r.taskCode}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        defaultWidth: 110,
      },
    ],
    [],
  );
  return <DataGrid entity="campaign_content" columns={columns} rows={rows} getRowId={(r) => r.id} initialView={{ sorts: [{ field: "publishDate", direction: "asc" }] }} allowCustomColumns={false} emptyText="Campaign chưa có bài content nào." />;
}
