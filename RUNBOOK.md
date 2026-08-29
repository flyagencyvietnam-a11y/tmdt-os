# RUNBOOK — VMG TMĐT OS

Quy trình vận hành & khôi phục sự cố. SPEC Mục 5.3 yêu cầu file này tồn tại và được
kiểm chứng (khôi phục backup thành công) trước golive.

## 1. Kiến trúc triển khai

- 1 VPS tại Việt Nam (SPEC 5.3): tối thiểu 2 vCPU / 4GB RAM / 60GB SSD.
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
docker compose exec app npm run db:seed   # seed danh mục + tài khoản
```

Đăng nhập lần đầu: `truongphong@vmg.local` / `ChangeMe#2026` (buộc đổi). Xóa tài khoản
demo `admin/admin` trong `scripts/seed.ts` trước khi golive.

## 2. Cập nhật phiên bản

```bash
git pull
docker compose up -d --build   # rebuild app, migration chạy tự động lúc khởi động
docker compose logs -f app | grep -E "migration|cron"
```

## 3. Sao lưu & khôi phục

- Cron của **host** (không phải trong container):
  ```
  0 2 * * *  cd /srv/vmg-tmdt-os && docker compose exec -T db sh /backup/backup.sh
  ```
- Giữ 30 bản. **Đồng bộ `./backup` ra nơi lưu trữ thứ hai khác nhà cung cấp** (rclone/rsync).
- **Kiểm thử khôi phục (bắt buộc trước golive):**
  ```bash
  # trên máy khác hoặc DB tạm:
  createdb vmg_restore_test
  pg_restore --clean --if-exists -d "postgres://.../vmg_restore_test" backup/vmg_YYYYMMDD_HHMMSS.dump
  DATABASE_URL="postgres://.../vmg_restore_test" npm run db:migrate   # schema khớp code hiện tại
  # đối chiếu: số lead, tổng doanh thu, tổng spend so với bản gốc
  ```
- Backup chưa từng được khôi phục thử thì không tính là backup.

## 4. Di chuyển dữ liệu từ Google Sheet (một lần, trước golive)

```bash
# đặt VMG_Ads_Lead_Tracker.xlsx vào data/seed/
npm run xlsx:migrate                 # DRY RUN: sinh data/seed/migration-report.md
#   -> điền data/seed/campaign-map.json (gộp bản trùng), chốt giả định "Không chốt"
npm run xlsx:migrate -- --commit     # ghi vào DB (sau db:migrate + db:seed)
```

Duyệt `migration-report.md` (SPEC 19.3) trước golive. Chạy song song sheet 2 tuần,
số khớp 2 tuần liên tiếp mới ngừng sheet.

## 5. Sự cố thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| Đăng nhập báo sai mật khẩu liên tục | `users.locked_until` (khóa 15′ sau 5 lần sai). ADMIN dùng "Đặt lại MK" ở `/nguoi-dung`. |
| Ghi dữ liệu lỗi FK `*_created_by_users_id_fk` | Session mang user id không còn tồn tại (thường sau khi reset DB dev). Đăng xuất / đăng nhập lại. |
| Dashboard trống / lỗi DB | `DATABASE_URL` đúng chưa; `db:migrate` đã chạy; `docker compose ps` xem `db` healthy. |
| Số liệu campaign lệch | Mọi chỉ số chỉ tính ở `src/lib/services/metrics.ts`. Chạy `npm test`. |
| Cron 8h/00:30 không chạy | `ENABLE_CRON=true`; `docker compose logs app | grep cron`. Chỉ chạy 1 instance app. |
| Email cảnh báo không gửi | Chưa cấu hình SMTP_* → chỉ ghi log (không lỗi). Điền SMTP_HOST/USER/PASS. |
| Xuất XLSX lỗi | Kiểm tra route `/api/export`; audit `EXPORT` vẫn được ghi. |

## 6. Khóa sổ kỳ

- Chỉ ADMIN (`/khoa-so`). Sau khi khóa, số liệu ads / doanh thu / lead WON trong kỳ
  thành chỉ đọc với mọi vai trò khác. Mở khóa bắt buộc lý do + ghi audit LOCK/UNLOCK.

## 7. Bàn giao học viên sang DotB EMS

- `/ban-giao` (ADMIN/MANAGER): danh sách lead WON + doanh thu chưa gắn `ems_student_id`,
  xuất CSV theo định dạng bàn giao, nhập lại mã học viên EMS.

## 8. Rủi ro "một người vận hành"

- Toàn bộ hạ tầng là file trong repo — bất kỳ ai đọc được cũng dựng lại được.
- SPEC.md được cập nhật liên tục, là nguồn sự thật nghiệp vụ.
- Người dự phòng kỹ thuật: `[CẦN XÁC NHẬN — QĐ09]`.
