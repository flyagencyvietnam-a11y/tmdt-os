import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addMonitoringPhoto } from "@/lib/services/monitoring";

/** Tải ảnh giám sát lên. Ảnh đã được NÉN ở trình duyệt (≈100–400KB) + kèm ảnh thu nhỏ; ở đây chỉ kiểm tra giới hạn rồi lưu. */
export const runtime = "nodejs";

const MAX_FULL = 2 * 1024 * 1024; // chặn client không nén
const MAX_THUMB = 200 * 1024;
const ALLOWED = new Set(["image/webp", "image/jpeg", "image/png"]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["admin", "manager", "member"].includes(user.role)) return NextResponse.json({ error: "Không có quyền." }, { status: 403 });
  const form = await req.formData();
  const itemId = String(form.get("itemId") ?? "");
  const full = form.get("file");
  const thumb = form.get("thumb");
  if (!/^[0-9a-f-]{36}$/i.test(itemId) || !(full instanceof File) || !(thumb instanceof File)) return NextResponse.json({ error: "Thiếu dữ liệu." }, { status: 400 });
  if (!ALLOWED.has(full.type) || !ALLOWED.has(thumb.type)) return NextResponse.json({ error: "Định dạng ảnh không hợp lệ." }, { status: 400 });
  if (full.size > MAX_FULL || thumb.size > MAX_THUMB) return NextResponse.json({ error: "Ảnh quá lớn — cần nén trước khi tải lên." }, { status: 413 });
  const num = (k: string) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  try {
    const row = await addMonitoringPhoto(
      db,
      { itemId, mime: full.type, data: Buffer.from(await full.arrayBuffer()), thumb: Buffer.from(await thumb.arrayBuffer()), width: num("width"), height: num("height"), caption: String(form.get("caption") ?? "").trim() || null },
      user.id,
    );
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Không lưu được ảnh." }, { status: 500 });
  }
}
