"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runMonitoringJobNowAction, runNightlyJobsNowAction, runWeeklyJobsNowAction } from "./actions";

export function JobsPanel() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [lastResult, setLastResult] = React.useState<string | null>(null);

  function run(label: string, fn: () => Promise<{ ok: boolean; data?: unknown; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setLastResult(`${label}: ${JSON.stringify(res.data)}`);
        toast.success(`${label} — xong.`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi không xác định.");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("Job đêm (sinh lặp, trễ hạn, tóm tắt ngày, monitoring)", () => runNightlyJobsNowAction())}>
          <Play className="mr-1 h-4 w-4" /> Chạy job đêm
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("Tổng kết tuần + báo cáo tuần", () => runWeeklyJobsNowAction())}>
          <Play className="mr-1 h-4 w-4" /> Chạy job tuần
        </Button>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run("Cảnh báo Monitoring", () => runMonitoringJobNowAction())}>
          <Play className="mr-1 h-4 w-4" /> Chạy cảnh báo Monitoring
        </Button>
      </div>
      {lastResult && <p className="text-xs text-muted-foreground">{lastResult}</p>}
    </div>
  );
}
