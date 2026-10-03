# CLAUDE.md — VMG MKT OS

Ứng dụng quản lý task & kế hoạch cho Phòng Marketing VMG. Thay thế việc theo dõi
công việc rải rác trên Excel/email/Zalo/MISA. Đây là dự án **kế thừa hạ tầng**
(Vercel project, repo, Postgres) từ dự án TMĐT OS cũ — đã dừng vĩnh viễn — nhưng
là một app hoàn toàn mới về nghiệp vụ.

## Nguồn sự thật

- **`docs/SPEC.md`** là nguồn sự thật duy nhất cho nghiệp vụ (đặc tả gốc, nguyên
  văn từ chủ sản phẩm). Mọi thay đổi nghiệp vụ phải cập nhật SPEC.md **trước**,
  code sau.
- Mỗi phiên làm việc liên quan tới task/lặp lại/import: đọc lại **Mục 4–7** (mô
  hình dữ liệu, task engine, recurring), **Mục 10–11** (import, thông báo), **Mục
  16.2** (quyết định còn treo) của SPEC trước khi sửa code.
- **KHÔNG ĐƯỢC BỊA DỮ KIỆN.** Email người dùng thật, ngày họp mốc 01 (CAD-01),
  ngày lễ âm lịch, dữ liệu 28 campaign gốc, 46 hạng mục SBU catalog: spec
  **chưa cung cấp đủ**. Mọi chỗ còn thiếu phải để `[CẦN XÁC NHẬN]` / để trống /
  seed tối thiểu kèm cảnh báo — không tự đoán. Xem Mục 16.2 và Mục 0 của SPEC.

## 5 nguyên tắc bất di bất dịch (SPEC Mục 2)

1. **Một việc, một task, một người chịu trách nhiệm.** `assignee_id` luôn có
   đúng 1 người; `collaborators` là phụ.
2. **Plan sinh task, task không mồ côi.** Mọi task ghi `source_type` +
   `source_id` để truy ngược nguồn (recurring rule, campaign, request, import).
3. **Không làm ngập người dùng.** Fan-out theo SBU mặc định dùng
   `checklist_per_owner` (1 task/người, checklist theo SBU) — KHÔNG sinh 1 task
   rời cho mỗi SBU trừ khi rule khai báo `task_per_sbu` rõ ràng (SPEC Mục 6.5).
4. **Import không phá dữ liệu.** Upsert theo khóa (`external_key`), không nhân
   đôi; trường `manually_edited_fields` đã bị sửa tay thì KHÔNG bị file ghi đè.
5. **Múi giờ Việt Nam.** Ngày hiển thị `dd/mm/yyyy`, tuần bắt đầu thứ Hai, lưu
   UTC trong DB, cắt ngày theo `Asia/Ho_Chi_Minh` (`src/lib/time.ts`).

## Task engine & Recurring — đọc kỹ trước khi sửa (hay làm sai)

- `overdue` **không lưu cột**, luôn suy ra tại truy vấn — dùng
  `overdueSqlFragment()` / `isOverdue()` trong `src/lib/services/tasks.ts`, đừng
  viết lại điều kiện này ở nơi khác.
- Recurring (`src/lib/services/recurring.ts`): `occurrence_date` là ngày danh
  nghĩa ĐÃ áp `day_rule` + `holiday_policy`; `due_date = occurrence_date +
  due_offset_days`. Chống trùng dựa **unique index DB**
  (`recurring_rule_id, occurrence_date, scope_key`) — service chỉ cần
  `onConflictDoNothing()`, không tự check tồn tại trước.
- `day_rule=last_working_day`/`first_working_day` dùng `src/lib/services/workdays.ts`
  (có tính ngày lễ từ bảng `holidays` + `work_days` phòng trong `app_settings`).
  Đã verify đúng với tiêu chí nghiệm thu SPEC 14.2 #3 (tháng 10/2026 → 30/10/2026).
- Fan-out `checklist_per_owner`: nhóm SBU theo `sbus.ho_owner_id`, 1 task/owner.
  Tick hết checklist → tự chuyển task `done` (`toggleChecklistItem` trong
  `tasks.ts`) và cascade cập nhật `sbu_item_status` nếu rule gắn
  `sbu_catalog_items.default_recurring_rule_id`.

