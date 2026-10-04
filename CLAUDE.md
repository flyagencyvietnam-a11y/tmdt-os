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
- **Mốc CAD-01** (họp thống nhất Brand Theme tháng sau với BGĐ): ngày làm
  việc cuối cùng của tháng — cùng ngày với CAD-07 (báo cáo Marketing tháng).
  Rule đã `active=true`, `dayRule=last_working_day` (seed.ts + DB hiện tại).
- **Tuần làm việc**: T2-T6 + **Thứ 7 (chỉ buổi sáng)**. `app_settings.work_days`
  = `[1,2,3,4,5,6]` — lưu ý cột này KHÔNG phân biệt được nửa ngày, nên mọi tính
  toán `last_working_day`/`first_working_day` coi Thứ 7 là ngày làm việc đầy
  đủ (đơn giản hoá đã biết, chấp nhận được vì chỉ ảnh hưởng ngày deadline, không
  ảnh hưởng giờ).
- **KV2/KV3**: KV3 chỉ có **Bình Phước (BPH)**; LDN, TPU, PTA, NTI, HVG thuộc
  **KV2**. Đã sửa `sbus.region` trực tiếp (seed.ts + DB hiện tại), không còn
  dùng giá trị gộp `KV2_KV3` cho 6 SBU này nữa (enum value `KV2_KV3` vẫn giữ
  trong schema phòng khi cần dùng lại, nhưng không SBU nào tham chiếu nữa).
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
  HVG, BPH — **KHÔNG đổi** so với seed gốc. 2 tên khác xuất hiện trong sheet
  "B2C Trung tâm" (Trương Định/Đại Phước) là **trung tâm đã đóng cửa**, cố
  tình KHÔNG có SBU record — nếu thấy số liệu ads cũ nhắc tới 2 tên này, đó là
  dữ liệu quá khứ, không phải trung tâm cần tạo mới.
  **UI `/ads` tách rõ 4 tab theo đúng 3 chu kỳ report thật** (`ads-view.tsx`
  chỉ còn là container mỏng): `weekly-view.tsx` (Theo tuần — chỉ Mục 1 + Mục 2,
  chỉ Ngân sách+Mess, đúng phạm vi sheet "Tracking Tuần"), `monthly-view.tsx`
  (Theo tháng — đủ 6 mảng, đủ CPL/CAC/CVR/điểm hiệu quả, logic y hệt bản cũ),
  `requests-view.tsx` (Theo request — danh sách phẳng TẤT CẢ `ads_campaigns`
  mọi SBU/kỳ, lọc theo SBU/kỳ, không gộp theo chu kỳ — trước đây bị giấu trong
  dialog riêng từng SBU, giờ là 1 tab ngang hàng), `disbursement-panel.tsx`
  (Giải ngân, không đổi). Type dùng chung ở `shared.ts` (Line/MetricRow/
  SbuLite/CampaignRow/DisbursementRow/LINE_LABELS) — sửa field nào thì sửa ở
  đây, đừng định nghĩa lại interface riêng ở từng view con.
  **Đã nạp số liệu THẬT từ 3 file Excel gốc vào DB dev** (script một lần, đã
  xoá sau khi chạy — không còn trong repo): 141 `ads_metrics` (6 mảng T1-T9/2026
  từ sheet "Tổng hợp" + 10 SBU từ sheet "B2C Trung tâm", + tuần 1-8 từ sheet
  "Tracking Tuần"), 33 `ads_campaigns` (từ "ads tt.xlsx" tháng 8+9), 9 dòng kế
  hoạch giải ngân Mục 5/OSIR (22.5tr/tháng, từ sheet "Giải ngân Digital" — Mục
  1/Mục 3 KHÔNG có kế hoạch tách dòng trong file gốc nên không tạo). Đã verify
  khớp 100% với số liệu gốc qua UI (CPL/CAC/CVR/điểm hiệu quả, giải ngân).
  **Mã viết tắt trung tâm KHÁC NHAU giữa 3 file** (vd. "ads tt.xlsx" dùng
  nt/lkh/lth/xlc/bpc/ptn, "Báo cáo Q3" dùng TPU/LKH/LDN/XLO/BPC/PTN) đã được
  đối chiếu chéo qua số chi tiêu/Lead/HVM trùng khớp tuyệt đối với sheet "B2C
  Trung tâm" (nguồn gốc nhất) để xác nhận: nt=TPU, lkh=NTI, lth=LDN, xlc=HVG,
  bpc=BPH, ptn=PTA — nếu nạp thêm dữ liệu từ các file này sau này, dùng lại
  đúng bảng quy đổi này, đừng suy đoán lại từ đầu.
