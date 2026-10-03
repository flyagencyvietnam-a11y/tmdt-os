"use client";

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

export function ImportWizard({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Tabs defaultValue="t1">
      <TabsList className="flex-wrap">
        <TabsTrigger value="t1">T1 — Plan campaign</TabsTrigger>
        <TabsTrigger value="t3">T3 — Task lẻ</TabsTrigger>
        <TabsTrigger value="t4">T4 — Quy tắc lặp</TabsTrigger>
        <TabsTrigger value="t5">T5 — Request</TabsTrigger>
        <TabsTrigger value="t6">T6 — Content calendar</TabsTrigger>
        <TabsTrigger value="t7">T7 — Media plan</TabsTrigger>
        {isAdmin && <TabsTrigger value="t2">T2 — Người dùng &amp; SBU</TabsTrigger>}
        {isAdmin && <TabsTrigger value="t8">T8 — Foundation</TabsTrigger>}
        {isAdmin && <TabsTrigger value="t9">T9 — Danh mục SBU</TabsTrigger>}
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
      {isAdmin && (
        <TabsContent value="t8" className="pt-4">
          <T8Wizard />
        </TabsContent>
      )}
      {isAdmin && (
        <TabsContent value="t9" className="pt-4">
          <T9Wizard />
        </TabsContent>
      )}
    </Tabs>
  );
}
