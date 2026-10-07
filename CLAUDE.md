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
- **Ads — import Excel + bảng trung tâm (10/2026)**:
  - Nút **Nhập Excel** ở 3 tab Theo tuần / Theo tháng / Theo request (admin/manager). Service
    `lib/services/import/ads-import.ts` (`planAdsImport` kiểm tra không ghi → `applyAdsImport` ghi),
    server action `previewAdsImportAction`/`commitAdsImportAction` (KHÔNG có batch trong DB, mỗi bước
    đọc + kiểm tra lại file), template tải ở `/api/import/template/ads/[kind]` (điền sẵn tuần/tháng + danh
    sách trung tâm; `?week=`/`?month=` đổi kỳ). Sheet: `TUAN`; `THANG` + `ECOM_SP`; `REQUEST`. Quy ước: ô TRỐNG =
    giữ nguyên số cũ, ô có số = ghi đè, dòng chưa điền số = bỏ qua; khoá upsert tuần=(line,tuần,SBU),
    tháng=(line,tháng,SBU)/(kỳ,sản phẩm), request=(tháng,SBU,tên chiến dịch). Import request KHÔNG tự cộng dồn
    lên số tháng. Chỉ nhận .xlsx. Mỗi cột chỉ hợp lệ với mảng của nó (vd. `mql` chỉ ecom) — sai thì báo lỗi dòng.
  - **Đã sửa bug `headerKey`** (`import/parse.ts`): regex `/[s*(]/` cắt cả chữ "s" nên cột bắt đầu bằng "s"
    (`sbu_code`, `status`, `starts_on`...) bị đọc rỗng ở MỌI importer; nay là `/[\s*(]/`. `parseWorksheet`
    cũng đã đọc đúng ô ngày (→ dd/mm/yyyy), ô công thức, rich text.
  - Tab Theo tháng ▸ B2C: bảng **Tổng hợp chỉ số theo trung tâm × tháng** (`center-trend.tsx`) thay cho bảng
    nhiệt nhiều tab. Heatmap theo LUẬT (không min–max): CPL/CAC/Điểm HQ theo thang `ads_effectiveness_rubric`
    (5 mức), HVM=0 khi đã chi = đỏ; NS/Lead/HVM/CVR xanh dương đậm dần theo cột. Có dòng Cộng từng TT + Tổng cộng.
- **Đã nạp plan thực tế EduNext (10/2026)** từ file "VMG_EduNext_ActionPlan": campaign `EDUNEXT-2026` (product_gtm, brand VMG,
  03/09–30/11/2026, owner = Trưởng phòng Marketing) + 21 hạng mục Action Plan. Mỗi hạng mục = 1 task duy nhất: 14 task chạy qua pipeline T1
  (`importScope=T1:EDUNEXT-2026`, `externalKey=A01..A21`, có thể undo) + 7 hạng mục #11,13,15,16,17,18,19 là bài content nên là task cha của 7
  `content_items` (không sinh task con, ngày đăng = hạn hạng mục vì Lịch Content chỉ ghi tuần). Map tên: Khiết/Trân → tài khoản `khiet`/`tran`, Nghiêm →
  `admin@vmg.local`. "Giám đốc Khu vực"/"R&D" không có tài khoản nên chỉ nằm trong mô tả task. Link Canva + thư mục media ở `campaigns.notes`;
  Sale Kit chưa có link (`[CẦN BỔ SUNG]`). Hạng mục #11 (Action Plan: Chưa bắt đầu) lệch Lịch Content (Hoàn thành) → đang theo Lịch Content (published).
