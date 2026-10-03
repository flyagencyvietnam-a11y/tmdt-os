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
- Phạm vi đã build: Phase 0 + Phase 1 MVP đầy đủ, **cộng toàn bộ Phase 2 và
  phần Phase 3 không cần tích hợp bên ngoài** (task engine, recurring đầy đủ +
  fan-out + seed Phụ lục C, thông báo app/email + web push + cron, dashboard,
  List/Kanban/**Lịch**/**Gantt**/**Workload**, campaign master + **nhân bản
  campaign**, request, SBU + **ma trận hạng mục × SBU** (`/sbu/matrix`, tự cập
  nhật từ task thật — Mục 6.6), **Content calendar** (`/content` — List
  (DataGrid, màu theo brand+kênh) **và Lịch** (react-big-calendar, màu theo
  brand), tab lọc nhanh theo brand, cột tick nhanh "Đã đăng" (+ trong quick-view
  dialog khi bấm vào ô Lịch), nút "Nhập plan tháng" link sang Import?tab=t6; tự
  sinh task cha+con theo `content_workflow_templates`, mặc định Soạn/Thiết kế
  (Trân)/Duyệt(Trưởng phòng)/Đăng; tick "Đã đăng" đóng **toàn bộ** task con +
  task cha, không chỉ task cha — xem `content-colors.ts` cho bảng màu 7 brand +
  6 kênh (Fanpage/TikTok/Zalo/Website/YouTube/Khác), đổi màu thì sửa ở đây, đừng
  lặp bảng màu riêng ở nơi khác), **Media production plan** (`/quay-chup`, tự sinh task
  chuẩn bị+quay+hậu kỳ, tạo lịch quay định kỳ), **Foundation** (`/nen-tang`,
  lưới brand×cấu phần + lịch sử + "tạo task từ ô"), **Monitoring** (`/giam-sat`,
  cảnh báo quá hạn/sắp hạn tự sinh task), **Ads** (`/ads` — ĐÃ XÂY LẠI theo dữ
  liệu thật, xem "Ads redesign" bên dưới, không còn là bản `ads_monthly` đơn
  giản theo SBU nữa), **Dashboard quản lý** (`/bao-cao`: trễ hạn theo người, tiến độ campaign, %SBU,
  tỷ lệ đúng hạn, việc lặp đúng hạn + xuất báo cáo định kỳ lưu `report_exports`),
  **Trợ lý AI** (`/tro-ly-ai`, gọi Anthropic API nếu có `ANTHROPIC_API_KEY`,
  LUÔN có bước người duyệt trước khi tạo task), **xuất ICS** (lịch cá nhân,
  link đăng ký Google Calendar dùng token HMAC — `lib/services/ics.ts`), **xuất
  lịch tuần BOD** (`/api/export/bod-schedule`), import **T1–T9** đủ 4 bước +
  undo (T1/T3/T5/T6 có undo hoặc upsert theo khoá; T2/T4/T7/T8/T9 upsert không
  undo cả đợt)). Mọi view dạng bảng (Task/Campaign/Request/SBU/Content/
  Monitoring) dùng chung `src/components/data-grid/` — filter/sort/group-by/
  saved-view kiểu Airtable, **bắt buộc dùng component này cho mọi gridview
  mới**, không tự viết `<table>` thô (trừ vài bảng tổng hợp đơn giản ở
  `/bao-cao`, `/ads`, `/cai-dat` không cần filter/sort).
  **Chưa làm** (chủ động bỏ qua vì cần tích hợp/key ngoài chưa có, xem SPEC Mục
  14.4): đồng bộ Google Calendar hai chiều, nhắc qua Zalo, tải tệp đính kèm lên
  kho lưu trữ ngoài. Ads chưa có import riêng (nhập tay hoặc qua "Chiến dịch" +
  "Cộng dồn vào tháng" ở mỗi dòng SBU).
- **Ads redesign (nghiên cứu từ 3 file Excel thật — xem lịch sử chat, không có
  file lưu lại trong repo)**: `ads_monthly` cũ (chỉ phủ 1 mảng, chỉ theo SBU)
  đã bị thay bằng 3 bảng: `ads_metrics` (6 mảng thật — b2c_system/b2c_center/
  ecom/b2b/osir/vmp, grain tuần+tháng, CPL/CAC/CVR/ROAS/CPMQL + điểm hiệu quả
  suy ra tại truy vấn trong `lib/services/ads.ts::computeAdsDerived` — ĐÃ xác
  minh khớp số liệu thật 100% khi test), `ads_campaigns` (chi tiết từng chiến
  dịch Facebook, cộng dồn lên `ads_metrics` qua nút "Cộng dồn vào tháng" —
  KHÔNG tự động, tránh ghi đè số đã sửa tay), `ads_disbursement_plan` (kế
  hoạch giải ngân Mục 1+3+5, so với thực tế tính từ `ads_metrics`). Ngưỡng
  điểm hiệu quả (CPL/CAC tiers) lưu ở `app_settings.ads_effectiveness_rubric`,
  sửa qua Cài đặt ▸ Cấu hình chung nếu công ty đổi chuẩn đánh giá.
  **2 recurring rule mới** (seed Phụ lục C mở rộng): `ADS-01` (báo cáo ads
  tuần, Thứ Sáu hàng tuần) và `ADS-02` (báo cáo ads tháng, ngày làm việc cuối
  tháng) — cả hai `checklist_per_owner` theo đúng 10 SBU `kind='center'`
  (Khiết/Đạt), tái dùng 100% recurring engine có sẵn, không code mới.
  **Danh sách 10 trung tâm B2C offline đã xác nhận lại với chủ sản phẩm** (ăn
  khớp SPEC "10 trung tâm + TMĐT"): VTS, PVT, NKN, TBM, LDN, TPU, PTA, NTI,
  HVG, BPH — **KHÔNG đổi** so với seed gốc. 4 tên khác xuất hiện trong file
  Excel lịch sử (Trương Định/Trần Phú/Đại Phước/Nguyễn Trãi) là **trung tâm đã
  đóng cửa**, cố tình KHÔNG có SBU record — nếu thấy số liệu ads cũ nhắc tới 4
  tên này, đó là dữ liệu quá khứ, không phải trung tâm cần tạo mới.
- **Bẫy đã gặp 1 lần, đừng lặp lại**: `next.config.ts` từng có khối
  `redirects()` sót lại từ TMĐT OS cũ trỏ `/bao-cao → /` — route `/bao-cao`
  (Dashboard quản lý) mới tạo bị nuốt silently (307 về "/", KHÔNG log ở Next
  dev server, KHÔNG qua `requireRole`/middleware) cho tới khi dò bằng `curl -i`
  so sánh với 1 route hoạt động đúng. Khối `redirects()` đã bị xoá hẳn. Nếu
  thêm route mới mà bị "nuốt" y hệt (không log, về "/"), nghi ngờ đầu tiên là
  `next.config.ts`/`vercel.json`, không phải code route.
- Stack: Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui (Base UI)
  + Drizzle + postgres-js + Auth.js v5 (Credentials) + `rrule` + `@dnd-kit` +
  `react-big-calendar` + `recharts` (Dashboard) + `web-push` (VAPID tự sinh,
  lưu `app_settings`) + `exceljs`.
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
src/lib/services/import/            pipeline nhập liệu T1-T9 (parse → validate → dry-run → confirm)
src/lib/services/content.ts         content_item → task cha+con (content_workflow_templates)
src/lib/services/media.ts           media_shoot/deliverable → task chuẩn bị+quay+hậu kỳ
src/lib/services/foundation.ts      lưới Foundation + lịch sử phiên bản
src/lib/services/monitoring.ts      cảnh báo quá hạn/sắp hạn Monitoring → tự sinh task
src/lib/services/reports.ts         *** computeManagementMetrics — nguồn số liệu /bao-cao
                                     DÙNG CHUNG với báo cáo xuất định kỳ, đừng tính lại ở nơi khác ***
src/lib/services/ai-assist.ts       gọi Anthropic API (cần ANTHROPIC_API_KEY) — KHÔNG tự ghi task
src/lib/services/ics.ts             xuất .ics + token HMAC cho link đăng ký Google Calendar
src/lib/services/push.ts            Web push — VAPID tự sinh lưu app_settings, không cần cấu hình tay
src/components/data-grid/           *** grid dùng chung (filter/sort/group-by kiểu Airtable) —
                                     mọi view bảng mới PHẢI dùng component này, không viết <table> thô
src/app/(app)/task/                 Dashboard + List (DataGrid)/Kanban/Lịch (+ link ICS) + task detail
src/app/(app)/gantt/                Gantt SVG tự dựng, nhóm theo campaign, mũi tên phụ thuộc
src/app/(app)/workload/             ma trận người × tuần (ngưỡng quá tải ở app_settings)
src/app/(app)/sbu/matrix/           ma trận hạng mục × SBU × kỳ (SPEC Mục 9.3/6.6)
src/app/(app)/bao-cao/              Dashboard quản lý (Mục 12.2) + xuất báo cáo định kỳ
src/app/(app)/{campaign,content,quay-chup,request,sbu,giam-sat,ads,nen-tang,
               tro-ly-ai,import,cai-dat,nguoi-dung}/
src/app/xac-nhan/[token]/           magic-link xác nhận task (public, không cần đăng nhập)
public/sw.js                        service worker tối giản cho Web push
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