- **Ads — logic B2C/Ecom/quý (chủ sản phẩm chỉnh 10/2026, đọc kỹ trước khi sửa `/ads`)**:
  - **B2C Offline = Hệ thống + Trung tâm, Lead/HVM tính CHUNG** (sheet "Tổng hợp" mục 1+2).
    Dòng tháng `b2c_system` mang `budget` = NS Hệ thống (HO chạy chung) VÀ
    `leads`/`newStudents` = Lead/HVM TỔNG cả B2C (đã nạp T1-T9 từ sheet gốc). Còn
    `leads`/`newStudents` của `b2c_center` (theo từng SBU, từ T7/2026 — báo cáo ads Q3)
    là phần quy RIÊNG cho ads ngân sách từng TT = TẬP CON của số tổng, **không được
    cộng thêm** vào số tổng. "Phần còn lại" (Hệ thống + nguồn khác) = tổng − TT, chỉ SUY RA.
    Mọi phép gộp B2C đi qua `b2cSummary` (`ads/rollups.ts`) — đừng cộng tay lead của 2 line.
  - **Số THÁNG nhập riêng, không phải tổng các tuần** (chu kỳ tính khác nhau). Tổng quan/quý
    chỉ cộng các dòng `periodType="month"`, không bao giờ cộng tuần. Quý = `quarterMonths`.
  - Tổng quan có công tắc **Theo tháng / Theo quý**, bảng "So sánh các mảng" có dòng **Tổng
    cộng** (đúng "TỔNG HỢP DIGITAL" của sheet: tổng chi ÷ tổng lead/HVM; Ecom tính MQL là lead).
    Các bảng theo tháng (B2C, từng mảng) cũng có dòng Tổng cộng. Cảnh báo luôn rà theo 1 tháng.
  - **Ecom theo sản phẩm**: bảng `ads_ecom_products` (kỳ × sản phẩm; Spend/MQL/HV/Doanh thu;
    CAC/CP-MQL/ROAS suy ra), UI ở `ads/ecom-products.tsx` dưới tab Ecom. Giai đoạn Test
    T6-T7 chỉ có số gộp → `period_end` ≠ `period`. "Spend chưa phân bổ" = tổng Ecom (bảng tháng)
    − Σ sản phẩm; "Chênh lệch" so với bảng tháng là bình thường (HV/doanh thu ghi nhận theo tháng
    khác nhau — xem ghi chú sheet gốc). Danh sách 7 nhóm sản phẩm cố định: `ECOM_PRODUCTS`
    trong `lib/ads-metrics.ts`. Đã nạp T6-T7/T8/T9 từ file "TMĐT theo SP theo tháng" (khớp 100%
    sheet "Báo cáo").
  - Chênh lệch nhỏ đã biết: tổng NS TT cộng từ các SBU lệch sheet "Tổng hợp" ~1,2tr ở T1 (chi phí của
    trung tâm đã đóng cửa không có SBU) và vài nghìn đồng ở T7/T9 — do chính file gốc không khớp nhau.
- **UI dùng chung (đợt rà UX 10/2026) — dùng lại, đừng tự viết lại**:
  `components/shell/page-header.tsx` (tiêu đề mọi trang — mô tả viết cho người
  dùng, KHÔNG ghi "SPEC Mục X"/"Phase N" ra UI), `components/stat-card.tsx`
  (thẻ KPI + `DeltaBadge` % so kỳ trước, `deltaGoodWhen="down"` cho chi phí),
  `components/tag-multi-select.tsx` (chọn nhiều tag màu), `components/file-input.tsx`
  (ô chọn file cho mọi wizard import). Nền trang là `bg-muted/40` → khung nội
  dung phải là thẻ `rounded-xl border bg-card shadow-xs`. Màu biểu đồ dùng biến
  `--series-1..8` (globals.css, có bản dark), không hardcode hex. Lịch
  react-big-calendar phải bọc class `vmg-cal` để nhận style theo theme. Có
  công tắc Sáng/Tối (next-themes, mặc định Sáng) — class `dark:` phải đúng.
  "Hôm nay" phía client: luôn `todayVnDayStr()`, KHÔNG `new Date().toISOString().slice(0,10)` (lệch ngày trước 7h sáng).
- **Content nhiều brand/kênh**: `content_items.brand_ids[]` + `channels[]`
  (phần tử đầu = brand/kênh chính, luôn trùng `brand_id`/`channel` — 2 cột đơn
  giữ lại cho workflow template + task). Chuẩn hoá qua `normalizeTags` trong
  `lib/services/content.ts`; import T6 nhận nhiều giá trị/ô ("VMG, VMP").
- **Ads**: công thức thuần ở `lib/ads-metrics.ts` (client-safe, services/ads.ts
  re-export); tổng hợp/định dạng ở `ads/shared.ts` (`aggregate`/`derive`/`fmtMoney`);
  cảnh báo tự động ở `ads/alerts.ts` (ngưỡng `ALERT_THRESHOLDS` — chủ sản phẩm
  chưa xác nhận con số, đang là mặc định hợp lý).
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

Email thật của admin/Khiết/Đạt/Trân (đang seed placeholder `*@vmg.local`) ·
dữ liệu 28 campaign + 46 hạng mục SBU catalog từ file
`VMG_Marketing_Strategy_Operations_2026.xlsx` (chưa được cung cấp) · SLA
request theo loại (đã hỏi — chủ sản phẩm xác nhận CHƯA CÓ, giữ mặc định
"người tiếp nhận tự nhập hạn cam kết", không phải việc còn treo nữa).

4 câu đã CHỐT (xem "Quyết định đã chốt" bên trên) — không hỏi lại: ngày họp
CAD-01, work_days có Thứ 7, danh sách KV2/KV3.
