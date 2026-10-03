"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "./actions";

/** SPEC Mục 8.2 — "Thêm task nhanh": gõ tiêu đề + ngày kiểu "mai", "t6", "25/10". */
function parseQuickDate(text: string): string | null {
  const today = new Date();
  const vn = new Date(today.getTime() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();
  const base = (offsetDays: number) => {
    const dt = new Date(Date.UTC(y, m, d + offsetDays));
    return dt.toISOString().slice(0, 10);
  };
  const lower = text.toLowerCase();
  if (lower.includes("hôm nay")) return base(0);
  if (lower.includes("mai")) return base(1);
  if (lower.includes("mốt")) return base(2);
  const dmy = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(text);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    const yy = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : y;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const weekdayMatch = /\bt([2-7])\b/.exec(lower);
  if (weekdayMatch) {
    const targetIso = Number(weekdayMatch[1]) - 1; // t2=1..t7=6
    const todayIso = new Date(`${base(0)}T00:00:00Z`).getUTCDay() || 7;
    let delta = targetIso - todayIso;
    if (delta <= 0) delta += 7;
    return base(delta);
  }
  return null;
}

function stripDateHints(text: string): string {
  return text
    .replace(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/, "")
    .replace(/\bhôm nay\b|\bmai\b|\bmốt\b|\bt[2-7]\b/gi, "")
    .trim();
}

export function QuickAddTask({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [pending, start] = React.useTransition();

  function submit() {
    const title = stripDateHints(value) || value.trim();
    if (!title) return;
    const dueDate = parseQuickDate(value);
    start(async () => {
      const res = await createTaskAction({ title, assigneeId: currentUserId, dueDate });
      if (res.ok) {
        setValue("");
        toast.success("Đã tạo task.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border p-2">
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        placeholder='Thêm task nhanh — vd "Gửi báo cáo tuần mai", "Duyệt ảnh t6", "Họp 25/10"'
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={pending}
      />
      <Button size="sm" onClick={submit} disabled={pending || !value.trim()}>
        Thêm
      </Button>
    </div>
  );
}
