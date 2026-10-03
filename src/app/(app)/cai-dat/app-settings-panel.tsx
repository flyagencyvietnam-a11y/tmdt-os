"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateAppSettingAction } from "./actions";

interface SettingRow {
  key: string;
  description: string | null;
  value: unknown;
}

export function AppSettingsPanel({ settings }: { settings: SettingRow[] }) {
  const router = useRouter();
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [pending, start] = React.useTransition();

  function startEdit(s: SettingRow) {
    setEditingKey(s.key);
    setDraft(JSON.stringify(s.value, null, 2));
  }

  return (
    <div className="divide-y rounded-lg border text-sm">
      {settings.map((s) => (
        <div key={s.key} className="px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium">{s.key}</div>
              <div className="text-xs text-muted-foreground">{s.description}</div>
            </div>
            {editingKey !== s.key && (
              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(s)}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
          {editingKey === s.key ? (
            <div className="mt-2 space-y-1.5">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="font-mono text-xs" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await updateAppSettingAction(s.key, draft);
                      if (res.ok) {
                        toast.success("Đã lưu.");
                        setEditingKey(null);
                        router.refresh();
                      } else toast.error(res.error);
                    })
                  }
                >
                  Lưu
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingKey(null)}>
                  Huỷ
                </Button>
              </div>
            </div>
          ) : (
            <code className="text-xs">{JSON.stringify(s.value)}</code>
          )}
        </div>
      ))}
    </div>
  );
}