## Quyết định đã chốt với chủ sản phẩm (bổ sung SPEC Mục 16.2)

- Tên hạ tầng: Vercel project + GitHub repo đổi từ `tmdt-os` → `vmg-mkt-os`
  (GitHub cần đổi tay — không có `gh` CLI trong môi trường build).
- DB: dùng chung Supabase project cũ, đã **DROP toàn bộ bảng TMĐT OS** và tạo
  schema MKT OS mới hoàn toàn (migration `0000_milky_vin_gonzales.sql`).
- Đăng nhập: **chưa có Google Workspace** → chỉ dùng Credentials (email/mật
  khẩu do admin tạo). Google OAuth domain-restricted để dành khi công ty xác
  nhận có Workspace. Magic-link xác nhận task cho `center_contributor` (Mục
  3.3/11.4) độc lập với đăng nhập, đã làm (`/xac-nhan/[token]`).
- Phạm vi đã build: Phase 0 (schema, auth, seed) + phần lớn Phase 1 MVP (task
  engine, recurring đầy đủ + fan-out + seed Phụ lục C, thông báo app/email +
  cron, dashboard, List/Kanban, campaign master, request, import **T3 only**).
  **Chưa làm**: import T1/T2/T4 (UI), Lịch/Gantt/Workload, Content calendar,
  Media plan, Foundation UI, SBU matrix đầy đủ — xem SPEC Mục 14.3 (Phase 2).
- Stack: Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui (Base UI)
  + Drizzle + postgres-js + Auth.js v5 (Credentials) + `rrule` + `@dnd-kit` +
  `react-big-calendar` (chưa dùng, cài sẵn cho Lịch ở lượt sau) + `exceljs`.
- DB dev: `DATABASE_URL` trỏ Supabase (Sydney). Test: PGlite in-memory.

## Cấu trúc thư mục

```
docs/SPEC.md                        nguồn sự thật nghiệp vụ (đặc tả gốc MKT OS)
drizzle/                            migration sinh ra (đừng sửa tay)
scripts/seed.ts                     seed SBU/brand/holidays/recurring rules Phụ lục C
scripts/reset-schema.ts             DROP SCHEMA public — chỉ chạy khi chủ động muốn xoá sạch DB
src/lib/db/schema/                  định nghĩa bảng Drizzle (1 file / nhóm bảng)
src/lib/auth/permissions.ts         ma trận quyền 5 role (admin/manager/member/
                                     center_contributor/viewer) — SPEC Mục 3.2
src/lib/services/tasks.ts           *** task engine — nguồn logic trạng thái/overdue duy nhất ***
src/lib/services/recurring.ts       *** recurring engine — đọc kỹ trước khi sửa ***
src/lib/services/workdays.ts        ngày làm việc / ngày lễ (dùng cho recurring)
src/lib/services/jobs.ts            tác vụ cron (digest, escalate, spawn-recurring)
src/lib/services/import/            pipeline nhập liệu (parse → validate → dry-run → confirm)
src/app/(app)/task/                 Dashboard + List/Kanban + task detail
src/app/(app)/{campaign,request,sbu,import,cai-dat,nguoi-dung}/
src/app/xac-nhan/[token]/           magic-link xác nhận task (public, không cần đăng nhập)
```

## Lệnh hay dùng

- `npm run dev` — chạy app
- `npm run db:generate` — sinh migration từ schema
- `npm run db:reset-schema -- --yes-drop-everything` — XOÁ TOÀN BỘ DB (cẩn thận)
- `npm run db:migrate` — áp migration lên DATABASE_URL
- `npm run db:seed` — seed SBU/brand/holidays/recurring rules Phụ lục C
- `npm test` — chạy unit test
- `npm run typecheck` / `npm run lint` / `npm run build`

## Câu hỏi mở chưa có câu trả lời (không tự đoán — hỏi chủ sản phẩm)

Ngày họp mốc CAD-01 · SLA request theo loại · danh sách trung tâm KV2 và KV3 ·
có làm việc thứ Bảy không · email thật của admin/Khiết/Đạt/Trân (đang seed
placeholder `*@vmg.local`) · dữ liệu 28 campaign + 46 hạng mục SBU catalog từ
file `VMG_Marketing_Strategy_Operations_2026.xlsx` (chưa được cung cấp).
