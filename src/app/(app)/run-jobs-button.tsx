"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runMorningJobsAction } from "./actions";

export function RunJobsButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runMorningJobsAction();
          toast.success(r.summary, { duration: 8000 });
          router.refresh();
        })
      }
    >
      <RefreshCw className={`mr-1 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      Chạy tác vụ ngay
    </Button>
  );
}
