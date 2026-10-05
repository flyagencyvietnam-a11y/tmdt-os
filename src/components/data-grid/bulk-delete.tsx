"use client";

import { Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * Nút "Xoá N dòng" cho thanh thao tác khi chọn nhiều dòng của DataGrid. Luôn hỏi xác nhận (kèm mô tả hậu quả).
 * `run` trả về thông điệp thành công (hoặc ném lỗi / trả { error }) — việc toast do nơi gọi quyết định.
 */
export function BulkDeleteButton({
  count,
  noun,
  warning,
  onRun,
}: {
  count: number;
  /** vd. "task", "campaign", "bài content" */
  noun: string;
  /** Thêm vào câu hỏi xác nhận, vd. "Task con và bài content đăng bài sẽ bị xoá theo." */
  warning?: string;
  onRun: () => Promise<void>;
}) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-red-600 hover:text-red-700"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Xoá ${count} ${noun}?${warning ? "\n\n" + warning : ""}\n\nDữ liệu được xoá mềm (admin có thể khôi phục từ DB), nhưng sẽ biến mất khỏi mọi danh sách.`)) return;
        start(onRun);
      }}
    >
      <Trash2 className="mr-1 h-3.5 w-3.5" /> {pending ? "Đang xoá…" : `Xoá ${count} ${noun}`}
    </Button>
  );
}
