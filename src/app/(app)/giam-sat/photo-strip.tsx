"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/format";
import { compressImage, fmtBytes } from "@/lib/image-compress";
import { cn } from "@/lib/utils";
import { captionMonitoringPhotoAction, deleteMonitoringPhotoAction } from "./actions";
import type { PhotoItem } from "./monitoring-shared";

const MAX_PER_ITEM = 12;

/**
 * Dải ảnh thực tế của 1 hạng mục: bấm/ kéo-thả/ dán (Ctrl+V) ảnh vào ô "+". Ảnh được NÉN ngay trên trình duyệt
 * (cạnh dài ≤ 1600px, WebP, thường còn 100–300KB) và chỉ tải ảnh thu nhỏ trong danh sách → trang luôn nhẹ.
 */
export function PhotoStrip({ itemId, photos, canEdit, label }: { itemId: string; photos: PhotoItem[]; canEdit: boolean; label: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<{ id: number; name: string }[]>([]);
  const [drag, setDrag] = React.useState(false);
  const [viewer, setViewer] = React.useState<number | null>(null);

  const upload = React.useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith("image/"));
      if (imgs.length === 0) return toast.error("Chỉ nhận file ảnh.");
      const room = MAX_PER_ITEM - photos.length;
      if (room <= 0) return toast.error(`Mỗi hạng mục tối đa ${MAX_PER_ITEM} ảnh — xoá bớt ảnh cũ trước.`);
      const take = imgs.slice(0, room);
      if (take.length < imgs.length) toast.message(`Chỉ nhận thêm ${room} ảnh (tối đa ${MAX_PER_ITEM}/hạng mục).`);
      for (const file of take) {
        const key = Math.random();
        setBusy((b) => [...b, { id: key, name: file.name }]);
        try {
          const c = await compressImage(file);
          const fd = new FormData();
          fd.set("itemId", itemId);
          fd.set("file", new File([c.full], "photo", { type: c.mime }));
          fd.set("thumb", new File([c.thumb], "thumb", { type: c.mime }));
          fd.set("width", String(c.width));
          fd.set("height", String(c.height));
          const res = await fetch("/api/monitoring/photos", { method: "POST", body: fd });
          if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Không tải được ảnh.");
          toast.success(`Đã lưu ảnh: ${fmtBytes(c.originalBytes)} → ${fmtBytes(c.full.size)}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Không tải được ảnh.");
        } finally {
          setBusy((b) => b.filter((x) => x.id !== key));
        }
      }
      router.refresh();
    },
    [itemId, photos.length, router],
  );

  return (
    <div
      className={cn("flex flex-wrap gap-1.5 rounded-lg outline-none", drag && "bg-brand/5 ring-2 ring-brand/40")}
      tabIndex={canEdit ? 0 : undefined}
      onPaste={(e) => {
        if (!canEdit) return;
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          void upload(files);
        }
      }}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDrag(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      {photos.map((p, i) => (
        <button key={p.id} type="button" onClick={() => setViewer(i)} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted" title={p.caption ?? "Xem ảnh"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/monitoring/photos/${p.id}?size=thumb`} alt={p.caption ?? label} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        </button>
      ))}
      {busy.map((b) => (
        <div key={b.id} className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-[10px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang nén…
        </div>
      ))}
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-[10px] text-muted-foreground hover:border-brand/50 hover:bg-brand/5 hover:text-brand"
            title="Chọn ảnh, kéo-thả vào đây, hoặc bấm vào vùng ảnh rồi Ctrl+V để dán"
          >
            <ImagePlus className="h-4 w-4" />
            Thêm ảnh
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) void upload(files);
            }}
          />
        </>
      )}
      {photos.length === 0 && busy.length === 0 && !canEdit && <span className="text-xs text-muted-foreground">Chưa có ảnh</span>}

      <Viewer photos={photos} index={viewer} onIndex={setViewer} canEdit={canEdit} label={label} />
    </div>
  );
}

function Viewer({ photos, index, onIndex, canEdit, label }: { photos: PhotoItem[]; index: number | null; onIndex: (i: number | null) => void; canEdit: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const photo = index != null ? photos[index] : null;

  // Xoá ảnh cuối cùng → tự đóng; xoá ảnh giữa → lùi về ảnh trước.
  React.useEffect(() => {
    if (index != null && index >= photos.length) onIndex(photos.length ? photos.length - 1 : null);
  }, [index, photos.length, onIndex]);

  return (
    <Dialog open={photo != null} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="max-h-[94vh] gap-3 overflow-y-auto sm:max-w-4xl">
        <DialogTitle className="truncate pr-8">{label}</DialogTitle>
        {photo && (
          <>
            <div className="relative flex items-center justify-center rounded-lg bg-black/5 dark:bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/monitoring/photos/${photo.id}`} alt={photo.caption ?? label} className="max-h-[68vh] w-auto max-w-full rounded-lg object-contain" />
              {photos.length > 1 && index != null && (
                <>
                  <button type="button" aria-label="Ảnh trước" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow hover:bg-background" onClick={() => onIndex((index - 1 + photos.length) % photos.length)}>
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" aria-label="Ảnh sau" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow hover:bg-background" onClick={() => onIndex((index + 1) % photos.length)}>
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Ảnh {index! + 1}/{photos.length} · {photo.width && photo.height ? `${photo.width}×${photo.height} · ` : ""}
                {fmtBytes(photo.bytes)} · tải lên {fmtDateTime(photo.createdAt)}
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-red-600"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Xoá ảnh này?")) return;
                    start(async () => {
                      const res = await deleteMonitoringPhotoAction(photo.id);
                      if (res.ok) {
                        toast.success("Đã xoá ảnh.");
                        router.refresh();
                      } else toast.error(res.error);
                    });
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Xoá ảnh
                </Button>
              )}
            </div>
            {canEdit ? <CaptionEditor key={photo.id} photo={photo} label={label} /> : photo.caption && <p className="text-sm">{photo.caption}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CaptionEditor({ photo }: { photo: PhotoItem; label: string }) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [caption, setCaption] = React.useState(photo.caption ?? "");
  return (
    <Input
      value={caption}
      placeholder="Ghi chú cho ảnh (vd. Mặt tiền, chụp 05/10)…"
      onChange={(e) => setCaption(e.target.value)}
      onBlur={() => {
        if (caption.trim() !== (photo.caption ?? "")) {
          start(async () => {
            const res = await captionMonitoringPhotoAction(photo.id, caption);
            if (res.ok) router.refresh();
            else toast.error(res.error);
          });
        }
      }}
    />
  );
}
