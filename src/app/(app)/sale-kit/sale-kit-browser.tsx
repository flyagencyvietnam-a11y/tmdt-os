"use client";

import { Copy, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate } from "@/lib/format";
import {
  createSaleKitAction,
  deleteSaleKitAction,
  setSaleKitStatusAction,
} from "./actions";

const CATS: [string, string][] = [
  ["PRODUCT_INFO", "Thông tin sản phẩm"],
  ["PRICING", "Bảng giá & gói"],
  ["SCHEDULE", "Lịch khai giảng"],
  ["PROMO", "Khuyến mãi"],
  ["TEMPLATE", "Sale kit / template"],
  ["SCRIPT", "Kịch bản tư vấn"],
  ["FAQ", "Câu hỏi thường gặp"],
  ["OBJECTION", "Xử lý phản đối"],
];

interface Item {
  id: string;
  category: string;
  productId: string | null;
  title: string;
  body: string | null;
  linkUrl: string | null;
  validUntil: string | null;
  status: string;
  expired: boolean;
}

export function SaleKitBrowser({
  items,
  products,
  canManage,
  initialQ,
}: {
  items: Item[];
  products: { id: string; code: string }[];
  canManage: boolean;
  initialQ: string;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQ);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  function search(v: string) {
    setQ(v);
    const p = new URLSearchParams();
    if (v.trim()) p.set("q", v.trim());
    router.replace(`/sale-kit${p.toString() ? `?${p}` : ""}`);
  }

  const byCat = new Map<string, Item[]>();
  for (const i of items) {
    if (!byCat.has(i.category)) byCat.set(i.category, []);
    byCat.get(i.category)!.push(i);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Tìm nội dung…"
          value={q}
          onChange={(e) => search(e.target.value)}
          className="max-w-sm"
        />
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nội dung mới
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {canManage
            ? "Chưa có nội dung nào. Thêm mới rồi bấm Duyệt để EC thấy được."
            : "Chưa có nội dung phù hợp."}
        </p>
      )}

      {CATS.filter(([k]) => byCat.has(k)).map(([k, label]) => (
        <section key={k}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{label}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {byCat.get(k)!.map((it) => (
              <div
                key={it.id}
                className={`rounded-lg border p-3 ${it.expired ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{it.title}</div>
                  <div className="flex shrink-0 gap-1">
                    {it.status !== "APPROVED" && (
                      <Badge variant="outline">{it.status}</Badge>
                    )}
                    {it.expired && (
                      <Badge variant="outline" className="text-crit">
                        hết hạn
                      </Badge>
                    )}
                  </div>
                </div>
                {it.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {it.body}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {it.body && (
                    <button
                      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted"
                      onClick={() => {
                        navigator.clipboard?.writeText(it.body ?? "");
                        toast.success("Đã sao chép.");
                      }}
                    >
                      <Copy className="h-3 w-3" /> Sao chép
                    </button>
                  )}
                  {it.linkUrl && (
                    <a
                      href={it.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline"
                    >
                      Mở link
                    </a>
                  )}
                  {it.validUntil && (
                    <span className="text-muted-foreground">
                      hạn {fmtDate(it.validUntil)}
                    </span>
                  )}
                  {canManage && (
                    <span className="ml-auto flex gap-1">
                      {it.status !== "APPROVED" ? (
                        <button
                          className="text-ok hover:underline"
                          onClick={() =>
                            start(async () => {
                              const r = await setSaleKitStatusAction(it.id, "APPROVED");
                              if (r.ok) router.refresh();
                              else toast.error(r.error);
                            })
                          }
                        >
                          Duyệt
                        </button>
                      ) : (
                        <button
                          className="hover:underline"
                          onClick={() =>
                            start(async () => {
                              await setSaleKitStatusAction(it.id, "DRAFT");
                              router.refresh();
                            })
                          }
                        >
                          Bỏ duyệt
                        </button>
                      )}
                      <button
                        className="text-crit hover:underline"
                        onClick={() =>
                          start(async () => {
                            await deleteSaleKitAction(it.id);
                            router.refresh();
                          })
                        }
                        disabled={pending}
                      >
                        Xóa
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {canManage && (
        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          products={products}
          onDone={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  products,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: { id: string; code: string }[];
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [f, setF] = React.useState({
    category: "SCRIPT",
    productId: "",
    title: "",
    body: "",
    linkUrl: "",
    validUntil: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nội dung Sale Kit mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Fld label="Nhóm">
              <SimpleSelect
                value={f.category}
                onValueChange={(v) => set("category", v)}
                options={CATS.map(([k, l]) => ({ value: k, label: l }))}
              />
            </Fld>
            <Fld label="Sản phẩm (tùy chọn)">
              <SimpleSelect
                value={f.productId || "__none"}
                onValueChange={(v) => set("productId", v === "__none" ? "" : v)}
                options={[
                  { value: "__none", label: "— chung —" },
                  ...products.map((p) => ({ value: p.id, label: p.code })),
                ]}
              />
            </Fld>
          </div>
          <Fld label="Tiêu đề">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
          </Fld>
          <Fld label="Nội dung (sao chép được)">
            <Textarea
              rows={4}
              value={f.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </Fld>
          <div className="grid grid-cols-2 gap-2">
            <Fld label="Link Canva / Drive">
              <Input
                value={f.linkUrl}
                onChange={(e) => set("linkUrl", e.target.value)}
              />
            </Fld>
            <Fld label="Hạn hiệu lực">
              <Input
                type="date"
                value={f.validUntil}
                onChange={(e) => set("validUntil", e.target.value)}
              />
            </Fld>
          </div>
          <Button
            className="w-full"
            disabled={pending || !f.title.trim()}
            onClick={() =>
              start(async () => {
                const r = await createSaleKitAction({
                  category: f.category as never,
                  productId: f.productId || null,
                  title: f.title,
                  body: f.body || null,
                  linkUrl: f.linkUrl || null,
                  validUntil: f.validUntil || null,
                });
                if (r.ok) {
                  toast.success("Đã tạo (trạng thái Nháp — nhớ Duyệt).");
                  onDone();
                } else toast.error(r.error);
              })
            }
          >
            Tạo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
