# Triển khai — Vercel + Supabase

Vercel project và Supabase Postgres **đã được tái sử dụng** từ dự án TMĐT OS cũ
(cùng team `flyagencyvietnam-2039's projects`), đã đổi tên và migrate sang
schema MKT OS mới. Việc còn lại cần bạn thao tác tay:

## 1. Đổi tên repo GitHub (chưa tự động hoá được — không có `gh` CLI trong môi trường build)

Repo GitHub hiện vẫn tên `tmdt-os` (`flyagencyvietnam-a11y/tmdt-os`). Đổi tên:

1. github.com → repo `tmdt-os` → **Settings → Repository name** → đổi thành
   `vmg-mkt-os` → **Rename**.
2. Cập nhật remote local:
   ```bash
   cd "C:\Users\Admin\Downloads\Ecom OS"
   git remote set-url origin https://github.com/flyagencyvietnam-a11y/vmg-mkt-os.git
   ```

## 2. Vercel project

Project Vercel đã đổi tên thành **`vmg-mkt-os`** (trước là `tmdt-os`), framework
Next.js, cùng team như trên. Domain mặc định: `vmg-mkt-os.vercel.app` (và các
alias theo git branch).

Kiểm tra **Settings → Environment Variables** có đủ:

| Key | Giá trị |
|---|---|
| `DATABASE_URL` | connection string Supabase (Transaction pooler, port 6543) |
| `AUTH_SECRET` | `npx auth secret` hoặc chuỗi ngẫu nhiên 32 byte |
| `APP_URL` | `https://vmg-mkt-os.vercel.app` (hoặc domain thật) |
| `APP_TZ` | `Asia/Ho_Chi_Minh` |
| `CRON_SECRET` | chuỗi ngẫu nhiên (bảo vệ `/api/cron`) |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` | email thông báo (để trống = chỉ log) |

Sau khi sửa biến môi trường: **Deployments → Redeploy**.

## 3. Database — đã migrate + seed (phiên làm việc này)

Schema cũ (leads/campaigns-ads/kpi/sale-kit...) đã **DROP toàn bộ** (quyết định
đã chốt với chủ sản phẩm) và thay bằng 33 bảng MKT OS mới. Nếu cần làm lại từ
đầu trên một Postgres khác:

```bash
cd "C:\Users\Admin\Downloads\Ecom OS"
# .env.local: DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres"
#             (ký tự đặc biệt trong mật khẩu phải URL-encode: '%' -> '%25')
npm run db:reset-schema -- --yes-drop-everything   # CHỈ khi muốn xoá sạch DB hiện có
npm run db:migrate
npm run db:seed
```

Seed tạo admin placeholder `admin@vmg.local` / `ChangeMe#2026` (buộc đổi ở lần
đăng nhập đầu) — xem cảnh báo `[CẦN XÁC NHẬN]` seed in ra console về email thật
và dữ liệu campaign/catalog còn thiếu (cần file
`VMG_Marketing_Strategy_Operations_2026.xlsx`).

## Vùng máy chủ

`vercel.json` đặt `regions: ["syd1"]`, Supabase ở Sydney (`ap-southeast-2`) —
cùng vùng, round-trip function↔DB thấp. Giữ nguyên trừ khi có lý do đổi (đổi
một bên thì phải đổi cả hai, xem ghi chú trong `vercel.json`).

## Vercel Cron

`vercel.json` khai báo 3 lịch (giờ UTC = giờ VN − 7, SPEC Mục 11.2):

- `0 1 * * *` → 08:00 VN: sinh task lặp (00:30 thực tế nên chạy sớm hơn, xem
  `src/lib/cron.ts` cho lịch self-host chi tiết hơn) + trễ hạn sáng + tóm tắt
  hằng ngày.
- `30 9 * * *` → 16:30 VN: nhắc task hôm nay chưa xong.
- `0 1 * * 1` → thứ Hai 08:00 VN: tổng kết tuần cho quản lý.

Endpoint `/api/cron` được bảo vệ bằng `CRON_SECRET` (Vercel tự gửi header
`Authorization: Bearer $CRON_SECRET`).

## Self-host thay cho Vercel (SPEC Mục 13.2 — chủ quyền dữ liệu VN)

```bash
cp .env.example .env    # điền POSTGRES_PASSWORD, AUTH_SECRET, APP_DOMAIN
docker compose up -d --build
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed
```

> MKT OS chỉ lưu tên/email nhân sự và thông tin công việc — **không lưu dữ
> liệu cá nhân học viên** (SPEC Mục 1.3) — nên rủi ro pháp lý khi dùng Vercel
> (máy chủ ngoài VN) thấp hơn hệ thống CRM. Vẫn nên hỏi ý kiến pháp chế trước
> khi chốt hướng cho production thật (SPEC Mục 13.2).
