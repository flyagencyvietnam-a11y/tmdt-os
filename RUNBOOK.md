# RUNBOOK — VMG MKT OS

Quy trình vận hành & khôi phục sự cố (self-host). SPEC Mục 13.3 yêu cầu sao
lưu hằng ngày + khôi phục đã kiểm thử trước golive.

## 1. Kiến trúc triển khai

- 1 VPS tại Việt Nam (SPEC 13.2 — tuỳ chọn self-host): tối thiểu 2 vCPU / 4GB
  RAM / 60GB SSD. (Bản demo/dev hiện đang chạy trên Vercel + Supabase, xem
  `DEPLOY.md`.)
- `docker compose` gồm 3 service:
  - `app` — Next.js (image build từ `Dockerfile`), cron trong tiến trình (ENABLE_CRON=true).
  - `db` — PostgreSQL 16, volume `db-data`, thư mục `./backup` mount vào.
  - `caddy` — reverse proxy, tự cấp HTTPS (Let's Encrypt), cổng 80/443.
- Toàn bộ hạ tầng là file trong repo (infrastructure as code): `Dockerfile`,
  `docker-compose.yml`, `Caddyfile`, `scripts/backup.sh`.

### Lần đầu

```bash
cp .env.example .env      # điền POSTGRES_PASSWORD, AUTH_SECRET (npx auth secret), APP_DOMAIN
docker compose up -d --build
# app tự chạy `npm run db:migrate` khi khởi động
docker compose exec app npm run db:seed   # seed SBU/brand/holidays/recurring rules
```

Đăng nhập lần đầu: email admin đặt qua `SEED_ADMIN_EMAIL` (mặc định
`admin@vmg.local` — **placeholder, đổi trước golive thật**, xem `scripts/seed.ts`)
/ mật khẩu `ChangeMe#2026` (buộc đổi ở lần đăng nhập đầu).

## 2. Cập nhật phiên bản

```bash
git pull
docker compose up -d --build   # rebuild app, migration chạy tự động lúc khởi động
docker compose logs -f app | grep -E "migration|cron"
```

## 3. Sao lưu & khôi phục

- Cron của **host** (không phải trong container):
  ```
  0 2 * * *  cd /srv/vmg-mkt-os && docker compose exec -T db sh /backup/backup.sh
  ```
- Giữ 30 bản. **Đồng bộ `./backup` ra nơi lưu trữ thứ hai khác nhà cung cấp** (rclone/rsync).
- **Kiểm thử khôi phục (bắt buộc trước golive):**
  ```bash
  # trên máy khác hoặc DB tạm:
  createdb vmg_mkt_restore_test
  pg_restore --clean --if-exists -d "postgres://.../vmg_mkt_restore_test" backup/vmg_YYYYMMDD_HHMMSS.dump
  DATABASE_URL="postgres://.../vmg_mkt_restore_test" npm run db:migrate   # schema khớp code hiện tại
  # đối chiếu: số task mở, số recurring rule active, số SBU so với bản gốc
  ```
- Backup chưa từng được khôi phục thử thì không tính là backup.

## 4. Nạp dữ liệu thật còn thiếu (trước golive)

Spec chưa cung cấp file `VMG_Marketing_Strategy_Operations_2026.xlsx` nên
chưa seed được: 28 campaign gốc (17 Brand Campaign + 11 campaign khác), 46
hạng mục `sbu_catalog_items` đầy đủ (hiện chỉ seed 3 hạng mục nêu rõ trong
spec). Khi có file:

1. Nạp campaign qua template **T1** (`/import` — hiện chưa có UI T1, tạo thủ
   công ở `/campaign` hoặc viết script seed bổ sung tham khảo
   `scripts/seed.ts`).
2. Nạp danh mục SBU đầy đủ qua template **T9** (chưa có UI — insert trực tiếp
   vào bảng `sbu_catalog_items` theo cấu trúc trong `docs/SPEC.md` Phụ lục B7).
3. Đổi email placeholder `*@vmg.local` của admin/Khiết/Đạt/Trân thành email
   thật qua `/nguoi-dung` trước khi mời người dùng thật đăng nhập.

## 5. Sự cố thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| Đăng nhập báo sai mật khẩu liên tục | `users.locked_until` (khóa 15′ sau 5 lần sai). Admin dùng "Đặt lại MK" ở `/nguoi-dung`. |
| Ghi dữ liệu lỗi FK `*_created_by_users_id_fk` | Session mang user id không còn tồn tại (thường sau khi reset DB dev). Đăng xuất / đăng nhập lại. |
| Dashboard trống / lỗi DB | `DATABASE_URL` đúng chưa; `db:migrate` đã chạy; `docker compose ps` xem `db` healthy. |
| Recurring không sinh task | Rule có `active=true`? `paused_until` đã qua chưa? Gọi `GET /api/cron` thủ công, xem log `spawn-recurring`. |
| Fan-out sinh sai số task | SBU có `ho_owner_id` chưa (null → nhóm vào "unassigned")? Xem `src/lib/services/recurring.ts`. |
| Email thông báo không gửi | Chưa cấu hình `SMTP_*` → chỉ ghi log (không lỗi). Điền `SMTP_HOST`/`USER`/`PASS`. |
| Import T3 báo lỗi email | `assignee_email` phải khớp đúng user đã có trong hệ thống (không tự tạo user khi import). |

## 6. Rủi ro "một người vận hành"

- Toàn bộ hạ tầng là file trong repo — bất kỳ ai đọc được cũng dựng lại được.
- `docs/SPEC.md` là nguồn sự thật nghiệp vụ, cập nhật trước khi đổi code.
- Người dự phòng kỹ thuật: `[CẦN XÁC NHẬN]`.
