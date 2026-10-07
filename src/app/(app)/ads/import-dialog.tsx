"use client";

import { Download, FileUp, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { FileInput } from "@/components/file-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdsImportKind, AdsImportPreviewRow } from "@/lib/services/import/ads-import";
import { commitAdsImportAction, previewAdsImportAction } from "./actions";

const COPY: Record<AdsImportKind, { title: string; desc: string }> = {
  plan: {
    title: "Nhập Excel — Kế hoạch tháng",
    desc: "Ngân sách kế hoạch và mục tiêu theo phễu của từng mảng (B2C: Hệ thống + từng trung tâm). Ô trống giữ nguyên số cũ; mọi thay đổi được ghi nhật ký.",
  },
  week: {
    title: "Nhập Excel — Hàng tuần",
    desc: "Số liệu tuần (Thứ 7 → Thứ 6) theo mảng: ngân sách và các chỉ số tuần của mảng; B2C có thêm từng trung tâm.",
  },
  month: {
    title: "Nhập Excel — Hàng tháng",
    desc: "Số liệu tháng của 6 mảng (B2C Hệ thống = tổng B2C, B2C Trung tâm, Ecom, B2B, VMT/OSIR, VMP) + Ecom theo sản phẩm. Số tháng nhập riêng, không cộng từ tuần.",
  },
  request: {
    title: "Nhập Excel — Theo request",
    desc: "Từng request/chiến dịch ads (chi phí, ngân sách kế hoạch, người chạy, tin nhắn, tiếp cận, tương tác…) — của trung tâm B2C hoặc của các mảng khác.",
  },
};

const ACTION_LABEL = { create: "Tạo mới", update: "Cập nhật", skip: "Bỏ qua", error: "Lỗi" } as const;
const ACTION_TONE = {
  create: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  update: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  skip: "bg-muted text-muted-foreground",
  error: "bg-red-500/12 text-red-700 dark:text-red-400",
} as const;

/** Nút + hộp thoại nhập Excel theo template cho tab Tuần / Tháng / Request. */
export function AdsImportButton({ kind, templateQuery }: { kind: AdsImportKind; templateQuery?: string }) {
  // templateQuery: ?month=… / ?week=… / &group=… điền sẵn khung template theo kỳ và mảng đang xem.
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="mr-1 h-4 w-4" /> Nhập Excel
      </Button>
      {open && <ImportDialog kind={kind} templateQuery={templateQuery} onOpenChange={setOpen} />}
    </>
  );
}

function ImportDialog({ kind, templateQuery, onOpenChange }: { kind: AdsImportKind; templateQuery?: string; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<AdsImportPreviewRow[] | null>(null);
  const [done, setDone] = React.useState<{ created: number; updated: number; skipped: number; errors: number } | null>(null);

  const form = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Chưa chọn file.");
      return null;
    }
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    return fd;
  };

  const count = (a: AdsImportPreviewRow["action"]) => rows?.filter((r) => r.action === a).length ?? 0;
  const writable = count("create") + count("update");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{COPY[kind].title}</DialogTitle>
          <DialogDescription>{COPY[kind].desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ol className="grid gap-2 text-xs sm:grid-cols-3">
            {["Tải template (đã điền sẵn khung)", "Nhập số rồi chọn file → Kiểm tra", "Xem trước → Xác nhận ghi"].map((t, i) => (
              <li key={t} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/import/template/ads/${kind}${templateQuery ? `?${templateQuery}` : ""}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Download className="mr-1 h-4 w-4" /> Tải template
            </a>
            <FileInput ref={fileRef} accept=".xlsx" />
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                const fd = form();
                if (!fd) return;
                start(async () => {
                  const res = await previewAdsImportAction(fd);
                  if (res.ok) {
                    setRows(res.data.rows);
                    setDone(null);
                  } else toast.error(res.error);
                });
              }}
            >
              <Upload className="mr-1 h-4 w-4" /> Kiểm tra file
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ô để <b>trống</b> = giữ nguyên số cũ; ô có số = ghi đè (muốn về 0 thì nhập 0). Nạp lại cùng file không tạo trùng. Chưa ghi gì cho tới khi bạn bấm xác nhận.
          </p>

          {rows && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {(["create", "update", "skip", "error"] as const).map((a) => (
                  <span key={a} className={cn("rounded-md px-2 py-1 font-semibold", ACTION_TONE[a])}>
                    {count(a)} {ACTION_LABEL[a].toLowerCase()}
                  </span>
                ))}
              </div>
              <div className="max-h-80 overflow-auto rounded-xl border bg-card shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 border-b bg-muted/70 text-xs text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 font-medium">Dòng</th>
                      <th className="px-3 py-2 font-medium">Sheet</th>
                      <th className="px-3 py-2 font-medium">Đối tượng</th>
                      <th className="px-3 py-2 font-medium">Sẽ ghi</th>
                      <th className="px-3 py-2 font-medium">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => (
                      <tr key={i} className={cn(r.action === "error" && "bg-red-500/[0.04]", r.action === "skip" && "text-muted-foreground")}>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                        <td className="px-3 py-1.5 text-xs">{r.sheet}</td>
                        <td className="px-3 py-1.5 font-medium">{r.target}</td>
                        <td className="px-3 py-1.5 text-xs">{r.errors.length ? <span className="text-red-600 dark:text-red-400">{r.errors.join("; ")}</span> : r.summary}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", ACTION_TONE[r.action])}>{ACTION_LABEL[r.action]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {done ? (
                <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Đã ghi: {done.created} tạo mới, {done.updated} cập nhật. Bỏ qua {done.skipped}, lỗi {done.errors} (không ghi).
                </p>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  {count("error") > 0 && <span className="mr-auto text-xs text-red-600 dark:text-red-400">Dòng lỗi sẽ không được ghi — sửa file rồi kiểm tra lại, hoặc ghi các dòng hợp lệ.</span>}
                  <Button
                    disabled={pending || writable === 0}
                    onClick={() => {
                      const fd = form();
                      if (!fd) return;
                      start(async () => {
                        const res = await commitAdsImportAction(fd);
                        if (res.ok) {
                          setDone(res.data);
                          toast.success(`Đã ghi ${res.data.created + res.data.updated} dòng.`);
                          router.refresh();
                        } else toast.error(res.error);
                      });
                    }}
                  >
                    Xác nhận ghi {writable} dòng
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
