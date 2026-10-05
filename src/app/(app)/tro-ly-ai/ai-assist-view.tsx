"use client";

import { Sparkles } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import type { SuggestedAction } from "@/lib/services/ai-assist";
import { analyzeplanTextAction, createTasksFromAiSuggestionsAction } from "./actions";

interface Row extends SuggestedAction {
  selected: boolean;
  assigneeId: string | null;
}

export function AiAssistView({ users, configured }: { users: { id: string; fullName: string }[]; configured: boolean }) {
  const router = useRouter();
  const [planText, setPlanText] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [pending, start] = React.useTransition();

  function guessAssignee(nameGuess: string | null): string | null {
    if (!nameGuess) return null;
    const hit = users.find((u) => u.fullName.toLowerCase().includes(nameGuess.toLowerCase()) || nameGuess.toLowerCase().includes(u.fullName.toLowerCase()));
    return hit?.id ?? null;
  }

  function analyze() {
    start(async () => {
      const res = await analyzeplanTextAction(planText);
      if (res.ok) {
        setRows(
          res.data.actions.map((a) => ({
            ...a,
            selected: true,
            assigneeId: guessAssignee(a.assigneeNameGuess),
          })),
        );
        toast.success(`AI gợi ý ${res.data.actions.length} action — kiểm tra lại trước khi tạo.`);
      } else toast.error(res.error);
    });
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const selectedCount = rows?.filter((r) => r.selected).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={planText}
          onChange={(e) => setPlanText(e.target.value)}
          rows={10}
          placeholder="Dán nội dung tài liệu kế hoạch (brief, email, ghi chú họp...) vào đây..."
          disabled={!configured}
        />
        <Button disabled={pending || !configured || !planText.trim()} onClick={analyze}>
          <Sparkles className="mr-1 h-4 w-4" /> Phân tích thành action
        </Button>
      </div>

      {rows && (
        <div className="space-y-3">
          <div className="overflow-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2">Tiêu đề</th>
                  <th className="px-2 py-2">Hạn</th>
                  <th className="px-2 py-2">Người phụ trách</th>
                  <th className="px-2 py-2">Ưu tiên</th>
                  <th className="px-2 py-2">Kênh</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="px-2 py-1.5">
                      <Checkbox checked={r.selected} onCheckedChange={(v) => updateRow(i, { selected: !!v })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8" value={r.title} onChange={(e) => updateRow(i, { title: e.target.value })} />
                      {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                    </td>
                    <td className="px-2 py-1.5">
                      <DateInput className="w-36 [&_input]:h-8" value={r.dueDate ?? ""} onChange={(v) => updateRow(i, { dueDate: v || null })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <SimpleSelect
                        triggerClassName="h-8 w-40"
                        value={r.assigneeId ?? ""}
                        onValueChange={(v) => updateRow(i, { assigneeId: v || null })}
                        options={[{ value: "", label: r.assigneeNameGuess ? `(?) ${r.assigneeNameGuess}` : "— chưa giao —" }, ...users.map((u) => ({ value: u.id, label: u.fullName }))]}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <SimpleSelect
                        triggerClassName="h-8 w-28"
                        value={r.priority}
                        onValueChange={(v) => v && updateRow(i, { priority: v as Row["priority"] })}
                        options={[
                          { value: "urgent", label: "Gấp" },
                          { value: "high", label: "Cao" },
                          { value: "medium", label: "Trung bình" },
                          { value: "low", label: "Thấp" },
                        ]}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input className="h-8 w-28" value={r.channel ?? ""} onChange={(e) => updateRow(i, { channel: e.target.value || null })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            disabled={pending || selectedCount === 0}
            onClick={() =>
              start(async () => {
                const selected = rows.filter((r) => r.selected);
                const res = await createTasksFromAiSuggestionsAction(
                  selected.map((r) => ({ title: r.title, dueDate: r.dueDate, assigneeId: r.assigneeId, priority: r.priority, channel: r.channel })),
                );
                if (res.ok) {
                  toast.success(`Đã tạo ${res.data.created} task.`);
                  setRows(null);
                  setPlanText("");
                  router.push("/task");
                } else toast.error(res.error);
              })
            }
          >
            Tạo {selectedCount} task đã chọn
          </Button>
        </div>
      )}
    </div>
  );
}
