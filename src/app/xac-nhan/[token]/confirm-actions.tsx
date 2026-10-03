"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmDoneAction, reportBlockedAction } from "./actions";

export function ConfirmActions({ token }: { token: string }) {
  const [pending, start] = React.useTransition();
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showBlockedForm, setShowBlockedForm] = React.useState(false);
  const [reason, setReason] = React.useState("");

  if (done) return <p className="text-sm text-ok">Đã ghi nhận. Cảm ơn bạn!</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-crit">{error}</p>}
      {!showBlockedForm ? (
        <div className="flex gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await confirmDoneAction(token);
                if (res.ok) setDone(true);
                else setError(res.error);
              })
            }
          >
            Xác nhận đã xong
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setShowBlockedForm(true)}>
            Báo vướng
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea placeholder="Mô tả vướng mắc..." value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button
            disabled={pending || !reason.trim()}
            onClick={() =>
              start(async () => {
                const res = await reportBlockedAction(token, reason);
                if (res.ok) setDone(true);
                else setError(res.error);
              })
            }
          >
            Gửi báo vướng
          </Button>
        </div>
      )}
    </div>
  );
}
