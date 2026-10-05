"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInRouteModal } from "@/components/shell/route-modal";
import { deleteCampaignsAction } from "../actions";

export function DeleteCampaignButton({ campaignId, name, taskCount }: { campaignId: string; name: string; taskCount: number }) {
  const router = useRouter();
  const inModal = useInRouteModal();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-red-600 hover:text-red-700"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Xoá campaign “${name}”?\n\n${taskCount} task action plan sẽ bị xoá theo; task/bài content gắn campaign chỉ bị gỡ liên kết.`)) return;
        start(async () => {
          const res = await deleteCampaignsAction([campaignId]);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`Đã xoá campaign (${res.tasks} task).`);
          if (inModal) router.back();
          else router.push("/campaign");
          router.refresh();
        });
      }}
    >
      <Trash2 className="mr-1 h-3.5 w-3.5" /> Xoá
    </Button>
  );
}
