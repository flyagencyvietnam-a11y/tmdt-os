"use client";

import { Megaphone } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TaskCampaignRef {
  id: string;
  code: string;
  name: string;
}
export interface TaskSbuRef {
  id: string;
  code: string;
}

const MAX_SBU = 3;

/**
 * Ngữ cảnh của task: campaign nó thuộc về + các SBU (trung tâm/brand) liên quan. Dùng chung cho thẻ danh sách và thẻ Kanban.
 * Dùng `next/link` để campaign mở dạng popup như mọi nơi khác; không có gì để hiện thì không vẽ gì.
 */
export function TaskLinks({ campaign, sbus, className }: { campaign?: TaskCampaignRef | null; sbus?: TaskSbuRef[]; className?: string }) {
  const list = sbus ?? [];
  if (!campaign && list.length === 0) return null;
  const shown = list.slice(0, MAX_SBU);
  const rest = list.slice(MAX_SBU);
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {campaign && (
        <Link
          href={`/campaign/${campaign.id}`}
          draggable={false}
          title={`Campaign: ${campaign.code} — ${campaign.name}`}
          className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand hover:bg-brand/15"
        >
          <Megaphone className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {campaign.code} <span className="font-normal opacity-80">· {campaign.name}</span>
          </span>
        </Link>
      )}
      {shown.map((s) => (
        <Link
          key={s.id}
          href={`/sbu/${s.id}`}
          draggable={false}
          title={`SBU: ${s.code}`}
          className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground/80 hover:bg-muted/70 hover:text-brand"
        >
          {s.code}
        </Link>
      ))}
      {rest.length > 0 && (
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" title={rest.map((s) => s.code).join(", ")}>
          +{rest.length}
        </span>
      )}
    </span>
  );
}
