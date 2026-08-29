# CLAUDE.md — VMG TMĐT OS

Hệ thống quản trị & thực thi vận hành TMĐT cho Phòng Marketing, TMĐT & CRM (VMG).
Thay thế Google Sheet `VMG_Ads_Lead_Tracker.xlsx`.

## Nguồn sự thật

- **`docs/SPEC.md`** là nguồn sự thật duy nhất cho nghiệp vụ. Mọi thay đổi nghiệp vụ
  phải cập nhật SPEC.md **trước**, code sau.
- Mỗi phiên làm việc: đọc lại **Mục 5–7** (mô hình dữ liệu), **Mục 8–9** (quy tắc &
  công thức), **Mục 24** (quyết định còn treo) của SPEC trước khi viết code liên quan.

## 5 nguyên tắc bất di bất dịch

1. **Một nguồn công thức duy nhất.** Mọi chỉ số (CPL, CPMQL, CAC, CR, ROAS, chỉ số
   kỷ luật vận hành...) chỉ được định nghĩa **một lần** tại `src/lib/services/metrics.ts`,
   có unit test riêng. Dashboard / KPI / cảnh báo / báo cáo đều gọi cùng hàm đó.
2. **Không tính chỉ số ở client.** Client chỉ nhận số đã tính xong từ server.
3. **Mọi mốc thời gian lưu ở UTC, hiển thị & cắt ngày theo `Asia/Ho_Chi_Minh`.**
   Ranh giới "ngày" trong mọi báo cáo/cảnh báo là 00:00 giờ Việt Nam.
4. **Soft delete mặc định.** Không xóa cứng `leads`, `campaigns`, `enrollments`.
   Chỉ đặt `deleted_at`.
5. **Audit đầy đủ.** Ghi `audit_logs` cho mọi thay đổi `stage/outcome/assigned_to/
   next_contact_date` của lead; mọi thay đổi `spend/messages`; mọi thao tác
   `enrollments`; mọi thay đổi `kpi_assignments`; mọi lần export.

## Quy tắc đếm phễu (đọc kỹ — khác hẳn file sheet)

- **`leads` (số Lead báo cáo)** = `SUM(campaign_daily_metrics.messages)` — số nhập tay.
  KHÔNG phải đếm bản ghi `leads`.
- **`mql` / `sql`** = đếm bản ghi `leads` theo **`max_stage`** (giai đoạn cao nhất từng
  đạt, chỉ tăng), KHÔNG theo `stage` hiện tại. Lead lên MQL rồi rớt về LOST vẫn được
  đếm vào MQL.
- **`won`** = `COUNT(leads WHERE outcome = 'WON')`, luôn kèm `enrollments`.
- Quy kết thời gian: `mql` lọc theo `mql_at`, `sql` theo `sql_at`, `won`/doanh thu theo
  `enrollments.contract_date`. `spend`/`leads` theo `campaign_daily_metrics.metric_date`.
- Chia cho 0 → trả `null` → hiển thị `-`. TUYỆT ĐỐI không trả `0`.

## Quyết định dự án đã chốt (bổ sung/điều chỉnh so với SPEC Mục 24)

- **QĐ04 (điều chỉnh):** EC được **Create/Read/Update mọi lead**, không giới hạn `own`.
  Không có quyền Delete. `assigned_to` chỉ để định tuyến hàng đợi "Hôm nay", không khóa
  quyền sửa.
- **QĐ05:** HVM/doanh thu tính cho **người chốt** (`assigned_to` tại thời điểm tạo
  enrollment). `leads.originally_assigned_to` lưu người nhận đầu tiên để tra tranh chấp.
- Stack: Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui (Base UI) +
  Drizzle + postgres-js + Auth.js v5 (Credentials) + TanStack Table v9 + Recharts v3.
  (SPEC ghi Next 15 / TanStack v8 — ta dùng bản mới hơn, tương thích.)
- DB dev: `DATABASE_URL` trỏ Supabase. Test: PGlite in-memory. Prod: Postgres self-host.

## Cấu trúc thư mục

```
docs/SPEC.md                     nguồn sự thật nghiệp vụ
data/seed/                       file xlsx gốc + CSV seed
drizzle/                         migration sinh ra (đừng sửa tay)
scripts/                         seed, migrate-xlsx, db-migrate, inspect-xlsx
src/lib/db/schema/               định nghĩa bảng Drizzle (1 file / nhóm bảng)
src/lib/db/index.ts              client Drizzle (runtime)
src/lib/auth/                    Auth.js config + ma trận phân quyền (permissions.ts)
src/lib/services/metrics.ts      *** nguồn công thức duy nhất ***
src/lib/services/*.ts            service nghiệp vụ khác (lead, campaign, kpi...)
src/components/data-grid/        Data Grid dùng chung (SPEC Mục 16) — đường găng
src/components/ui/               shadcn primitives
src/app/                         route (App Router)
```

## Lệnh hay dùng

- `npm run dev` — chạy app
- `npm run db:generate` — sinh migration từ schema
- `npm run db:migrate` — áp migration lên DATABASE_URL
- `npm run db:seed` — seed danh mục + demo data
- `npm test` — chạy unit test (metrics.ts chạy trên PGlite)
- `npm run typecheck` — kiểm tra TypeScript
