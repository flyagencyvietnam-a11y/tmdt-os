# Đưa lên GitHub + Vercel

Repo đã sẵn sàng (8 commit, `vercel.json` + `/api/cron` cho Vercel Cron,
`Dockerfile`/`docker-compose.yml` cho self-host). Ba việc dưới đây cần **tài khoản
GitHub / Vercel của bạn** nên phải bạn thao tác — mỗi bước ~1–2 phút.

## 1. Đẩy code lên GitHub

Tạo repo rỗng trên github.com (ví dụ tên `vmg-tmdt-os`, **Private**), rồi:

```bash
cd "C:\Users\Admin\Downloads\Ecom OS"
git remote add origin https://github.com/<username>/vmg-tmdt-os.git
git push -u origin main
```

(Lần đầu Git sẽ mở trình duyệt để bạn đăng nhập GitHub.)

## 2. Tạo project trên Vercel + kết nối Postgres

Vercel account đã có: **team `flyagencyvietnam-2039's projects`** (hobby).

1. vercel.com → **Add New… → Project** → chọn repo `vmg-tmdt-os` → **Deploy**
   (build lần đầu sẽ chạy nhưng app báo "chưa kết nối DB" — bình thường).
2. Trong project → tab **Storage → Create Database → Neon (Postgres, free)** →
   Vercel tự thêm biến `DATABASE_URL`.
3. Tab **Settings → Environment Variables**, thêm:
   | Key | Value |
   |---|---|
   | `AUTH_SECRET` | chạy `npx auth secret` để sinh, hoặc chuỗi ngẫu nhiên 32 byte |
   | `APP_URL` | URL Vercel của bạn, ví dụ `https://vmg-tmdt-os.vercel.app` |
   | `APP_TZ` | `Asia/Ho_Chi_Minh` |
   | `CRON_SECRET` | chuỗi ngẫu nhiên (bảo vệ `/api/cron`) |
4. Tab **Deployments → Redeploy** (để nạp biến mới).

## 3. Áp schema + seed + nạp dữ liệu thật lên DB production

Lấy `DATABASE_URL` production (Vercel → Storage → Neon → `.env.local` / Connection string).
Trên máy bạn:

```bash
cd "C:\Users\Admin\Downloads\Ecom OS"
setx DATABASE_URL "postgres://..."   # hoặc đặt trong .env.local
npm run db:migrate                    # áp 4 migration
npm run db:seed -- --no-demo          # danh mục sản phẩm + tài khoản (KHÔNG dữ liệu demo)

# Dữ liệu thật từ Google Sheet (đã test cục bộ OK: 566 lead / 58 campaign / 22 enrollment):
#   1) mở data/seed/campaign-map.template.json, gộp các campaign trùng
#      ("... - Bản sao"), sửa product_code/channel, lưu thành campaign-map.json
#   2) xem lại data/seed/migration-report.md (giả định "Không chốt" -> max_stage = MQL)
npm run xlsx:migrate -- --commit
```

Đăng nhập: `truongphong@vmg.local` / `ChangeMe#2026` (buộc đổi). Tài khoản `admin/admin`
vẫn còn theo yêu cầu — đổi mật khẩu hoặc xoá trong `scripts/seed.ts` khi thấy cần.

## Vercel Cron

`vercel.json` đã khai báo 3 lịch (giờ UTC = giờ VN − 7):
- `0 1 * * *` → 08:00 VN: digest lead quá hạn + rà R1–R5 + Cold Data + task định kỳ
- `0 1 * * 1` → thứ Hai 08:00 VN: tổng kết tuần
- `0 1 1 * *` → ngày 1 hằng tháng 08:00 VN: nhắc khóa sổ

Endpoint `/api/cron` được bảo vệ bằng `CRON_SECRET` (Vercel tự gửi header).

## Self-host thay cho Vercel (đúng SPEC Mục 5.3 — chủ quyền dữ liệu VN)

```bash
cp .env.example .env    # điền POSTGRES_PASSWORD, AUTH_SECRET, APP_DOMAIN
docker compose up -d --build
docker compose exec app npm run db:seed -- --no-demo
docker compose exec app npm run xlsx:migrate -- --commit
```

> Lưu ý: Vercel đặt máy chủ ngoài VN. Với dữ liệu cá nhân người dưới 18 tuổi, phương án
> self-host (mục trên) đúng với SPEC Mục 5.3 hơn — cân nhắc khi golive thật.
