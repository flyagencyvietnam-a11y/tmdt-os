"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { T1Wizard } from "./t1-wizard";
import { T2Wizard } from "./t2-wizard";
import { T3Wizard } from "./t3-wizard";
import { T4Wizard } from "./t4-wizard";

export function ImportWizard({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Tabs defaultValue="t1">
      <TabsList>
        <TabsTrigger value="t1">T1 — Plan campaign tháng</TabsTrigger>
        <TabsTrigger value="t3">T3 — Task lẻ hàng loạt</TabsTrigger>
        <TabsTrigger value="t4">T4 — Quy tắc lặp</TabsTrigger>
        {isAdmin && <TabsTrigger value="t2">T2 — Người dùng &amp; SBU</TabsTrigger>}
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
      {isAdmin && (
        <TabsContent value="t2" className="pt-4">
          <T2Wizard />
        </TabsContent>
      )}
    </Tabs>
  );
}
