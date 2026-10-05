/**
 * Nén ảnh ngay trên trình duyệt trước khi tải lên (ảnh chụp điện thoại thường 3–8MB → còn ~100–300KB):
 *  - giảm cạnh dài về ≤ maxEdge (mặc định 1600px), vẽ lại qua canvas (cũng bỏ EXIF/GPS, tự xoay đúng chiều);
 *  - mã hoá WebP (fallback JPEG), hạ chất lượng dần tới khi ≤ targetBytes;
 *  - kèm ảnh thu nhỏ ~360px cho lưới/danh sách để trang không phải tải ảnh lớn.
 * Chỉ chạy ở client.
 */

export interface CompressedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  mime: string;
  originalBytes: number;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // rơi xuống HTMLImageElement
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Không đọc được ảnh (định dạng không được trình duyệt hỗ trợ — thử chụp lại hoặc dùng JPG/PNG)."));
      img.src = url;
    });
  } finally {
    // img đã onload nên có thể thu hồi URL sau khi vẽ; để GC tự xử lý nếu cần
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

function draw(src: ImageBitmap | HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; // PNG trong suốt → nền trắng khi chuyển JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

export async function compressImage(file: File, opts: { maxEdge?: number; targetBytes?: number; thumbEdge?: number } = {}): Promise<CompressedImage> {
  const maxEdge = opts.maxEdge ?? 1600;
  const targetBytes = opts.targetBytes ?? 350 * 1024;
  const thumbEdge = opts.thumbEdge ?? 360;
  if (!file.type.startsWith("image/")) throw new Error("Chỉ nhận file ảnh.");

  const src = await decode(file);
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
  if (!sw || !sh) throw new Error("Ảnh không hợp lệ.");

  const fit = (edge: number) => {
    const k = Math.min(1, edge / Math.max(sw, sh));
    return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
  };

  // Thử WebP trước; nếu trình duyệt không mã hoá được WebP thì toBlob trả về PNG → dùng JPEG.
  let mime = "image/webp";
  const probe = await toBlob(draw(src, 2, 2), mime, 0.8);
  if (!probe || probe.type !== "image/webp") mime = "image/jpeg";

  let edge = maxEdge;
  let quality = 0.78;
  let { w, h } = fit(edge);
  let canvas = draw(src, w, h);
  let full = await toBlob(canvas, mime, quality);
  // Hạ chất lượng, rồi hạ kích thước, tới khi đủ nhẹ (tối đa vài vòng).
  for (let i = 0; full && full.size > targetBytes && i < 6; i++) {
    if (quality > 0.52) quality -= 0.08;
    else {
      edge = Math.round(edge * 0.82);
      ({ w, h } = fit(edge));
      canvas = draw(src, w, h);
    }
    full = await toBlob(canvas, mime, quality);
  }
  if (!full) throw new Error("Không nén được ảnh.");

  // Ảnh gốc đã nhỏ hơn bản nén (hiếm) → vẫn dùng bản nén để đồng nhất định dạng.
  const t = fit(thumbEdge);
  const thumb = await toBlob(draw(src, t.w, t.h), mime, 0.7);
  if (!thumb) throw new Error("Không tạo được ảnh thu nhỏ.");
  if ("close" in src) src.close();

  return { full, thumb, width: w, height: h, mime, originalBytes: file.size };
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
