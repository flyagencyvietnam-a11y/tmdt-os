"use client";

import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { T1Wizard } from "./t1-wizard";
import { T2Wizard } from "./t2-wizard";
import { T3Wizard } from "./t3-wizard";
import { T4Wizard } from "./t4-wizard";
import { T5Wizard } from "./t5-wizard";
import { T6Wizard } from "./t6-wizard";
import { T7Wizard } from "./t7-wizard";
import { T8Wizard } from "./t8-wizard";
import { T9Wizard } from "./t9-wizard";

const VALID_TABS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"];

export function ImportWizard({ isAdmin }: { isAdmin: boolean }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "t1";

  return (
    <Tabs defaultValue={initialTab}>
      <ol className="mb-4 grid gap-2 sm:grid-cols-3">
        {[
          ["Tải template", "Chọn loại dữ liệu bên dưới, bấm “Tải template” để lấy file mẫu đúng cột."],
          ["Điền & tải lên", "Điền dữ liệu (cột có * là bắt buộc), chọn file rồi bấm “Tải lên & kiểm tra”."],
          ["Xem trước & xác nhận", "Hệ thống báo dòng lỗi / tạo mới / cập nhật. Chưa ghi gì cho tới khi bạn xác nhận."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-xl border bg-card p-3 shadow-xs">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">{i + 1}</span>
            <span>
              <span className="block text-sm font-medium">{t}</span>
              <span className="block text-xs text-muted-foreground">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="t1">T1 — Plan campaign</TabsTrigger>
        <TabsTrigger value="t3">T3 — Task lẻ</TabsTrigger>
        <TabsTrigger value="t4">T4 — Quy tắc lặp</TabsTrigger>
        <TabsTrigger value="t5">T5 — Request</TabsTrigger>
        <TabsTrigger value="t6">T6 — Content calendar</TabsTrigger>
        <TabsTrigger value="t7">T7 — Media plan</TabsTrigger>
        {isAdmin && <TabsTrigger value="t2">T2 — Người dùng &amp; SBU</TabsTrigger>}
        <TabsTrigger value="t8">T8 — Foundation</TabsTrigger>
        <TabsTrigger value="t9">T9 — Danh mục SBU</TabsTrigger>
      </TabsList>
      <TabsContent value="t1" className="pt-4">
        <T1Wizard />
      </TabsContent>
      <TabsContent value="t3" className="pt-4">
        <T3Wizard />
      </TabsContent>
      <TabsContent value="t4" className="pt-4">
        <T4Wizard />
      </TabsContent>
      <TabsContent value="t5" className="pt-4">
        <T5Wizard />
      </TabsContent>
      <TabsContent value="t6" className="pt-4">
        <T6Wizard />
      </TabsContent>
      <TabsContent value="t7" className="pt-4">
        <T7Wizard />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="t2" className="pt-4">
          <T2Wizard />
        </TabsContent>
      )}
      <TabsContent value="t8" className="pt-4">
        <T8Wizard />
      </TabsContent>
      <TabsContent value="t9" className="pt-4">
        <T9Wizard />
      </TabsContent>
    </Tabs>
  );
}
