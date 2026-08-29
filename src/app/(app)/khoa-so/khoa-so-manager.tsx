"use client";

import { Lock, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { lockPeriodAction, unlockPeriodAction } from "./actions";

const str = (v: unknown) => (v == null ? "" : String(v));

export function KhoaSoManager({
  suggestions,
  locks,
}: {
  suggestions: { label: string; start: string; end: string }[];
  locks: {
    id: string;
    periodStart: string;
    periodEnd: string;
    lockedAt: string;
    unlockedAt: string | null;
    note: string | null;
  }[];
}) {
  const router = useRouter();
  const [pick, setPick] = React.useState(suggestions[1]?.label ?? suggestions[0]?.label);
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const chosen = suggestions.find((s) => s.label === pick);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold">Khóa một tháng</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tháng</label>
            <Select value={pick} onValueChange={(v) => setPick(str(v))}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suggestions.map((s) => (
                  <SelectItem key={s.label} value={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="h-8 w-56"
            placeholder="Ghi chú (tùy chọn)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            disabled={pending || !chosen}
            onClick={() =>
              start(async () => {
                if (!chosen) return;
                const r = await lockPeriodAction(chosen.start, chosen.end, note || undefined);
                if (r.ok) {
                  toast.success(`Đã khóa sổ ${chosen.label}.`);
                  setNote("");
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            <Lock className="mr-1 h-4 w-4" /> Khóa sổ
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-3 py-2 text-sm font-semibold">Lịch sử khóa sổ</div>
        {locks.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Chưa khóa kỳ nào.
          </p>
        ) : (
          <ul className="divide-y">
            {locks.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {fmtDate(l.periodStart)} → {fmtDate(l.periodEnd)}
                    {l.unlockedAt ? (
                      <Badge variant="outline">đã mở khóa</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-crit">
                        đang khóa
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Khóa lúc {fmtDateTime(l.lockedAt)}
                    {l.unlockedAt ? ` · mở lúc ${fmtDateTime(l.unlockedAt)}` : ""}
                    {l.note ? ` · ${l.note}` : ""}
                  </div>
                </div>
                {!l.unlockedAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const reason = window.prompt("Lý do mở khóa sổ (bắt buộc):");
                        if (!reason) return;
                        const r = await unlockPeriodAction(l.id, reason);
                        if (r.ok) {
                          toast.success("Đã mở khóa.");
                          router.refresh();
                        } else toast.error(r.error);
                      })
                    }
                  >
                    <LockOpen className="mr-1 h-4 w-4" /> Mở khóa
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
