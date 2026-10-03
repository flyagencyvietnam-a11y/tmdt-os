# VMG MKT OS

Ứng dụng quản lý task & kế hoạch nội bộ cho Phòng Marketing VMG (Viet My Group).
Biến mọi việc phải làm — campaign, content, quay chụp, request từ trung tâm,
kiểm tra POSM, báo cáo cuối tháng — thành **task có người, có hạn, có nhắc**.

> Nguồn sự thật nghiệp vụ: [`docs/SPEC.md`](docs/SPEC.md). Nguyên tắc vận hành
> agent: [`CLAUDE.md`](CLAUDE.md).

Dự án này kế thừa hạ tầng (Vercel project, repo, Postgres) từ **TMĐT OS**
(lead/ads tracker) — dự án đó đã dừng vĩnh viễn. MKT OS là một ứng dụng hoàn
toàn khác về nghiệp vụ, xây lại từ đầu trên cùng stack kỹ thuật.

## Trạng thái: Phase 0 + Phase 1 (MVP) đầy đủ, cộng một phần Phase 2

### Đã làm

- **Schema đầy đủ** (Drizzle, `src/lib/db/schema/`) — 33 bảng theo SPEC Mục 4
  (users, sbus, brands, campaigns, tasks + 9 bảng phụ thuộc, recurring_rules,
  requests, content/media (Phase 2, chỉ có bảng), sbu_catalog, notifications,
  import_batches/rows, saved_views, holidays, app_settings).
- **Auth & phân quyền** — Auth.js v5 Credentials, 5 vai trò
  (`admin/manager/member/center_contributor/viewer`) theo SPEC Mục 3.2
  (`src/lib/auth/permissions.ts`).
- **Task engine** (`src/lib/services/tasks.ts`) — CRUD, vòng đời trạng thái tự
  do + activity log, task cha tự `done` theo con, chặn chuyển trạng thái khi
  phụ thuộc chưa xong, checklist cascade, bình luận @mention, `overdue` luôn
  suy ra (không lưu cột).
- **Recurring engine** (`src/lib/services/recurring.ts`) — tính ngày theo
  `day_rule`/`holiday_policy`, fan-out `checklist_per_owner`/`task_per_sbu`,
  chống trùng bằng unique index DB. Đã verify khớp tiêu chí nghiệm thu SPEC
  14.2 (#3 ngày làm việc cuối tháng, #5 fan-out đúng số task). Seed sẵn 9 quy
  tắc Phụ lục C (nhịp điều phối Brand Campaign hàng tháng).
- **Thông báo** — trong app + email (`src/lib/services/jobs.ts` +
  `/api/cron`), dedupe theo `(user, channel, dedupe_key)`.
- **Magic-link** cho `center_contributor` xác nhận task không cần đăng nhập
  (`/xac-nhan/[token]`, SPEC Mục 3.3/11.4).
- **Data Grid dùng chung** (`src/components/data-grid/`) — filter/sort/
  group-by/view đã lưu kiểu Airtable, inline-edit, bulk action, xuất CSV/XLSX.
  Dùng cho mọi bảng: Task, Campaign, Request, SBU.
- **Giao diện**: Dashboard "Việc của tôi", Task List (Data Grid)/Kanban (kéo
  thả `@dnd-kit`)/**Lịch** (`react-big-calendar`), trang chi tiết task,
  Campaign master + Action plan, Request, SBU + **ma trận hạng mục × SBU**
  (`/sbu/matrix`, tự cập nhật từ task thật — Mục 6.6), **Nhập liệu T1–T4 đầy
  đủ** (Plan campaign/Users-SBU/Task lẻ/Recurring — 4 bước: tải lên → kiểm
  tra → xem trước → xác nhận, undo 72h cho T1/T3), Cài đặt, Người dùng.

### Chưa làm (xem SPEC Mục 14.3/14.4 — Phase 2 còn lại/Phase 3)

Gantt, Workload, Content calendar tự sinh task, Media production plan,
Foundation UI, xuất ICS/lịch tuần BOD, nhân bản campaign, web push, Zalo, AI
assist.

### Câu hỏi mở — cần chủ sản phẩm trả lời trước khi lên production thật

Ngày họp mốc CAD-01 · SLA request theo loại · danh sách trung tâm KV2/KV3 · có
làm việc thứ Bảy không · email thật của admin/Khiết/Đạt/Trân (đang dùng
placeholder `*@vmg.local`) · dữ liệu 28 campaign + 46 hạng mục SBU catalog từ
file `VMG_Marketing_Strategy_Operations_2026.xlsx` (chưa được cung cấp cho
agent — nạp qua template T1/T9 khi có file).

## Stack

TypeScript · Next.js 16 (App Router) · React 19 · Tailwind v4 + shadcn/ui ·
Drizzle ORM + postgres-js · Auth.js v5 (Credentials) · `rrule` · `@dnd-kit` ·
`react-big-calendar` · `exceljs` · `zod` · `vitest`.

## Chạy local

```bash
npm install
cp .env.example .env.local   # điền DATABASE_URL, AUTH_SECRET...
npm run db:migrate
npm run db:seed
npm run dev
```

Seed tạo tài khoản `admin` với email placeholder (`SEED_ADMIN_EMAIL` trong
`.env.local`, mặc định `admin@vmg.local`) và mật khẩu mặc định
`ChangeMe#2026` — bắt buộc đổi ở lần đăng nhập đầu.

## Triển khai

Xem [`DEPLOY.md`](DEPLOY.md) (Vercel + Supabase) hoặc
[`RUNBOOK.md`](RUNBOOK.md) (self-host Docker Compose).

## Kiểm thử

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
