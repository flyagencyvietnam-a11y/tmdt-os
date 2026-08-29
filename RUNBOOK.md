# RUNBOOK — VMG TMĐT OS

Quy trình vận hành & khôi phục sự cố. SPEC Mục 5.3 yêu cầu file này tồn tại và được
kiểm chứng trước golive. Đây là bản khởi tạo Phase 0 — bổ sung dần.

## 1. Kiến trúc triển khai (dự kiến)

- 1 VPS đặt tại Việt Nam (SPEC 5.3): tối thiểu 2 vCPU / 4GB RAM / 60GB SSD.
- Docker Compose: `app` (Next.js) · `db` (PostgreSQL 16) · `caddy` (reverse proxy + HTTPS tự động).
- Biến môi trường: xem `.env.example`. `AUTH_SECRET` sinh bằng `npx auth secret`.

> Phase 0 hiện chạy trên `DATABASE_URL` bất kỳ (dev: Supabase). File `docker-compose.yml`
> + `Caddyfile` sẽ thêm ở Phase 2 khi chốt hạ tầng (QĐ09).

## 2. Cập nhật phiên bản

```bash
git pull
npm ci
npm run db:migrate     # áp migration mới (nếu có)
npm run build
# restart service (pm2 / docker compose up -d --build)
```

## 3. Sao lưu

- `pg_dump` tự động hằng ngày, giữ 30 bản, đồng bộ ra nơi lưu trữ thứ hai khác nhà cung cấp.
- **Bắt buộc kiểm thử khôi phục ít nhất một lần trước golive** (SPEC 5.3 / T18).

Khôi phục:
```bash
# tạo DB rỗng rồi:
pg_restore --clean --if-exists -d "$DATABASE_URL" backup_YYYYMMDD.dump
npm run db:migrate     # đảm bảo schema khớp phiên bản code hiện tại
```

## 4. Sự cố thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| Đăng nhập báo sai mật khẩu liên tục | `users.locked_until` — khóa 15 phút sau 5 lần sai (SPEC 18.3). ADMIN dùng "Đặt lại MK" ở `/nguoi-dung`. |
| Dashboard trống / lỗi DB | `DATABASE_URL` đúng chưa; `npm run db:migrate` đã chạy chưa; DB có tiếp nhận kết nối không. |
| Số liệu campaign lệch | Đối chiếu theo SPEC Mục 9 — mọi chỉ số chỉ tính ở `src/lib/services/metrics.ts`. Chạy `npm test`. |
| Cron cảnh báo 8h không chạy | `ENABLE_CRON=true`; xem log tiến trình. (Cron cài ở Phase 2.) |

## 5. Khóa sổ kỳ

- Chỉ ADMIN. Sau khi khóa, dữ liệu trong kỳ chỉ đọc với mọi vai trò khác (SPEC 7.13 / 18.2).
- Mở khóa được ghi audit. Không tạo `enrollment` với `contract_date` thuộc kỳ đã khóa.

## 6. Liên hệ

- Chủ dự án / vận hành chính: Trưởng phòng Marketing, TMĐT & CRM.
- Người dự phòng kỹ thuật: `[CẦN XÁC NHẬN — QĐ09]`.
