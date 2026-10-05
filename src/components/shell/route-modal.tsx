"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const InModalContext = React.createContext(false);

/** true khi nội dung đang hiển thị trong popup (để ẩn nút "Quay lại", vì đóng popup = quay lại). */
export function useInRouteModal() {
  return React.useContext(InModalContext);
}

/**
 * Popup cho trang chi tiết (Task/Campaign/SBU) — dùng cùng Intercepting Routes của Next: URL vẫn đổi (chia sẻ được,
 * F5 ra trang đầy đủ), còn trang danh sách phía sau KHÔNG bị dựng lại nên giữ nguyên chế độ xem, bộ lọc và vị trí cuộn.
 * Đóng popup (Esc / bấm nền / nút X) = router.back().
 */
export function RouteModal({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setOpen(false);
          router.back();
        }
      }}
    >
      <DialogContent className="top-[4vh] max-h-[92vh] translate-y-0 gap-0 overflow-y-auto bg-background p-0 sm:max-w-6xl">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <InModalContext.Provider value>
          <div className="p-4 pt-6 sm:p-6">{children}</div>
        </InModalContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