- **Đã nạp plan UpLearn Q4/2026** từ file "VMG_UpLearn_Ke_Hoach_Trien_Khai_Q4_2026": campaign `UPLEARN-Q4-2026` (product_gtm, brand UPLEARN,
  01/10–31/12/2026, status preparing, owner Nghiêm = `admin@vmg.local`; mục tiêu go/no-go, KPI lead/CPL, ngân sách, RACI, danh mục sản phẩm, pháp lý ở các
  trường/ghi chú campaign) + 42 task (`importScope=T1:UPLEARN-Q4-2026`, key U01..U35 = Kế hoạch hành động, L01..L07 = Pháp lý & Tuân thủ) + 40 content
  Fanpage (`importScope=T6:UPLEARN-Q4-2026`, key UL-01..40, 1 task/bài không sinh task con). **Plan gốc KHÔNG có ngày bắt đầu/kết thúc cho đầu việc** nên
  task để trống ngày (không bịa). Long/BA/PA/"TMĐT/Vận hành" chưa có tài khoản → 21 task chưa giao, ghi người phụ trách trong mô tả + nhãn. Có 10
  phụ thuộc suy từ ghi chú plan (#28←#6; #26←#7,#24; mốc ra mắt #27←#3,4,5,6,7,9,10). **Bẫy ngày**: cột NGÀY sheet Monthly Execution Plan bị Excel đọc
  nhầm mm/dd (01/10 → "10/01") nên khi đọc lại file phải hoán đổi tháng↔ngày với ô kiểu Date.
- **Content ⇄ Task đăng bài đồng bộ 2 chiều (10/2026)**: tick "Đã đăng" bên Content → `updateContentItem` đóng task cha + task con; bỏ tick → mở lại
  bước "Đăng bài" + task cha. Ngược lại **`updateTask` gọi `syncContentFromTask`** (`services/tasks.ts`): task cha "Đăng: …" HOẶC bước con "Đăng bài: …"
  xong → content `published`; mở lại khi content đang published → content về `approved`; content `cancelled` không bị kéo. Hàm này chỉ ghi
  thẳng lên content (không gọi `updateContentItem`) nên không lặp vô hạn — **mọi chỗ đổi trạng thái task phải đi qua `updateTask`** (đừng `db.update(tasks)`
  trực tiếp, sẽ mất đồng bộ). Link qua lại: cột "Task đăng bài" + khối trong dialog ở `/content`; khối "Bài content" ở trang task, mở bài bằng `/content?item=ID`.
- **Đã nạp file "VMG_Marketing_Strategy_Operations_2026" (10/2026)** — đây chính là nguồn 28 campaign + 46 hạng mục SBU mà mục "câu hỏi mở" từng ghi là chưa có:
  (1) **Brand Foundation**: 7 brand × 30 cấu phần (A1..I2) = 210 ô vào `brand_foundation_entries`; trạng thái suy từ thẻ trong ô — có "[CẦN XÁC NHẬN]" →
  `needs_confirmation` (92), chỉ "[ĐỀ XUẤT]" → `proposed` (28), không thẻ (lấy từ context project) → `confirmed` (90). Nội dung giữ nguyên cả thẻ.
  (2) **Campaign Master**: 28 campaign (CP-01..11 + BT-2026-08..BT-2027-12; ngày theo THÁNG = đầu tháng → cuối tháng). Hai campaign nạp trước đó được **đổi mã**
  UPLEARN-Q4-2026 → CP-08, EDUNEXT-2026 → CP-09 (giữ nguyên task/content, ngày và trạng thái chi tiết của plan riêng; `importScope` của task vẫn là mã cũ).
  7 mục "Backlog/đề xuất/lịch sử" cuối sheet (Every Step Matters, Brand Playlist, FuturePath...) KHÔNG nạp vì chưa có mốc thời gian. Chủ campaign để trống (file không ghi).
  (3) **Danh mục SBU**: 46 hạng mục OI/OO/FI/FO/CC-xx; 3 hạng mục mẫu cũ đổi mã OI-POSM→FI-01, OI-GMAPS→OI-02, OI-CONTENT→OI-05 (giữ rule CAD-09/08/05).
  19 ô N/A (hạng mục vật lý × TT Kinh doanh TMĐT, kỳ 2026-10) đã ghi trạng thái "không áp dụng"; mọi ô còn lại mặc định "Chưa" nên không tạo dòng.
  Chưa nạp vì sheet chỉ là khung trống: 3a_Ads_Thang (chỉ khung T10-T12), 4_Request_Order (0 request), 3b_Monitoring (42 dòng "Chưa kiểm tra", chưa có ngày lắp/chu kỳ).
- **Danh sách lớn: tải theo PHẠM VI từ server (10/2026) — đừng quay lại kiểu "tải hết rồi lọc ở client"**: `/task`, `/content`, `/campaign`, `/request` nhận
  `?view|scope=` và `?limit=` trên URL (chip `components/scope-chips.tsx` + nút "Hiện thêm" = tăng `limit`, mỗi bước 300, trần 3000). **Task** (`services/task-lists.ts`,
  hằng số client-safe ở `lib/task-view.ts` — client KHÔNG được import `services/*` vì kéo nodemailer vào bundle): view `active` (việc mở + xong/huỷ trong 30 ngày) · `mine` ·
  `overdue` · `week` (7 ngày tới) · `done` · `archived` · `all`; mặc định theo vai trò (member → `mine`, còn lại → `active`); chip có số đếm (1 truy vấn). **Lưu trữ**:
  cột `tasks.archived_at`, job `archive-old-tasks` (00:40 hằng ngày, cả cron Vercel lẫn node-cron) gom task xong/huỷ quá 90 ngày; mở lại task thì `updateTask` tự bỏ lưu
  trữ; báo cáo/Gantt/campaign vẫn tính cả task đã lưu trữ. **Content**: mặc định "gần đây & chưa đăng" (từ min(30 ngày trước, đầu tháng); bài chưa đăng quá hạn LUÔN hiện);
  mở `/content?item=ID` tự xem đủ. **Campaign**: ẩn done/cancelled. **Request**: ẩn done/rejected quá 30 ngày; thẻ thống kê tính trên toàn bộ.
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
- **Đợt phản hồi team MKT (10/2026) — đọc trước khi đụng các chỗ sau (chi tiết nghiệp vụ: SPEC Phụ lục D):**
  - **Popup chi tiết = Intercepting Routes**: slot `src/app/(app)/@modal/` (`(.)task/[id]`, `(.)campaign/[id]`, `(.)sbu/[id]`, `[...catchAll]`, `default.tsx` trả null) render lại đúng `page.tsx` gốc bên trong `<RouteModal>` (`components/shell/route-modal.tsx`; `useInRouteModal()` để ẩn nút Quay lại). **Link tới 3 trang này PHẢI dùng `next/link` / `router.push`** — thẻ `<a href>` thường tải lại cả trang và mất popup. Thêm trang chi tiết mới muốn có popup → thêm 1 thư mục `(.)ten/[id]` y hệt.
  - **Nhớ trạng thái UI**: `lib/use-session-state.ts` (`useSessionState`, nạp ở effect để không lệch hydration). DataGrid tự nhớ view/ô tìm/nhóm thu gọn/vị trí cuộn theo `persistKey ?? entity`; tab/bộ lọc ở Ads, Content, Gantt, Giám sát, Lịch, Task layout dùng hook này. State nào mới mà muốn sống sót qua Back thì dùng hook này thay `useState`.
  - **DataGrid kiểu Excel** (`components/data-grid/`): chọn ô + phím mũi tên/Tab/Enter/F2, gõ để sửa, Delete, Ctrl+C/V (dán nhiều ô), `rowClassName`, `onAddRow`, sắp xếp ô trống xuống cuối. Cột `editInputType` hỗ trợ `date` (DateInput), `month`, `number`; `editKind: "select"`. **"+ Cột"**: `custom-columns.tsx` + `custom-actions.ts` (server) + bảng `grid_custom_columns/values` — tự bật khi grid có `onEditCell`; trường tự thêm KHÔNG đi qua `onEditCell` của trang. Bảng số liệu dạng pivot ở Ads dùng `ads/ads-inline.tsx` (`InlineNum` + `useMetricSaver`: chỉ ghi đúng 1 trường).
  - **Màu task dùng chung** ở `app/(app)/task/task-style.ts` (trễ hạn đỏ, việc lặp tím) — đừng lặp lại điều kiện/màu ở nơi khác. Kanban dùng chung `task-kanban.tsx` (chống click sau khi kéo bằng mốc `lastDragAt`).
  - **Ngày**: `components/ui/date-input.tsx` (`DateInput` dd/mm/yyyy ↔ ISO, `MonthInput`) — KHÔNG dùng `<input type="date|month">`. Text sinh ra từ server (thông báo, email, tiêu đề) phải qua `fmtDate` (`lib/format.ts`). Export CSV/XLSX tự đổi cột ngày sang dd/mm/yyyy.
  - **Giám sát** (`/giam-sat`): theo SBU → hạng mục → ảnh. Ảnh nén ở client (`lib/image-compress.ts`), tải qua `POST /api/monitoring/photos`, phục vụ qua `GET /api/monitoring/photos/[id]?size=thumb|full` (lưu bytea trong `monitoring_photos`, cache bất biến). Service ở `lib/services/monitoring.ts`. Có 2 cách nhóm (`monitoring-view.tsx` công tắc `groupMode`; `monitoring-by-type.tsx` cho nhóm theo loại: khoá nhóm = kind + khu vực + tên hạng mục).
  - **SBU**: chỉ số tổng quan ở `lib/services/sbu-overview.ts` (suy ra tại truy vấn). **Campaign**: `owner_id` bắt buộc khi tạo; 24 campaign nạp từ file gốc chưa có owner → chờ chủ sản phẩm chỉ định (dùng thao tác chọn nhiều → "Gán owner").
  - **Ads Theo request**: là DataGrid (`entity="ads_requests"`), có `planned_budget` + `runner_id`; `patchAdsCampaign` chỉ ghi các trường được truyền.
  - **Tài khoản nhân sự**: Khiết/Đạt/Trân đăng nhập bằng `khiet`/`dat`/`tran` (mật khẩu trùng tên — yếu, chỉ nội bộ; xem `scripts/seed.ts`).
  - **Phân quyền & xoá (10/2026, SPEC Phụ lục D mục 14–15):** `member` = nhân sự vận hành đầy đủ (xem SPEC); mọi kiểm tra ở server action/trang dùng `isStaff()` / `isManagerLike()` từ `lib/auth/permissions.ts` — đừng viết lại `role === "admin" || role === "manager"`. Chỉ Người dùng/Cài đặt/T2 là admin-only. Xoá mềm đi qua `softDeleteTasks` (task.ts — việc lặp → Lưu trữ, không xoá thật), `deleteContentItems`, `deleteCampaigns` (đổi `code` để giải phóng unique); nút dùng chung `components/data-grid/bulk-delete.tsx`. Danh sách campaign dùng cho dropdown phải lọc `deletedAt`.
- **Đã nạp kiểm kê POSM 10 trung tâm (10/2026)** từ file "VMG_Kiem_Ke_POSM_10_Trung_Tam.xlsx" (mỗi trung tâm 1 sheet cùng mẫu; sheet "Tổng hợp toàn hệ thống" trong file bị lỗi #VALUE! nên KHÔNG nạp — app tự cộng ở nút "Tổng hợp toàn hệ thống" của `/giam-sat`, đã đối chiếu khớp các dòng file tính được: Bảng hiệu 12, Decal 28, Standee/Banner 10, Chứng nhận 19, Kệ quà 9, Brochure 206). 181 hạng mục `monitoring_items` (17 dòng chuẩn × 10 trung tâm + 10 dòng "Khác" của TPU + 1 của BPH), có thêm cột `area` / `quantity` / `size_text` (migration 0010); tình trạng + nội dung đang hiển thị + ghi chú gộp vào `current_state_note`; `last_updated_date` chỉ có khi file ghi ngày (64 dòng; ô ngày Trảng Bom bị Excel đổi 01/07 → 07/01 đã đảo lại thành 01/07/2026), chu kỳ mặc định 12 tháng. **Quy đổi tên sheet → SBU**: Võ Thị Sáu=VTS, Phạm Văn Thuận=PVT, Phước Tân=PTA, Long Thành=LDN, Xuân Lộc=HVG, Trảng Bom=TBM, Bình Phước=BPH (theo tên/bảng quy đổi ads), **Nhơn Trạch=TPU, Long Khánh=NTI (theo bảng quy đổi ads), Trảng Dài=NKN (suy ra bằng loại trừ — 4 trung tâm KV1) — [CẦN XÁC NHẬN]**; nếu sai chỉ cần đổi `sbu_id` của các hạng mục tương ứng. Đã xoá hạng mục placeholder "POSM" chung chung của VTS.
  - **Badge điểm nóng trên menu + cảnh báo đỏ Giám sát (10/2026):** `lib/services/nav-badges.ts::getNavBadges` (layout `(app)` gọi mỗi lần render, kết quả truyền xuống `SidebarNav`/`MobileNav`; kiểu + `makeBadge` ở `lib/nav-badge.ts`, client-safe). Tính RIÊNG theo tài khoản; quy tắc phạm vi chung: admin/manager thấy cả phòng, member chỉ thấy phần của mình (task giao cho tôi, content tôi sở hữu, request tôi nhận/thực hiện, SBU tôi là `ho_owner`). Đỏ = quá hạn/thiếu, vàng = đến hạn hôm nay/sắp hạn; rê chuột xem diễn giải. Thêm badge cho mục menu mới = thêm 1 hàm vào `nav-badges.ts` + `put("/href", …)` (mục lỗi thì bị bỏ qua, không làm hỏng menu). Chưa có badge cho `/ads`, `/sbu`, `/nen-tang`. **Giám sát**: 1 hạng mục bị coi là ĐỎ khi có ≥1 vấn đề trong `lib/monitoring-health.ts::monitoringIssues` — quá hạn, chưa rà soát lần nào, thiếu ảnh (Google Maps: thiếu link), thiếu hiện trạng, chưa kiểm kê số lượng (chỉ POSM/bảng hiệu/OOH). Cùng hàm này dùng cho cả viền đỏ ở `/giam-sat` lẫn con số badge — đừng viết lại điều kiện ở nơi khác.
  - **Hiệu năng (10/2026) — đọc trước khi thêm truy vấn vào layout/trang:** DB dev ở Sydney nên mỗi vòng truy vấn ~300ms từ máy local (mở kết nối mới ~2s) — truy vấn tuần tự cộng dồn rất nhanh; prod chạy `syd1` cùng vùng DB nên rẻ hơn nhiều. Quy tắc: (1) truy vấn độc lập nhau → `Promise.all`, KHÔNG `await` nối đuôi; (2) KHÔNG truy vấn trong vòng lặp (N+1) — dùng `group by`/`inArray` (vd. tiến độ campaign ở `reports.ts` từng là 1 truy vấn/campaign → `/bao-cao` 19s); (3) layout `(app)` chạy lại sau MỌI `router.refresh()` nên chỉ giữ đúng 1 truy vấn thông báo (`listNotificationsWithUnread`); badge menu tải riêng qua `GET /api/nav-badges` (client `useNavBadges` trong `sidebar-nav.tsx`: lúc mở/đổi trang, quay lại tab, mỗi 60s) chứ không nằm trong đường render; (4) **ngày nhập tay phải qua `isSaneDayStr`** (năm 2000–2100, `lib/time.ts`): `DateInput`/`dmyToIso` và `createTask`/`updateTask` chặn năm lạ — từng có task hạn 05/11/1020 làm trục Gantt dài 1000 năm → HTML 96MB; Gantt cũng tự loại task có ngày cách hôm nay quá xa và báo ở đầu trang. Cách đo: `next build` + `next start -p 3001`, đăng nhập bằng curl rồi `curl -w %{time_total} %{size_download}` từng trang (dev mode nhiễu vì compile).
  - **Growth Performance theo MẢNG + luồng Kế hoạch → Request → Báo cáo (10/2026, SPEC Phụ lục D mục 21) — GHI ĐÈ mô tả "4 tab theo chu kỳ report" ở mục "Ads redesign" phía trên:** tab lớn = Tổng quan · B2C · Ecom · B2B · VMP · VMT (khảo thí = tên hiển thị của mảng OSIR; giá trị lưu vẫn `osir`); mỗi mảng cùng 4 mục con *Kế hoạch & tiến độ · Request · Báo cáo tuần · Báo cáo tháng* (`ads/line-view.tsx`). **Khác biệt giữa các mảng chỉ khai báo ở `lib/ads-lines.ts` (`ADS_GROUPS`: line DB thuộc mảng, phễu, nhãn chuyển đổi, chỉ số nhập theo tuần, cờ `expectWeekly`)** — thêm mảng/chỉ số = thêm 1 dòng ở đó, đừng hardcode theo mảng ở UI mới. Báo cáo tuần mở cho MỌI mảng (B2C giữ bản chi tiết theo trung tâm `weekly-view.tsx`; mảng khác dùng `line-weekly.tsx`); `expectWeekly` chỉ để cảnh báo thiếu số tuần (mặc định chỉ B2C). **Kế hoạch**: bảng `ads_plans` (mảng × tháng [× trung tâm]: `planned_budget` + 6 cột `target_*` theo phễu; B2C: dòng `b2c_system` mang NS Hệ thống + mục tiêu Lead/HVM TỔNG cả B2C, dòng `b2c_center`+SBU mang NS từng TT) — thay `ads_disbursement_plan` (9 dòng cũ đã chuyển sang, bảng cũ còn nhưng KHÔNG dùng nữa). Sửa tự do + audit (`upsertAdsPlan` chỉ ghi các trường truyền vào, ghi từ→sang); `copyAdsPlans` chỉ tạo dòng chưa có. Tiến độ/dự báo/% đạt/CPL-CAC kế hoạch SUY RA ở `lib/ads-plan.ts` (có test), không lưu cột; ngưỡng ở `PLAN_THRESHOLDS`. `ads_campaigns` thêm `line` (mặc định `b2c_center`), `sbu_id` nullable (chỉ B2C có SBU); request cấp mảng dùng cho Ecom/B2B/VMP/VMT. UI: `plan-panel.tsx` (kế hoạch & tiến độ), `requests-view.tsx` nhận `group`, `monthly-view.tsx` nhận `group` (1 mảng/lần). **Đợt 2 đã xong:** Tổng quan có bảng "Kế hoạch so với thực tế" (`plan-overview.tsx`, `computePlanRows` — chỉ so trên tháng ĐÃ có kế hoạch; quý dùng `rangeElapsed`/`budgetProgressAt` ở `lib/ads-plan.ts`); import Excel 4 loại `week|month|request|plan` (`ads-import.ts`; template `/api/import/template/ads/[kind]?group=…`; tuần và request mở cho mọi mảng qua cột `line`; kế hoạch = sheet `KE_HOACH`); bảng `ads_disbursement_plan` đã DROP (migration 0014 có điều kiện chặn). Thêm chỉ số tuần/mục tiêu cho mảng = sửa `ADS_GROUPS` (+ cột `WEEK_COLS`/`PLAN_COLS` ở import nếu là chỉ số mới). Cảnh báo ở `ads/alerts.ts`: vượt/đi nhanh/chậm so kế hoạch, chưa lập kế hoạch tháng hiện tại, thiếu số tuần mảng `expectWeekly`.
  - **Campaign ⇄ brand/trung tâm (SPEC Phụ lục D mục 16):** `campaign_brands` + `campaign_sbus`, đặt qua `setCampaignLinks` (campaigns.ts; thay thế toàn bộ). Cột "Brand / sản phẩm"/"Trung tâm" ở `campaign-list.tsx` dùng `LinksCell` (TagMultiSelect, lưu sau 0,7s). **Gom nhóm DataGrid**: cột nhiều giá trị (mảng) gom theo phần tử ĐẦU; tiêu đề nhóm tra nhãn qua `enumLabels` → `enumOptions` → `filterOptions` (nếu quên khai báo options thì header hiện UUID).
  - **SBU = trung tâm HOẶC brand/sản phẩm (SPEC Phụ lục D mục 17–20, 10/2026):** `sbu_kind` có `brand`, `sbu_region` có `BRAND`, `sbus.brand_id`. 7 SBU brand (VMG, VMG_IELTS, VMG_TESOL, VMG_TRUNG, VMP, VMT, UPLEARN) — migration dữ liệu một lần đã chạy: VMP_VMT → VMP (giữ người phụ trách Đạt), tạo 6 SBU còn lại (không có HO owner), đồng bộ `campaign_brands` → `campaign_sbus` (32) và `tasks.brand_id` → `task_sbus` (52). Seed khớp. **`isFanOutSbu` (`lib/sbu-kinds.ts`)** = trung tâm + brand đã có HO owner: dùng cho fan-out checklist của recurring, ma trận hạng mục, báo cáo %SBU — đừng liệt kê mọi SBU ở đó. Nhãn loại/khu vực SBU dùng chung ở `lib/sbu-kinds.ts`. Campaign/task chọn SBU qua `components/sbu-links.tsx` (`LinksCell`, `sbuTagOptions`); `setCampaignLinks`/`setTaskSbus` tự đồng bộ brand.
  - **Brand Performance** (`/brand-performance`): `brand_channels` + `brand_perf_metrics`; hằng số/công thức thuần ở `lib/brand-perf.ts` (có test), service `lib/services/brand-perf.ts` (`setBrandPerfValue` chỉ ghi đúng 1 chỉ số, kiểm tra chỉ số có áp dụng cho kênh). UI nhập ô dùng lại `ads/ads-inline.tsx`. Module Ads hiển thị là **Growth Performance** (route vẫn `/ads`, resource quyền vẫn `ads`).
  - **Báo cáo xuất (Excel/PDF)**: `lib/reports/` — `types.ts` (ReportDoc trung lập), `builders.ts` (4 loại: sbu/brand/growth/management; mỗi loại 1 hàm build), `xlsx.ts` (ExcelJS, logo nhúng base64 ở `logo-data.ts` — sinh từ `public/brand/vmg-english-logo.png`), `access.ts` (quyền). PDF = trang in `/in-bao-cao/[kind]` (`components/report/report-doc-view.tsx` + `report.css`, A4, "In → Lưu PDF"); Excel qua `GET /api/export/report?kind=&period=`. Nút dùng chung `components/report/export-menu.tsx`. Thêm báo cáo mới = thêm 1 builder + 1 giá trị `ReportKind` + quyền ở `access.ts`; muốn đổi giao diện báo cáo chỉ sửa 2 renderer, không đụng builder.
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

Email thật của admin (placeholder `admin@vmg.local`; Khiết/Đạt/Trân hiện đăng nhập bằng tên ngắn `khiet`/`dat`/`tran`, mật khẩu trùng tên — yếu, chỉ nội bộ) ·
dữ liệu 28 campaign + 46 hạng mục SBU catalog từ file
`VMG_Marketing_Strategy_Operations_2026.xlsx` (chưa được cung cấp) · SLA
request theo loại (đã hỏi — chủ sản phẩm xác nhận CHƯA CÓ, giữ mặc định
"người tiếp nhận tự nhập hạn cam kết", không phải việc còn treo nữa).

4 câu đã CHỐT (xem "Quyết định đã chốt" bên trên) — không hỏi lại: ngày họp
CAD-01, work_days có Thứ 7, danh sách KV2/KV3.
