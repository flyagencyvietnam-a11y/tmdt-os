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

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const money = (n: unknown) => (typeof n === "number" ? `${n.toLocaleString("vi-VN")} đ` : String(n));

/**
 * Tên + cách hiển thị thân thiện cho các khoá đã biết. Khoá lạ vẫn hiện (tên kỹ
 * thuật + JSON) để admin không bị "giấu" cấu hình. Sửa vẫn bằng JSON (giữ đúng
 * kiểu dữ liệu lưu trong app_settings) nhưng có ví dụ định dạng ngay bên dưới.
 */
const KNOWN: Record<string, { label: string; desc?: string; show: (v: unknown) => React.ReactNode; example?: string }> = {
  quiet_hours: {
    label: "Giờ yên lặng (không gửi email)",
    desc: "Ngoài khung giờ làm việc, email thông báo được giữ lại và gửi vào sáng hôm sau.",
    show: (v) => {
      const x = v as { start?: string; end?: string };
      return `Từ ${x?.start ?? "?"} đến ${x?.end ?? "?"} hôm sau`;
    },
    example: '{"start":"19:00","end":"07:30"}',
  },
  workload_overload_threshold: {
    label: "Ngưỡng quá tải (Workload)",
    desc: "Tính theo giờ ước tính; task chưa ước tính giờ thì tính theo số task.",
    show: (v) => {
      const x = v as { hours?: number; tasks?: number };
      return `${x?.hours ?? "?"} giờ hoặc ${x?.tasks ?? "?"} task / người / tuần`;
    },
    example: '{"hours":40,"tasks":8}',
  },
  escalation_threshold_days: { label: "Nhắc quản lý khi trễ hạn quá", desc: "Task trễ quá số ngày làm việc này sẽ tự nhắc quản lý.", show: (v) => `${v} ngày làm việc`, example: "2" },
  work_days: {
    label: "Ngày làm việc trong tuần",
    desc: "Dùng để tính hạn việc lặp (ngày làm việc đầu/cuối tháng) và hạn các bước content. Thứ 7 chỉ làm sáng nhưng được tính là ngày làm việc.",
    show: (v) => (Array.isArray(v) ? v.map((d) => WEEKDAY[Number(d) % 7]).join(", ") : String(v)),
    example: "[1,2,3,4,5,6]  (1 = Thứ 2 … 6 = Thứ 7, 0 = CN)",
  },
  ads_effectiveness_rubric: {
    label: "Ngưỡng điểm hiệu quả Ads",
    desc: "CPL/CAC tối đa để đạt 5, 4, 3, 2 điểm (vượt mức cuối = 1 điểm). Đổi khi phòng đổi chuẩn đánh giá.",
    show: (v) => {
      const x = v as { cplTiers?: number[]; cacTiers?: number[] };
      return (
        <span className="space-y-0.5">
          <span className="block">CPL (5→2 điểm): {x?.cplTiers?.map(money).join(" · ")}</span>
          <span className="block">CAC (5→2 điểm): {x?.cacTiers?.map(money).join(" · ")}</span>
        </span>
      );
    },
  },
};

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
    <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm shadow-xs">
      {settings.map((s) => {
        const known = KNOWN[s.key];
        return (
          <div key={s.key} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{known?.label ?? s.key}</div>
                {(known?.desc ?? s.description) && (
                  <div className="text-xs text-muted-foreground">{known?.desc ?? s.description?.replace(/\s*\(Mục [^)]*\)/g, "")}</div>
                )}
              </div>
              {editingKey !== s.key && (
                <Button size="sm" variant="ghost" className="h-7 shrink-0 text-muted-foreground" onClick={() => startEdit(s)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Sửa
                </Button>
              )}
            </div>
            {editingKey === s.key ? (
              <div className="mt-2 space-y-1.5">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="font-mono text-xs" />
                {known?.example && <p className="text-xs text-muted-foreground">Định dạng: <code>{known.example}</code></p>}
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
              <div className="mt-1.5 inline-block rounded-md bg-muted/60 px-2 py-1 text-xs">{known ? known.show(s.value) : <code>{JSON.stringify(s.value)}</code>}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
