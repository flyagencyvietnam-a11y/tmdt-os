"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { duplicateCampaignAction } from "../actions";

export function DuplicateCampaignDialog({ campaignId, sourceCode }: { campaignId: string; sourceCode: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [newCode, setNewCode] = React.useState(`${sourceCode}-COPY`);
  const [dayOffset, setDayOffset] = React.useState(30);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="mr-1 h-4 w-4" /> Nhân bản campaign
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nhân bản campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Tạo campaign mới kèm toàn bộ task con, dời ngày theo số ngày lệch bên dưới.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Mã campaign mới</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dời ngày (số ngày, có thể âm)</Label>
              <Input
                type="number"
                value={dayOffset}
                onChange={(e) => setDayOffset(Number(e.target.value))}
              />
            </div>
            <Button
              className="w-full"
              disabled={pending || !newCode.trim()}
              onClick={() =>
                start(async () => {
                  const res = await duplicateCampaignAction({ campaignId, newCode: newCode.trim(), dayOffset });
                  if (res.ok) {
                    toast.success("Đã nhân bản campaign.");
                    setOpen(false);
                    router.push(`/campaign/${res.id}`);
                  } else toast.error(res.error);
                })
              }
            >
              Nhân bản
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
