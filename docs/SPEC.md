# MKT OS - ĐẶC TẢ SẢN PHẨM VÀ KỸ THUẬT

> Phiên bản: v0.1 (bản nháp để đưa coding agent) | Ngày: 02/10/2026
> Chủ sản phẩm: Trưởng phòng Marketing, VMG (Viet My Group)
> Ngôn ngữ giao diện: tiếng Việt. Mã nguồn, tên bảng, tên trường: tiếng Anh, snake_case.
> Tài liệu đi kèm (nguồn seed và hình mẫu cấu trúc): `VMG_Marketing_Strategy_Operations_2026.xlsx` (sheet 1 đến 4)

Quy ước đánh dấu trong tài liệu:
- **[MVP]** bắt buộc có ở phase 1. **[P2]**, **[P3]** là phase sau.
- **[CẦN XÁC NHẬN]** là điều chưa có thông tin, agent không tự quyết, phải hỏi chủ sản phẩm hoặc dùng giá trị mặc định ghi kèm.
- **[MẶC ĐỊNH]** là giá trị agent dùng ngay, có thể đổi sau trong trang cấu hình.

---

## 0. TÓM TẮT MỘT TRANG

MKT OS là ứng dụng web nội bộ để phòng Marketing VMG hoạch định chiến lược từ nền tảng đến thực thi và, quan trọng nhất, **biến mọi việc phải làm thành task có người, có hạn, có nhắc**.

Ba ý chính cần agent nắm trước khi đọc tiếp:

1. **Task là lõi.** Campaign, content calendar, kế hoạch quay chụp, request từ trung tâm, kiểm tra POSM, chạy ads, báo cáo cuối tháng: tất cả cuối cùng đều sinh ra task. Mỗi nhân sự đăng nhập là thấy ngay việc của mình.
2. **Nhập liệu bằng file template.** Mỗi tháng chủ sản phẩm nạp file plan (xlsx) theo template. Hệ thống đọc, kiểm tra, xem trước, rồi tạo campaign, hạng mục và task hàng loạt. Nạp lại cùng file không được tạo trùng, không được ghi đè phần người dùng đã sửa tay.
3. **Việc lặp lại là công dân hạng nhất.** Báo cáo cuối tháng, kiểm tra hiện trạng POSM từng trung tâm, nhắc mốc 10-15-20-25-29 hàng tháng: định nghĩa một lần bằng quy tắc lặp, hệ thống tự sinh task đúng hạn, kể cả quy tắc "một việc cho mỗi trung tâm".

Kích thước hệ thống rất nhỏ: dưới 50 người dùng, ước tính 500 đến 1.500 task mỗi tháng. **Không cần kiến trúc phân tán.** Một ứng dụng, một cơ sở dữ liệu Postgres, một tiến trình chạy lịch là đủ.

---

## 1. BỐI CẢNH, MỤC TIÊU, PHI MỤC TIÊU

### 1.1 Bối cảnh

- VMG là hệ thống giáo dục (tiếng Anh, du học, hướng nghiệp) tại Đồng Nai, có 10 trung tâm cộng Trung tâm Kinh doanh TMĐT (trung tâm thứ 11, hiệu lực 05/10/2026). Phòng Marketing HO phục vụ đồng thời việc truyền thông tổng (ATL) và yêu cầu từ các trung tâm.
- Hiện công việc nằm rải rác ở Excel, email, Zalo, MISA. Hậu quả: quên việc, trễ hạn, không biết ai đang giữ việc gì, không đo được tải công việc từng người.
- Đã có một công cụ nội bộ tương tự cho mảng TMĐT (CommerceOS). **Bài học bắt buộc rút ra:** bản đó lưu dữ liệu trong `localStorage` của từng trình duyệt nên không dùng chung được nhiều người. MKT OS phải có backend và cơ sở dữ liệu thật ngay từ đầu.

### 1.2 Mục tiêu

| # | Mục tiêu | Cách đo |
|---|---|---|
| G1 | Không còn việc bị quên | Tỷ lệ task trễ hạn không có người biết = 0 (mọi task trễ đều có thông báo đã gửi) |
| G2 | Mọi nhân sự mở app là biết hôm nay làm gì | Dashboard "Việc của tôi" là trang mặc định sau đăng nhập |
| G3 | Nhập plan tháng trong dưới 30 phút | Từ lúc có file template đã điền đến lúc task xuất hiện |
| G4 | Việc lặp lại không cần nhớ | Tỷ lệ task định kỳ được tạo đúng hạn = 100% |
| G5 | Quản lý thấy tải và tiến độ | Có màn hình tải công việc theo người, tiến độ theo campaign |
| G6 | Thay thế sheet 2, 3, 4 của file Excel hiện tại | Dữ liệu seed khớp, vận hành được không cần Excel |

### 1.3 Phi mục tiêu (agent không làm trong phase 1)

- Không làm CRM, không lưu dữ liệu lead hoặc học viên (đã có hệ thống CRM riêng).
- Không thay MISA. Phê duyệt chính thức và order vẫn qua MISA, MKT OS chỉ lưu mã hoặc link tham chiếu.
- Không chấm công, không tính lương, không time tracking chi tiết.
- Không tích hợp trực tiếp Meta Ads, Google Ads, Zalo ở phase 1.
- Không làm ứng dụng di động riêng. Dùng web responsive, [P2] PWA.
- **Không lưu dữ liệu cá nhân của học viên, phụ huynh, khách hàng.** Đây là ràng buộc thiết kế để tránh thủ tục pháp lý về dữ liệu cá nhân. Giao diện form request phải có cảnh báo "không nhập thông tin cá nhân học viên".

---

## 2. NGUYÊN TẮC THIẾT KẾ

1. **Một việc, một task, một người chịu trách nhiệm.** Mỗi task có đúng 1 người phụ trách chính (assignee) và có thể có người phối hợp (collaborators).
2. **Plan sinh task, task không mồ côi.** Task tạo từ nguồn nào thì lưu `source_type` và `source_id` để truy ngược (từ task mở lại campaign, content hoặc request gốc).
3. **Không làm ngập người dùng.** Hệ thống phải gộp, không bắn từng việc nhỏ. Quy tắc lặp theo trung tâm mặc định sinh **1 task có checklist theo trung tâm**, không sinh 12 task rời (xem mục 6.5).
4. **Import không phá dữ liệu.** Nạp lại là cập nhật (upsert theo khóa), không nhân đôi. Trường đã bị người dùng sửa tay thì không bị file ghi đè mà hiện thành xung đột để chọn.
5. **Không bịa dữ liệu.** Ô thiếu thông tin hiển thị `[CẦN XÁC NHẬN]` hoặc để trống. Hệ thống không tự điền giá trị.
6. **Tiếng Việt, múi giờ Việt Nam.** Định dạng ngày `dd/mm/yyyy`, tuần bắt đầu thứ Hai, múi giờ `Asia/Ho_Chi_Minh`, lưu thời gian dạng UTC trong cơ sở dữ liệu.
7. **Đơn giản trước, mạnh sau.** Làm đúng và chắc phần lõi (task, lặp, import, nhắc) trước khi làm phần đẹp (Gantt kéo thả, báo cáo).
8. **Bộ nhận diện VMG** cho giao diện: Đỏ `#BE202F` (chủ đạo), Vàng đồng `#8B672A` (nhấn), Charcoal `#2A2420` (chữ), nền sáng. Font Arial làm dự phòng.

---

## 3. NGƯỜI DÙNG, VAI TRÒ, QUYỀN

### 3.1 Vai trò

| Vai trò (`role`) | Ai | Mô tả |
|---|---|---|
| `admin` | Trưởng phòng Marketing | Toàn quyền, cấu hình, nhập liệu, xem mọi thứ |
| `manager` | Phó phòng hoặc trưởng nhóm (nếu có) | Như admin trừ cấu hình hệ thống và xóa dữ liệu gốc |
| `member` | Nhân sự Marketing HO (marketing executive, designer...) | Thấy toàn bộ plan; sửa task của mình; tạo task cho mình |
| `center_contributor` | GĐKV, GĐ trung tâm, EC, đầu mối marketing tại trung tâm | Chỉ gửi request, nhận và xác nhận task thuộc trung tâm của mình, xem Brand Kit |
| `viewer` | BOD, Giám đốc Khối | Chỉ xem dashboard, campaign master, tiến độ |

### 3.2 Ma trận quyền (rút gọn)

| Chức năng | admin | manager | member | center_contributor | viewer |
|---|---|---|---|---|---|
| Xem Campaign master, Foundation | ✔ | ✔ | ✔ | Chỉ Brand Kit và chủ đề tháng | ✔ |
| Sửa Campaign, Foundation | ✔ | ✔ | ✘ | ✘ | ✘ |
| Nạp file import | ✔ | ✔ | ✘ [MẶC ĐỊNH] | ✘ | ✘ |
| Xem mọi task | ✔ | ✔ | ✔ (chỉ xem, sửa task của mình) | Chỉ task thuộc trung tâm mình | ✔ |
| Tạo task, giao cho người khác | ✔ | ✔ | Giao cho mình; giao người khác cần cờ `can_assign` | ✘ | ✘ |
| Tạo request | ✔ | ✔ | ✔ | ✔ | ✘ |
| Cấu hình quy tắc lặp | ✔ | ✔ | Tạo quy tắc cho bản thân | ✘ | ✘ |
| Xem workload, báo cáo | ✔ | ✔ | Của mình | ✘ | ✔ |
| Quản lý người dùng, SBU, danh mục | ✔ | ✘ | ✘ | ✘ | ✘ |

Phân quyền thực thi ở **tầng cơ sở dữ liệu hoặc tầng truy cập dữ liệu phía server** (Row Level Security hoặc lớp policy), không chỉ ẩn nút ở giao diện.

### 3.3 Đăng nhập

- [MẶC ĐỊNH] Đăng nhập Google, giới hạn miền email nội bộ `vmg.edu.vn` (suy ra từ địa chỉ email công ty; [CẦN XÁC NHẬN] công ty dùng Google Workspace). Admin mời người dùng bằng email, người chưa được mời không vào được dù đúng miền.
- Phương án dự phòng: email và mật khẩu do admin tạo.
- Người dùng `center_contributor` ngoài miền hoặc chưa có tài khoản: hỗ trợ **liên kết ký số một lần (magic link)** trong email để bấm "Xác nhận đã xong" cho task được giao, không bắt buộc đăng nhập. Liên kết hết hạn sau 7 ngày, chỉ tác động lên đúng một task.

---

## 4. KHÁI NIỆM LÕI VÀ MÔ HÌNH DỮ LIỆU

### 4.1 Quan hệ chính

```
Brand ─┐
       ├─ Campaign ──── Task (action plan = task có campaign_id)
SBU ───┘                 ▲   ▲   ▲   ▲
                         │   │   │   └── RecurringRule (sinh task định kỳ)
ContentItem ─────────────┘   │   └────── Request (yêu cầu từ trung tâm)
MediaShoot ──────────────────┘
SbuCatalogItem x SBU x kỳ ── SbuItemStatus (ma trận trạng thái, suy ra từ task)
```

**Quyết định quan trọng:** "action plan của campaign" **không phải bảng riêng**. Đó là các task có `campaign_id`. Tab "Action plan" chỉ là view của task nhóm theo campaign. Như vậy không phải đồng bộ hai nơi.

### 4.2 Các thực thể và trường

Kiểu dữ liệu ghi theo Postgres. Mọi bảng có `id uuid`, `created_at`, `updated_at`, `created_by`. Bảng dữ liệu gốc có thêm `deleted_at` (xóa mềm).

#### `users`
`email` (unique), `full_name`, `role`, `team` (`ho_marketing` | `center` | `bod` | `other`), `sbu_id` (nullable, dùng cho `center_contributor`), `can_assign boolean`, `active boolean`, `notification_prefs jsonb`, `work_days` (mặc định thứ 2 đến thứ 6, [CẦN XÁC NHẬN] có làm thứ 7 không), `avatar_url`.

#### `sbus` (đầu mối SBU)
`code` (unique: `VTS`, `PVT`, `NKN`, `TBM`, `LDN`, `TPU`, `PTA`, `NTI`, `HVG`, `BPH`, `TMDT`, `VMP_VMT`), `name`, `kind` (`center` | `online_center` | `group`), `region` (`KV1` | `KV2` | `KV3` | `KV2_KV3` | `ONLINE` | `RND`), `ho_owner_id` (nhân sự HO phụ trách), `active`.

#### `brands`
`code` (`VMG`, `VMG_IELTS`, `VMG_TESOL`, `VMG_TRUNG`, `VMP`, `VMT`, `UPLEARN`), `name`, `kind`, `color`, `public_name_allowed boolean` (VMT: `false` cho đến khi có quyết định rebrand, giao diện cảnh báo khi dùng tên này trong nội dung công khai).

#### `brand_foundation_entries` (cho tab Foundation)
`brand_id`, `section_code` (A đến I), `component_code` (A1, B1, C1...), `component_label`, `content text`, `status` (`confirmed` | `needs_confirmation` | `proposed`), `version int`, `updated_by`. Mỗi lần sửa lưu bản lịch sử (`brand_foundation_history`).

#### `campaigns`
`code` (unique, ví dụ `BT-2026-09`, `CP-08`), `name`, `type` (`brand_theme` | `product_gtm` | `business_program` | `rebrand` | `data_program` | `internal_program` | `other`), `tagline`, `occasion`, `start_date`, `end_date`, `status` (`planned` | `preparing` | `running` | `paused` | `done` | `cancelled` | `needs_confirmation`), `owner_id`, `target_audience text`, `insight_message text`, `objective text`, `hero_activity text`, `cta`, `channels text`, `role_split text` (vai trò HO và trung tâm), `budget_note text` (chữ, không ép số), `kpi_note text`, `source_note`, `notes`. Quan hệ nhiều-nhiều với `brands` (`campaign_brands`).

#### `tasks` (thực thể trung tâm)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `code` | text unique | `T-000123`, tự tăng |
| `title` | text | bắt buộc |
| `description` | text (markdown) | |
| `type` | enum | `campaign_action`, `content`, `media`, `request`, `monitoring`, `ads`, `report`, `meeting`, `general` |
| `status` | enum | `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled` |
| `blocked_reason` | text | bắt buộc khi `blocked` |
| `priority` | enum | `urgent`, `high`, `medium`, `low` |
| `assignee_id` | uuid | người chịu trách nhiệm chính |
| `creator_id` | uuid | |
| `start_date` | date | |
| `due_date` | date | hạn |
| `due_time` | time nullable | nếu có giờ cụ thể (ví dụ giờ đăng bài) |
| `time_slot` | enum `morning`/`afternoon`/`all_day` | dùng cho lịch tuần gửi BOD |
| `estimate_hours` | numeric nullable | tùy chọn, dùng cho workload |
| `completed_at` | timestamptz | đặt khi chuyển `done`, xóa khi mở lại |
| `parent_id` | uuid nullable | task con (tối đa 2 cấp) |
| `campaign_id` | uuid nullable | |
| `brand_id` | uuid nullable | |
| `workstream` | text nullable | nhóm trong campaign (ví dụ "Digital", "Offline", "PR") |
| `channel` | text nullable | Fanpage, TikTok, Zalo OA, Website, Offline... |
| `deliverable_url` | text nullable | link sản phẩm bàn giao |
| `reference_url` | text nullable | link brief, MISA, tài liệu |
| `is_milestone` | boolean | mốc không có thời lượng |
| `source_type` | enum | `manual`, `import`, `recurring`, `content_item`, `media_shoot`, `request`, `campaign_template` |
| `source_id` | uuid nullable | |
| `recurring_rule_id` | uuid nullable | |
| `occurrence_date` | date nullable | ngày danh nghĩa của lần lặp (để chống tạo trùng) |
| `external_key` | text nullable | khóa để upsert khi import, unique theo `(import_scope, external_key)` |
| `import_batch_id` | uuid nullable | |
| `manually_edited_fields` | text[] | trường người dùng đã sửa tay sau khi sinh |
| `sort_order` | numeric | thứ tự trong kanban và list |

Bảng phụ thuộc task: `task_collaborators`, `task_sbus` (một task liên quan nhiều SBU), `task_labels`, `checklist_items` (`task_id`, `text`, `done`, `sbu_id` nullable, `done_by`, `done_at`), `task_dependencies` (`predecessor_id`, `successor_id`, kiểu `finish_to_start`), `task_watchers`, `comments` (hỗ trợ @mention), `attachments` (link ở phase 1, tệp ở [P2]), `activity_log` (ghi mọi thay đổi: ai, lúc nào, trường nào, giá trị cũ và mới).

**Trạng thái "trễ hạn" là giá trị suy ra, không lưu:** `overdue = status NOT IN (done, cancelled) AND (due_date < hôm nay OR (due_date = hôm nay AND due_time < bây giờ))`.

#### `recurring_rules`: xem mục 6.

#### `content_items` (dòng content calendar)
`brand_id` (brand chính), `brand_ids uuid[]` (1 post có thể gắn NHIỀU brand — luôn chứa brand_id ở vị trí đầu), `campaign_id` nullable, `sbu_id` nullable (nếu là nội dung của trung tâm), `publish_date`, `publish_time`, `channel` (kênh chính), `channels text[]` (đăng chéo nhiều kênh — luôn chứa channel ở vị trí đầu), `content_pillar`, `topic`, `target_audience`, `key_message`, `format`, `resource_source`, `owner_id`, `cta`, `target_metric`, `support_needed`, `status` (`brief` | `drafting` | `designing` | `in_review` | `approved` | `published` | `cancelled`), `post_url`, `parent_task_id`.

#### `media_shoots`, `media_deliverables`
`media_shoots`: `code`, `shoot_date`, `location`, `sbu_id` nullable, `brand_id` nullable, `purpose`, `crew text`, `equipment text`, `script_url`, `status` (`planned` | `prepared` | `shot` | `editing` | `done` | `cancelled`), `notes`. `media_deliverables`: `shoot_id`, `deliverable_type` (video ngắn, ảnh, reel, phỏng vấn...), `quantity`, `channel`, `brand_id`, `campaign_id`, `editor_id`, `due_date`, `result_url`.

#### `requests` (yêu cầu từ phòng ban, trung tâm)
`code` (`REQ-0001`), `received_date`, `source_channel` (`misa` | `email` | `zalo` | `direct` | `meeting` | `other`), `requester_name`, `requester_sbu_id`, `request_type` (`design` | `ads` | `content` | `media` | `posm` | `event` | `consulting` | `other`), `sbu_group` (Online/Offline x Inbound/Outbound), `description`, `reference_url` (MISA hoặc brief), `priority`, `desired_date`, `in_scope` (`yes` | `no` | `needs_review`), `accepted_by_id`, `committed_date`, `completed_date`, `status` (`new` | `accepted` | `in_progress` | `in_review` | `done` | `rejected` | `postponed`), `deliverable_url`, `reject_reason`, `task_id`. Khi request chuyển `accepted`, tự sinh task (mục 7.4).

#### `sbu_catalog_items` và `sbu_item_status` (ma trận SBU)
`sbu_catalog_items`: `code` (`OI-01`...), `group` (`online_inbound` | `online_outbound` | `offline_inbound` | `offline_outbound` | `cross`), `title`, `description`, `ho_plan boolean`, `ho_execute boolean`, `ho_control boolean`, `center_role text`, `cycle text`, `priority`, `reference_text`, `default_recurring_rule_id` nullable. Seed từ sheet `3_SBU_Marketing` của file Excel.
`sbu_item_status`: `catalog_item_id`, `sbu_id`, `period` (ví dụ `2026-10`), `status` (`not_started` | `in_progress` | `done` | `blocked` | `not_applicable`), `status_source` (`derived_from_task` | `manual`), `task_id` nullable, `note`. Mặc định trạng thái **suy ra từ task** (mục 6.6), cho phép sửa tay.

#### `notifications`, `import_batches`, `import_rows`, `saved_views`, `holidays`, `app_settings`
Mô tả ở các mục 8, 10, 11 và 13.

---

## 5. TASK ENGINE

### 5.1 Vòng đời trạng thái

```
todo ──► in_progress ──► in_review ──► done
  │            │              │
  └─► blocked ◄┴──────────────┘     (blocked cần blocked_reason; gỡ chặn quay về trạng thái trước)
  any ──► cancelled
done ──► (mở lại) todo | in_progress
```

Cho phép chuyển trạng thái tự do giữa các trạng thái (không ép đúng thứ tự), nhưng mọi thay đổi ghi `activity_log`.

### 5.2 Hành vi bắt buộc

- Đặt `done` thì ghi `completed_at`; mở lại thì xóa.
- Task cha chỉ tự động `done` khi mọi task con `done` hoặc `cancelled` [MẶC ĐỊNH], đồng thời hiển thị tiến độ con `x/y`.
- Khi đổi `assignee`, gửi thông báo cho người nhận và người cũ.
- Khi task có phụ thuộc: không cho chuyển `in_progress` hoặc `done` nếu task tiền nhiệm chưa `done`, trừ khi người dùng xác nhận "bỏ qua phụ thuộc". Dời hạn task tiền nhiệm hiển thị cảnh báo nếu làm lệch hạn task sau (không tự dời).
- Mọi thao tác ghi dữ liệu có kiểm tra quyền (mục 3.2) và đưa vào `activity_log`.
- Sắp xếp mặc định ở danh sách: `due_date` tăng dần, rồi `priority`, rồi `sort_order`.

### 5.3 Giao việc và theo dõi

- `@mention` trong bình luận gửi thông báo.
- Người dùng có thể "theo dõi" (watch) task để nhận thông báo thay đổi.
- Giao việc hàng loạt: chọn nhiều task rồi đổi người phụ trách, đổi hạn, đổi trạng thái.
- Nhân bản task, nhân bản campaign (bao gồm task con, dời ngày theo khoảng lệch người dùng chọn). [MVP] chỉ nhân bản task; [P2] nhân bản campaign.

---

## 6. VIỆC LẶP LẠI (RECURRING)

Đây là tính năng bắt buộc và hay làm sai. Đọc kỹ.

### 6.1 Ví dụ cần chạy được ngay

| Việc | Quy tắc |
|---|---|
| Báo cáo marketing tháng | Hàng tháng, ngày làm việc cuối cùng của tháng, giao Trưởng phòng |
| Kiểm tra hiện trạng POSM từng trung tâm | Hàng tháng, ngày 28, mỗi nhân sự HO nhận việc cho các trung tâm mình phụ trách |
| Báo cáo ads tuần | Hàng tuần, thứ Hai |
| HO gửi bản nháp Brand Campaign tháng sau cho GĐKV | Hàng tháng, ngày 10 |
| Họp thống nhất Brand Theme tháng | Hàng tháng, [CẦN XÁC NHẬN ngày] |
| Trung tâm gửi Content Plan | Hàng tháng, ngày 25, theo dõi từng trung tâm |
| Rà soát Google Maps các trung tâm | Hàng tháng, ngày làm việc đầu tiên |
| Nhắc nhập lịch tuần gửi BOD | Hàng tuần, [CẦN XÁC NHẬN ngày giờ] |

### 6.2 Mô hình `recurring_rules`

| Trường | Ghi chú |
|---|---|
| `name`, `description` | |
| `task_template` (jsonb) | `title` (hỗ trợ biến), `description`, `type`, `priority`, `channel`, `campaign_id`, `labels`, `checklist` (mảng), `estimated_hours`, `time_slot` |
| `freq` | `daily` / `weekly` / `monthly` / `yearly` |
| `interval` | số nguyên, mặc định 1 (ví dụ 2 tuần một lần) |
| `by_weekday` | mảng 1-7, dùng cho `weekly` |
| `by_month_day` | số 1-31, hoặc `-1` = ngày cuối tháng; dùng cho `monthly` |
| `by_nth_weekday` | ví dụ "thứ Hai đầu tiên" của tháng |
| `day_rule` | `calendar_day` / `last_working_day` / `first_working_day` |
| `holiday_policy` | `none` / `shift_earlier` / `shift_later` khi rơi vào ngày nghỉ hoặc lễ [MẶC ĐỊNH `shift_earlier` cho hạn nộp, `shift_later` cho việc bắt đầu] |
| `due_offset_days` | số ngày từ ngày danh nghĩa đến `due_date` (mặc định 0) |
| `start_offset_days` | số ngày trước hạn mà task được tạo và hiện ra, mặc định 3 |
| `due_time` | giờ hạn (tùy chọn) |
| `starts_on` | ngày bắt đầu áp dụng quy tắc |
| `ends_on` hoặc `max_occurrences` | giới hạn (tùy chọn) |
| `assignment_mode` | `fixed_user` / `sbu_ho_owner` / `round_robin` / `unassigned` |
| `fixed_assignee_id` | dùng với `fixed_user` |
| `round_robin_user_ids` | dùng với `round_robin` |
| `scope_mode` | `single` / `per_sbu` (xem 6.5) |
| `scope_sbu_ids` | tập SBU áp dụng |
| `fan_out_mode` | `checklist_per_owner` / `task_per_sbu` (xem 6.5) |
| `generation_horizon_days` | sinh trước bao nhiêu ngày, mặc định 45 |
| `completion_behavior` | `fixed_schedule` (mặc định) / `after_completion` |
| `active`, `paused_until` | |

Biến dùng trong `title` và `description`: `{{month}}`, `{{month_name}}`, `{{year}}`, `{{prev_month}}`, `{{next_month}}`, `{{week_number}}`, `{{due_date}}`, `{{sbu_code}}`, `{{sbu_name}}`, `{{owner_name}}`. Ví dụ tiêu đề: `Báo cáo Marketing tháng {{month}}/{{year}}`.

### 6.3 Cơ chế sinh task

- Một **tiến trình chạy lịch** (cron) chạy mỗi đêm (ví dụ 00:30) và khi quy tắc vừa được tạo hoặc sửa. Với mỗi quy tắc đang hoạt động, tính các ngày danh nghĩa trong khoảng `[hôm nay, hôm nay + generation_horizon_days]` và tạo task còn thiếu.
- **Chống tạo trùng bắt buộc:** ràng buộc duy nhất `(recurring_rule_id, occurrence_date, scope_key)` ở cơ chế cơ sở dữ liệu, tiến trình chạy lại bao nhiêu lần cũng không sinh trùng. (`scope_key` là `sbu_id` khi `task_per_sbu`, hoặc `owner_id` khi `checklist_per_owner`, hoặc rỗng.)
- Dùng thư viện `rrule` (hoặc tương đương đã được kiểm chứng) cho tính ngày; **ngày làm việc cuối cùng, ngày làm việc đầu tiên và dịch ngày lễ do mã ứng dụng xử lý** dựa trên bảng `holidays` và `users.work_days`/cấu hình tuần làm việc của phòng.
- Tháng ngắn: `by_month_day = 31` rơi vào tháng không có ngày 31 thì lấy ngày cuối tháng.
- Sinh task `todo` với `source_type = recurring`.

### 6.4 Sửa và xóa

Khi sửa hoặc xóa một task thuộc chuỗi, hỏi người dùng:
1. **Chỉ lần này**: chỉ sửa task đó, đánh dấu ngoại lệ (task giữ nguyên dù quy tắc đổi).
2. **Lần này và các lần sau**: tách quy tắc (kết thúc quy tắc cũ, tạo quy tắc mới bắt đầu từ ngày đó).
3. **Toàn bộ chuỗi**: sửa quy tắc và cập nhật mọi task chưa `done` chưa bị sửa tay.

Task đã `done` không bao giờ bị sửa tự động. Có thao tác "Bỏ qua lần này" (skip) cho một lần lặp (ghi lại ngày bị bỏ qua để tiến trình không sinh lại).

### 6.5 Quy tắc "mỗi trung tâm một việc" (fan-out)

Nhiều việc định kỳ áp dụng cho 12 SBU. Sinh 12 task rời mỗi tháng cho mỗi loại việc sẽ làm ngập danh sách. Hỗ trợ hai chế độ:

- **`checklist_per_owner` [MẶC ĐỊNH]**: mỗi nhân sự HO nhận **1 task** cho kỳ đó, bên trong có checklist liệt kê các SBU mà người đó phụ trách (`checklist_items.sbu_id`). Ví dụ "Kiểm tra POSM tháng 10": Khiết nhận 1 task có checklist VTS, PVT, NKN, TBM, TMDT; Đạt nhận 1 task có checklist LDN, TPU, PTA, NTI, HVG, BPH, VMP_VMT. Task `done` khi mọi mục checklist xong. Mỗi mục checklist tick được kèm ghi chú và link ảnh.
- **`task_per_sbu`**: mỗi SBU một task riêng (dùng cho việc nặng, cần theo dõi riêng, ví dụ "Gửi Content Plan" do trung tâm thực hiện, giao cho `center_contributor` của SBU đó).

Người phụ trách của mỗi SBU lấy từ `sbus.ho_owner_id`. Đổi người phụ trách SBU thì chỉ áp dụng cho task **chưa sinh** hoặc **chưa `done`**.

### 6.6 Liên kết ma trận SBU với task

Với hạng mục trong `sbu_catalog_items` có quy tắc lặp mặc định: khi mục checklist của một SBU được tick xong (hoặc task per-SBU `done`), tự cập nhật `sbu_item_status` của `(hạng mục, SBU, kỳ)` thành `done`. Task quá hạn chưa xong: ô hiển thị `blocked` hoặc `in_progress` tùy cấu hình, và nổi lên màn hình quản lý. Nhờ vậy sheet "SBU Marketing" cập nhật **tự động từ công việc thật**, không phải nhập tay thêm một lần nữa.

---

## 7. SINH TASK TỰ ĐỘNG TỪ CÁC NGUỒN KHÁC

Mọi quy tắc dưới đây cấu hình được trong trang cài đặt (mục 13.4). Các độ lệch ngày là [MẶC ĐỊNH].

### 7.1 Từ Campaign / Action plan [MVP]
Mỗi dòng action plan trong file import = 1 task `campaign_action` (nếu có cột "việc con" thì tạo task con). Gán `campaign_id`, `workstream`, người phụ trách, hạn từ file.

### 7.2 Từ Content calendar [P2]
Mỗi `content_item` sinh **1 task cha** "Đăng: {chủ đề} - {kênh}" có hạn là `publish_date`/`publish_time`, kèm các task con theo `content_workflow_template` của từng brand hoặc kênh:

| Task con mặc định | Hạn | Người phụ trách |
|---|---|---|
| Soạn nội dung | `publish_date` - 3 ngày làm việc | `owner_id` của content item |
| Thiết kế | `publish_date` - 2 ngày làm việc | nhân sự thiết kế [CẦN XÁC NHẬN: ai], hoặc theo bảng định tuyến |
| Duyệt | `publish_date` - 1 ngày làm việc | Trưởng phòng hoặc người duyệt |
| Đăng bài | `publish_date` | `owner_id` |

Trạng thái `content_item` đồng bộ hai chiều với các task con (xong "Đăng bài" thì `published`). Có tùy chọn "chỉ 1 task, không task con" cho nội dung đơn giản.

### 7.3 Từ Kế hoạch quay chụp (Media production plan) [P2]
Mỗi `media_shoot` sinh:
- Task chuẩn bị (kịch bản, địa điểm, liên hệ trung tâm): hạn `shoot_date` - 5 ngày làm việc.
- Task thực hiện quay: đúng `shoot_date`, `time_slot` theo cấu hình.
- Task hậu kỳ cho **mỗi** `media_deliverable`: giao `editor_id`, hạn `due_date` của deliverable.

Hỗ trợ **tạo tự động lịch quay định kỳ**: nhập ngày đợt 1 và số đợt, hệ thống tạo các `media_shoot` cách nhau 14 ngày. Có thể dời từng đợt.

### 7.4 Từ Request [MVP]
Khi request chuyển sang `accepted`: sinh 1 task `request`, giao cho người được định tuyến (bảng `request_routing`: `request_type` + `sbu_id` tùy chọn đến `assignee_id`, ví dụ thiết kế đến designer), hạn là `committed_date`. [CẦN XÁC NHẬN] SLA mặc định theo loại request; chưa có SLA thì bắt buộc người tiếp nhận nhập `committed_date`. Trạng thái request đồng bộ hai chiều với task (task `done` thì request `done`).

### 7.5 Từ Nhịp điều phối Brand Campaign hàng tháng [MVP]
Seed sẵn các quy tắc lặp theo cơ chế 6 mốc (Phụ lục C). Quy tắc sinh task trước hạn đủ để người liên quan kịp chuẩn bị.

### 7.6 Từ Ma trận SBU [P2]
Hạng mục trong `sbu_catalog_items` có `default_recurring_rule_id` thì khi bật cho một SBU, quy tắc lặp tương ứng được kích hoạt (mục 6.5).

### 7.7 Trần khối lượng
Một lần import hoặc một lần quy tắc sinh vượt **200 task** thì hiển thị cảnh báo xác nhận trước khi tạo (để tránh nạp nhầm file).

---

## 8. GIAO DIỆN VÀ CÁC CHẾ ĐỘ XEM

### 8.1 Điều hướng

Thanh bên trái: **Việc của tôi** (mặc định) | **Tất cả task** | **Lịch** | **Gantt** | **Campaign** | **Content** | **Quay chụp** | **Request** | **SBU** | **Nền tảng (Foundation)** | **Báo cáo** | **Nhập liệu (Import)** | **Cài đặt**. Hiển thị theo quyền. Ô tìm kiếm toàn cục và nút "+ Task nhanh" luôn có. Giao diện phải dùng được trên điện thoại cho trang "Việc của tôi" và cập nhật trạng thái.

### 8.2 Dashboard "Việc của tôi" [MVP]

Trang đầu tiên sau đăng nhập:
- Thẻ tổng quan: **Trễ hạn** (đỏ), **Hôm nay**, **Ngày mai**, **Tuần này**, **Chưa có hạn**, **Đang bị chặn**.
- Danh sách "Cần làm hôm nay" gồm task trễ hạn và hạn hôm nay, đánh dấu xong ngay trên dòng.
- "Việc sắp tới" 7 ngày.
- Mục "Tôi đang phối hợp" và "Tôi đang theo dõi".
- Thanh chọn nhanh view: List | Kanban | Lịch | Gantt (chỉ task của mình).
- Nút "Thêm task nhanh" (gõ tiêu đề, `@` người, `#` campaign, ngày kiểu "mai", "t6", "25/10").

### 8.3 Các view task (dùng chung bộ lọc) [MVP trừ Gantt]

Bộ lọc dùng chung: người phụ trách, người phối hợp, campaign, brand, SBU, loại, trạng thái, mức ưu tiên, kênh, nhãn, khoảng ngày (hạn), trễ hạn, nguồn (thủ công/lặp/import/request...). Nhóm theo: người, campaign, SBU, trạng thái, hạn (hôm nay/tuần này/...), ưu tiên. **Lưu view cá nhân và view dùng chung** (`saved_views`).

| View | Yêu cầu |
|---|---|
| **List** | Bảng có cột chọn được, sắp xếp, nhóm, sửa nhanh tại dòng, chọn nhiều để sửa hàng loạt, thu gọn task con |
| **Kanban** | Cột theo trạng thái; có thể đổi sang cột theo người hoặc theo ưu tiên; kéo thả đổi trạng thái; swimlane theo campaign hoặc người; hiển thị hạn, avatar, nhãn trễ hạn |
| **Lịch** | Tháng/tuần/ngày; hiển thị task theo `due_date` (và khoảng `start_date`-`due_date`); [P2] hiển thị cả bài đăng content và lịch quay; kéo thả đổi ngày; tô màu theo campaign hoặc người; [P2] xuất ICS đăng ký vào Google Calendar |
| **Gantt** [P2] | Thanh theo `start_date`-`due_date`, nhóm theo campaign, mũi tên phụ thuộc, kéo để đổi ngày, mốc (milestone), đường "hôm nay", thu phóng theo tuần/tháng |
| **Workload** [P2] | Ma trận người x tuần: số task hoặc tổng giờ ước tính; tô màu quá tải (ngưỡng cấu hình) |

### 8.4 Trang chi tiết task

Ngăn kéo (drawer) bên phải, mở không rời trang. Gồm: tiêu đề, trạng thái, người phụ trách, người phối hợp, hạn, ưu tiên, campaign, brand, SBU, kênh, mô tả (markdown), checklist, task con, phụ thuộc, link bàn giao, bình luận (mention), tệp/link đính kèm, nguồn sinh (có link tới campaign, content, request, quy tắc lặp), và **lịch sử thay đổi**. Task sinh từ quy tắc lặp hiển thị biểu tượng lặp và nút "Sửa quy tắc".

---

## 9. CÁC TAB MASTER (HOẠCH ĐỊNH)

Các tab này là nơi **xem và quản lý kế hoạch**; công việc thực thi nằm ở task. Mỗi tab master phải có liên kết hai chiều với task (từ campaign mở danh sách task, từ task mở campaign).

### 9.1 Campaign master [MVP]
- Bảng danh sách xếp theo thời gian (tuyến tính theo `start_date`), lọc theo brand, loại, trạng thái, tháng. Mỗi dòng: mã, tên, loại, brand, thời gian, trạng thái, tiến độ (`% task done`), số task trễ.
- Chế độ xem **dòng thời gian theo tháng** (mỗi campaign một thanh) bên cạnh dạng bảng.
- Trang chi tiết campaign gồm: thông tin (insight/thông điệp, mục tiêu, hero activity, CTA, kênh, vai trò HO/trung tâm, ngân sách dạng chữ, KPI dạng chữ), tab **Action plan** (task nhóm theo `workstream`, có list/kanban/gantt riêng của campaign), tab Content, tab Quay chụp, tab Tài liệu, tab Lịch sử.
- Với campaign loại `brand_theme`: hiển thị 5 mốc điều phối (ngày 10, 15, 20, 25, 29 của tháng trước tháng chạy) tính tự động từ `start_date`, liên kết đến task tương ứng.

### 9.2 Foundation (nền tảng brand/sản phẩm) [P2]
- Lưới: **cột là brand, dòng là cấu phần** (A1 đến I2, theo sheet `1_Brand_Foundation` trong file Excel). Mỗi ô là văn bản có trạng thái (`confirmed` / `needs_confirmation` / `proposed`) và lịch sử phiên bản.
- Chỉ báo hoàn thiện theo brand: số ô còn `needs_confirmation`.
- Cho phép tạo task từ một ô ("Làm rõ ô C1 - VMT") để biến khoảng trống thành việc cụ thể.
- Đây là nội dung ít thay đổi, **không cần làm đẹp ở phase 1**. Chấp nhận nhập bằng import hoặc sửa trực tiếp trong ô.

### 9.3 SBU master [P2, riêng phần xem danh sách và task theo SBU là MVP]
- Ma trận **hạng mục (dòng) x 12 SBU (cột)** theo sheet `3_SBU_Marketing`: mỗi ô là trạng thái (`sbu_item_status`) của kỳ đang chọn, tô màu, bấm vào mở task liên quan.
- Hàng đầu hiển thị khu vực và HO phụ trách của từng SBU. Lọc theo nhóm (Online/Offline x Inbound/Outbound/Chung) và theo người phụ trách HO.
- Cột phụ: số SBU xong, % hoàn thành, số SBU vướng, link sang module chi tiết (ads hàng tháng, monitoring).
- Trang chi tiết **một SBU**: mọi task, request, campaign, trạng thái hạng mục của trung tâm đó.

### 9.4 Ads hàng tháng theo SBU [P3]
Theo dõi từng tháng, từng SBU: sản phẩm chạy, kênh, mục tiêu, ngân sách trung tâm đặt hàng, ngân sách hệ thống HO hỗ trợ, chi tiêu thực tế, lead thực tế, CPL (tính), mã order MISA, trạng thái, link báo cáo. **Quy tắc đã chốt:** "Ngân sách Trung tâm" chỉ tính phần trung tâm tự order; phần HO hỗ trợ thêm cho một trung tâm luôn ghi vào "Ngân sách Hệ thống (HO)", không cộng vào ngân sách của trung tâm đó. Hạn chế phase 1: dùng task có `type = ads` và trường link báo cáo, chưa làm bảng số liệu.

**Cập nhật theo dữ liệu thật (10/2026):** "Ngân sách Trung tâm" trong file Digital Tracker gồm *NS TT order (TT chịu)* + *NS P.MKT chạy thêm (tính vào chi phí TT)*; quy tắc "HO hỗ trợ ghi vào Hệ thống" ở trên không còn áp dụng cho báo cáo B2C. B2C Offline = NS Hệ thống + NS Trung tâm; **Lead/HVM là số tổng của cả hai mục** (không tách). Từ T7/2026 có thêm số Lead/HVM quy riêng cho ads ngân sách từng trung tâm (tập con của số tổng) để đo chất lượng. Số liệu tháng nhập riêng, không cộng từ tuần. Ecom báo cáo thêm theo sản phẩm (spend/MQL/HV/doanh thu). Tổng quan có xem theo tháng và theo quý, mọi bảng có dòng Tổng cộng.

### 9.5 Monitoring hạng mục thay mới định kỳ [P2]
POSM, bảng hiệu, OOH, Google Maps, quầy tư vấn VMP, phòng thi: mỗi dòng có hiện trạng, ngày cập nhật gần nhất, chu kỳ thay mới (tháng), ngày thay mới kế tiếp (tính), số ngày còn lại, cảnh báo (`Quá hạn` / `Sắp đến hạn trong 30 ngày` / `Còn hạn` / `Chưa có dữ liệu`), link ảnh. Cảnh báo `Quá hạn` hoặc `Sắp đến hạn` tự sinh task cho người phụ trách HO. Ở phase 1 thay bằng task lặp có checklist theo SBU (mục 6.5).

### 9.6 Content calendar [P2]
Bảng và lịch theo từng brand (tab theo brand), mỗi dòng là một `content_item`; cập nhật hàng tháng bởi người phụ trách. Trạng thái hiển thị đồng bộ với task con (mục 7.2). Cột theo 12 trường tối thiểu của Quy chuẩn Phối hợp Marketing HO - Trung tâm: ngày đăng, kênh, nhóm nội dung, chủ đề, đối tượng, thông điệp, định dạng, nguồn tài nguyên, người phụ trách, CTA, chỉ số mục tiêu, nhu cầu hỗ trợ.

### 9.7 Media production plan [P2]
Lịch các đợt quay chụp (mặc định 2 tuần/đợt), danh sách đợt và deliverable, trạng thái, người dựng, hạn.

### 9.8 Request [MVP]
Danh sách có bộ lọc (SBU, loại, trạng thái, trễ hạn), biểu mẫu tạo request (cho cả `center_contributor`), thống kê: tổng, theo trạng thái, theo loại, tỷ lệ trễ hạn, ngoài phạm vi HO, thời gian xử lý trung bình, nhóm theo SBU. **Mục đích kép:** vận hành request và thu thập dữ liệu để chủ sản phẩm chốt giải pháp phân tầng dịch vụ (hiện chưa chốt), nên các thống kê này quan trọng hơn vẻ ngoài.

---

## 10. NHẬP LIỆU BẰNG FILE TEMPLATE [MVP]

### 10.1 Nguyên lý

- Định dạng: `.xlsx` (ưu tiên) và `.csv` (UTF-8). [P2] nhập từ Google Sheets bằng liên kết.
- Hệ thống cung cấp **tải template** cho từng loại nhập. Template là một workbook có: sheet `HUONG_DAN` (hướng dẫn và ví dụ), sheet dữ liệu, sheet `DANH_MUC` (danh sách giá trị hợp lệ, có kiểm tra dữ liệu dạng danh sách thả xuống cho các cột enum; danh mục SBU, brand, người dùng cập nhật theo hệ thống lúc tải).
- Luồng 4 bước, **không ghi dữ liệu trước khi người dùng xác nhận**:
  1. **Tải lên** và chọn loại template.
  2. **Kiểm tra (validate)** từng dòng: bắt buộc, kiểu dữ liệu, giá trị enum, email người dùng tồn tại, mã brand/SBU/campaign tồn tại, ngày hợp lệ, hạn không nhỏ hơn ngày bắt đầu, khóa trùng trong file.
  3. **Xem trước (dry-run)**: bảng "sẽ tạo mới / sẽ cập nhật / sẽ bỏ qua / lỗi", hiển thị khác biệt của từng bản ghi sẽ cập nhật, danh sách xung đột (mục 10.3).
  4. **Xác nhận** để ghi. Có nút tải **file lỗi** (xlsx, thêm cột `loi` cạnh dòng gốc) để sửa và nạp lại.
- Mỗi lần nạp là một `import_batch` (người nạp, thời gian, tên file, tóm tắt kết quả). **Hoàn tác (undo) cả đợt** trong 72 giờ cho các bản ghi chưa bị người dùng sửa sau đó.
- Quy tắc chặn: dòng lỗi không làm hỏng cả file nếu người dùng chọn "chỉ nạp các dòng hợp lệ"; mặc định là dừng và báo lỗi nếu có dòng lỗi bắt buộc.

### 10.2 Khóa cập nhật (idempotency)

Mỗi dòng có cột khóa do người dùng đặt (ví dụ `action_code` hoặc `content_code`). Hệ thống upsert theo `(loại, khóa)`. Nếu cột khóa trống, hệ thống tự sinh khóa ổn định từ nội dung (băm của campaign + tiêu đề + hạn) và cảnh báo rằng nạp lại có thể tạo trùng nếu sửa tiêu đề. Nạp lại **đúng file cũ** phải cho kết quả "0 mới, 0 cập nhật".

### 10.3 Chính sách xung đột khi nạp lại

- Bản ghi chưa ai sửa tay: cập nhật theo file.
- Trường người dùng đã sửa tay (`manually_edited_fields`): **không ghi đè**, đưa vào danh sách xung đột để chọn "giữ bản trong hệ thống" hoặc "lấy bản trong file" từng dòng hoặc cả loạt.
- Task đã `done` hoặc `cancelled`: không đổi trạng thái; chỉ cập nhật nếu người dùng chọn rõ.
- Dòng có trong lần nạp trước nhưng vắng trong file mới: **không tự xóa**; liệt kê ở mục "Có thể đã bị loại" để người dùng tự quyết.

### 10.4 Các template (cột chi tiết ở Phụ lục B)

| Mã | Tên | Sheet dữ liệu | Phase |
|---|---|---|---|
| T1 | Plan campaign tháng | `CAMPAIGN` (1 hoặc nhiều dòng) + `ACTIONS` | MVP |
| T2 | Người dùng và SBU | `USERS`, `SBUS` | MVP |
| T3 | Task lẻ hàng loạt | `TASKS` | MVP |
| T4 | Quy tắc lặp | `RECURRING` | MVP |
| T5 | Request hàng loạt | `REQUESTS` | P2 |
| T6 | Content calendar | `CONTENT` | P2 |
| T7 | Media production plan | `SHOOTS` + `DELIVERABLES` | P2 |
| T8 | Foundation | `FOUNDATION` | P2 |
| T9 | Danh mục hạng mục SBU | `CATALOG` | P2 |

**T1 là template quan trọng nhất**: mỗi tháng một workbook gồm thông tin campaign (hoặc nhiều campaign) và toàn bộ action plan; sau khi nạp, mọi task xuất hiện ở tab Campaign và ở "Việc của tôi" của từng người.

### 10.5 Xuất dữ liệu
- Xuất mọi view task ra `.xlsx` và `.csv`. 
- [P2] **Xuất lịch tuần gửi BOD:** từ task theo `time_slot` của một tuần, xuất file Excel theo mẫu: mỗi nhân sự một khối, dòng là Thứ - ngày, cột Sáng và Chiều. Lý do: BOD yêu cầu các trưởng phòng gửi lịch làm việc hàng tuần của toàn bộ nhân sự. [CẦN XÁC NHẬN] phạm vi nhân sự đưa vào file sau khi TMĐT sáp nhập vào Trung tâm Kinh doanh TMĐT.

---

## 11. THÔNG BÁO VÀ NHẮC VIỆC [MVP]

### 11.1 Kênh

| Kênh | Phase |
|---|---|
| Trong ứng dụng (chuông, số chưa đọc, danh sách) | MVP |
| Email | MVP |
| Web push (PWA) | P2 |
| Zalo (qua Zalo OA hoặc ZNS, có chi phí) | P3, [CẦN XÁC NHẬN] có làm không |

### 11.2 Ma trận sự kiện

| Sự kiện | Người nhận | Kênh | Thời điểm |
|---|---|---|---|
| Được giao task | Người phụ trách, người phối hợp | App + email | Ngay |
| Task sắp đến hạn | Người phụ trách | App | Sáng ngày đến hạn 08:00 |
| **Task đến hạn hôm nay chưa xong** | Người phụ trách | Email (trong bản tóm tắt) + app | 16:30 cùng ngày [MẶC ĐỊNH] |
| **Task trễ hạn** | Người phụ trách | App + email | Sáng ngày kế tiếp 08:00, sau đó nằm trong bản tóm tắt hằng ngày |
| **Trễ hạn kéo dài** | Quản lý (admin/manager) | App + email | Khi trễ từ 2 ngày làm việc trở lên [MẶC ĐỊNH], nhắc lại mỗi tuần |
| Được @mention hoặc có bình luận ở task đang theo dõi | Người liên quan | App (+ email nếu bật) | Ngay |
| Đổi trạng thái, đổi hạn, đổi người | Người phụ trách, người theo dõi | App | Ngay |
| Task bị chặn (`blocked`) | Quản lý, người theo dõi | App + email | Ngay |
| Task phụ thuộc: tiền nhiệm xong | Người phụ trách task sau | App | Ngay |
| Request mới | Người định tuyến hoặc admin | App + email | Ngay |
| Request gần trễ hạn cam kết | Người tiếp nhận | App | 1 ngày trước |
| Import hoàn tất / có lỗi | Người nạp | App | Ngay |
| **Tóm tắt hằng ngày** | Mọi nhân sự | Email | 08:00 mỗi ngày làm việc: trễ hạn, hôm nay, ngày mai |
| **Tóm tắt hằng tuần** | Quản lý | Email | Sáng thứ Hai: tải, trễ hạn theo người, tiến độ campaign |

### 11.3 Quy tắc chống làm phiền
- **Mỗi task trễ hạn không có hơn 1 thông báo riêng mỗi ngày**; mọi thứ khác gộp vào bản tóm tắt. Nếu một người có hơn 5 sự kiện cùng loại trong một đợt (ví dụ vừa sinh 12 task định kỳ), gộp thành **một** thông báo.
- Tuân theo giờ yên lặng cấu hình (mặc định không gửi email ngoài 07:30-19:00 trừ tóm tắt đã lên lịch).
- Mỗi người chỉnh được kênh và loại thông báo của mình (`notification_prefs`), nhưng **nhắc trễ hạn của task mình phụ trách không tắt được**.
- Chống gửi trùng bằng khóa duy nhất `(task_id, loại_sự_kiện, ngày)`.

### 11.4 Thông báo tới người không đăng nhập
Email cho `center_contributor` chứa nút "Xác nhận đã xong" và "Báo vướng" dùng liên kết ký số một lần (mục 3.3), kèm mô tả việc, hạn, mã tham chiếu.

---

## 12. DASHBOARD VÀ BÁO CÁO

### 12.1 Nhân viên [MVP]: xem mục 8.2.

### 12.2 Quản lý (admin, manager, viewer) [P2]
- **Trễ hạn theo người** (số task, số ngày trễ trung bình).
- **Tải công việc theo người** theo tuần.
- **Tiến độ campaign:** % task xong, task trễ, mốc sắp tới.
- **Ma trận SBU:** % hoàn thành theo SBU và theo hạng mục.
- **Request:** tổng, mới, đang xử lý, trễ hạn, thời gian xử lý trung bình, phân theo SBU và loại.
- **Việc lặp:** tỷ lệ hoàn thành đúng hạn theo quy tắc.
- **Tỷ lệ đúng hạn** theo người và theo loại task (dùng để đo, không dùng để chấm điểm; đừng hiển thị bảng xếp hạng công khai).

### 12.3 Định nghĩa chỉ số
- Tỷ lệ đúng hạn = số task `done` có `completed_at <= hạn` / số task `done` trong kỳ.
- Task trễ hạn = định nghĩa ở mục 4.2.
- Tải công việc = tổng `estimate_hours` của task chưa `done` trong tuần; nếu không có ước tính thì đếm số task.

---

## 13. KỸ THUẬT

### 13.1 Khuyến nghị công nghệ [MẶC ĐỊNH, agent có thể đề xuất thay thế kèm lý do]

| Lớp | Chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript xuyên suốt | Một ngôn ngữ cho giao diện và máy chủ |
| Framework | Next.js (App Router) | Một ứng dụng cho UI và API |
| Cơ sở dữ liệu | **PostgreSQL** | Quan hệ phức tạp, RLS, giao dịch |
| Truy cập dữ liệu | Drizzle ORM hoặc Prisma | Kiểu an toàn, migration |
| Xác thực | Auth.js (Google OAuth, giới hạn miền) hoặc Supabase Auth | |
| Chạy lịch / hàng đợi | `pg-boss` (chạy trên Postgres) hoặc cron của hệ điều hành | Không thêm hạ tầng mới |
| Email | SMTP của Google Workspace hoặc dịch vụ như Resend | |
| UI | Tailwind CSS + shadcn/ui | |
| Kéo thả | `dnd-kit` | Kanban, sắp xếp |
| Lịch | FullCalendar (lõi) hoặc `react-big-calendar` | Kiểm tra giấy phép khi dùng tính năng trả phí |
| Gantt | Tự dựng bằng SVG hoặc dùng thư viện giấy phép MIT (ví dụ `frappe-gantt`) | Tránh thư viện thương mại |
| Lặp lại | `rrule` + lớp xử lý ngày làm việc và ngày lễ tự viết | |
| Excel | `exceljs` (tạo template có danh sách thả xuống, đọc file) | |
| Kiểm tra dữ liệu | `zod` | Dùng chung cho form, API và import |
| Ngày giờ | `date-fns` + `date-fns-tz` | |
| Kiểm thử | `vitest` (đơn vị), `playwright` (luồng chính) | |

**Ràng buộc kiến trúc:**
- **Không dùng `localStorage` hoặc kho dữ liệu trình duyệt làm nguồn dữ liệu chính.** Mọi dữ liệu nằm ở máy chủ, nhiều người dùng chung theo thời gian thực hoặc gần thực (làm mới 15-30 giây là chấp nhận được ở phase 1).
- Không hosting tĩnh thuần (không có backend). Cần một tiến trình chạy lịch hoạt động liên tục.
- Truy cập dữ liệu đặt sau một lớp repository để đổi nhà cung cấp Postgres mà không viết lại ứng dụng.
- Không dùng microservice, không dùng message broker ngoài. Quy mô không cần.

### 13.2 Triển khai và dữ liệu [CẦN XÁC NHẬN: chủ sản phẩm quyết định]

Có hai hướng, **thiết kế phải chạy được trên cả hai** (chỉ dùng Postgres chuẩn, không phụ thuộc tính năng độc quyền của một nhà cung cấp):
- **Tự lưu trữ (self-host)** bằng Docker Compose (app + Postgres + worker) trên máy chủ ảo tại Việt Nam. Phù hợp hướng self-hosting đã chọn cho các dự án dữ liệu của VMG.
- **Dịch vụ quản lý** (Supabase Cloud hoặc tương đương) kèm ứng dụng triển khai trên nền tảng serverless. Nhanh hơn, nhưng dữ liệu ở máy chủ nước ngoài.

Vì MKT OS chỉ lưu tên, email nhân sự và thông tin công việc, **không lưu dữ liệu cá nhân học viên** (mục 1.3), rủi ro pháp lý về chuyển dữ liệu ra nước ngoài thấp hơn các hệ thống CRM. Dù vậy chủ sản phẩm nên xin ý kiến bộ phận pháp chế trước khi chọn hướng dịch vụ nước ngoài. Có các tệp cấu hình mẫu, `.env.example`, và hướng dẫn chạy bằng một lệnh.

### 13.3 Yêu cầu phi chức năng
- **Hiệu năng:** trang danh sách 2.000 task mở dưới 2 giây, phân trang hoặc cuộn ảo.
- **Bảo mật:** phân quyền ở tầng dữ liệu; chống CSRF; mã hóa kết nối HTTPS; liên kết ký số một lần có hạn và chỉ dùng một lần; nhật ký kiểm toán cho thay đổi quyền và import.
- **Sao lưu:** sao lưu cơ sở dữ liệu hằng ngày, lưu 30 ngày, có hướng dẫn khôi phục đã kiểm thử.
- **Khả dụng:** không cần HA; cần giám sát tiến trình chạy lịch (nếu không chạy trong 26 giờ thì cảnh báo admin qua email).
- **Truy cập:** hoạt động tốt trên Chrome, Edge, Safari và trình duyệt di động; bố cục responsive.
- **Quốc tế hóa:** toàn bộ chuỗi giao diện tách ra tệp ngôn ngữ (mặc định `vi-VN`).
- **Nhật ký:** ghi log có cấu trúc, không ghi dữ liệu nhạy cảm.

### 13.4 Cài đặt hệ thống (admin)
Quản lý người dùng và vai trò; SBU (mã, tên, khu vực, người phụ trách HO); brand; ngày làm việc trong tuần; bảng ngày lễ (`holidays`, nhập sẵn lễ Việt Nam năm 2026 và 2027, cần kiểm tra lại bằng dữ liệu chính thức); giờ gửi tóm tắt và giờ yên lặng; ngưỡng nhắc trễ kéo dài; quy trình content (`content_workflow_template`); định tuyến request (`request_routing`); ngưỡng quá tải workload.

---

## 14. PHÂN PHA VÀ TIÊU CHÍ NGHIỆM THU

### 14.1 Phase 0 - Nền tảng (ước tính 1 tuần)
Khung ứng dụng, cơ sở dữ liệu, migration, đăng nhập, phân quyền, seed dữ liệu (mục 15), CI, triển khai thử.

### 14.2 Phase 1 - MVP "Không bao giờ quên việc" (ước tính 3 đến 4 tuần)

Phạm vi: Task (CRUD, giao việc, trạng thái, ưu tiên, task con, checklist, bình luận, mention, đính kèm link, lịch sử) | Dashboard "Việc của tôi" | View List, Kanban, Lịch | Recurring đầy đủ kể cả fan-out | Thông báo trong app và email, tóm tắt hằng ngày | Campaign master (xem, sửa) | Request | Import T1, T2, T3, T4 | Seed quy tắc lặp điều phối 6 mốc.

**Tiêu chí nghiệm thu (viết dạng kiểm thử được):**

1. *Import lại không trùng.* Cho file T1 có 1 campaign và 20 action. Khi nạp lần 1, tạo 1 campaign và 20 task. Khi nạp lần 2 đúng file đó, báo "0 mới, 0 cập nhật" và không có task trùng.
2. *Không ghi đè sửa tay.* Sau khi nạp, người dùng đổi hạn của task A. Khi nạp lại file có hạn khác cho task A, hiển thị xung đột, hạn trong hệ thống giữ nguyên cho đến khi người dùng chọn.
3. *Lặp cuối tháng.* Quy tắc "ngày làm việc cuối cùng của tháng" cho tháng 10/2026 sinh task hạn 30/10/2026 (thứ Sáu) [kiểm tra theo lịch thực]; cho tháng 2/2027 xử lý đúng ngày cuối và ngày nghỉ.
4. *Chống trùng lặp.* Chạy tiến trình lịch 3 lần liên tiếp không sinh thêm task so với lần 1.
5. *Fan-out.* Quy tắc "Kiểm tra POSM" `checklist_per_owner` sinh đúng 2 task (Khiết: 5 mục; Đạt: 7 mục) cho dữ liệu seed; tick hết checklist thì task `done`.
6. *Quá hạn.* Task `todo` có hạn hôm qua xuất hiện ở "Trễ hạn" trên dashboard và trong email 08:00 hôm nay; sau 2 ngày làm việc quản lý nhận thông báo. Tắt thông báo trễ hạn trong cài đặt cá nhân không có tác dụng.
7. *Quyền.* `member` mở API sửa task của người khác bị từ chối (kiểm tra bằng gọi API trực tiếp, không chỉ ẩn nút). `center_contributor` của VTS không thấy task của TPU.
8. *Magic link.* Bấm liên kết trong email đánh dấu đúng một task `done` mà không cần đăng nhập; dùng lại lần 2 bị từ chối; hết hạn sau 7 ngày.
9. *Hiệu năng.* 2.000 task, trang danh sách tải dưới 2 giây.
10. *Múi giờ.* Task hạn 31/10 lúc 23:00 giờ Việt Nam không bị hiển thị hoặc tính thành ngày 1/11.

### 14.3 Phase 2 - Vận hành đầy đủ (ước tính 4 đến 5 tuần)
Gantt | Workload | Dashboard quản lý | Content calendar và Media plan kèm sinh task tự động | SBU master có trạng thái suy ra từ task | Monitoring | Foundation | Import T5-T9 | Lịch xuất ICS | Xuất lịch tuần gửi BOD | Nhân bản campaign | Web push | Bộ lọc lưu và view dùng chung.

### 14.4 Phase 3 - Mở rộng (làm sau, đánh giá lại)
Ads hàng tháng có bảng số liệu | Đồng bộ Google Calendar hai chiều | Nhắc qua Zalo | Tải tệp đính kèm lên kho lưu trữ | Trợ lý AI (gợi ý tách một tài liệu kế hoạch thành danh sách action plan để nạp, luôn có bước người duyệt) | Báo cáo xuất định kỳ.

---

## 15. DỮ LIỆU SEED BAN ĐẦU

Lấy từ file `VMG_Marketing_Strategy_Operations_2026.xlsx` (đi kèm):

- **12 SBU** (sheet `3_SBU_Marketing`): `VTS`, `PVT`, `NKN`, `TBM` (KV1, HO phụ trách: Khiết); `LDN`, `TPU`, `PTA`, `NTI`, `HVG`, `BPH` (KV2/KV3, HO phụ trách: Đạt); `TMDT` (Trung tâm Kinh doanh TMĐT, Online, HO phụ trách: Khiết); `VMP_VMT` (nhóm nội bộ, HO phụ trách: Đạt). [CẦN XÁC NHẬN] danh sách trung tâm thuộc KV2 và KV3.
- **7 brand:** VMG, VMG IELTS, VMG TESOL, VMG Tiếng Trung, VMP by VMG, VMT, UpLearn by VMG.
- **Người dùng ban đầu:** Trưởng phòng Marketing (`admin`), Khiết và Đạt (`member`), Trân - thiết kế (`member`). Người khác (CRM, nhân sự TMĐT sau sáp nhập, GĐKV, BOD) thêm qua template T2. [CẦN XÁC NHẬN] danh sách và email.
- **Campaign:** 17 chủ đề Brand Campaign 08/2026 đến 12/2027 và 11 campaign khác (sheet `2_Campaign_Master`). Giữ nguyên `status` đã ghi (nhiều dòng là `needs_confirmation`).
- **Danh mục hạng mục SBU:** 46 hạng mục (sheet `3_SBU_Marketing`).
- **Quy tắc lặp điều phối 6 mốc** (Phụ lục C).
- **Ngày lễ Việt Nam 2026-2027.**
- **Không** seed trạng thái "xong" hoặc "đang làm" cho bất kỳ SBU nào; mặc định `not_started`.
- Các dòng ví dụ trong file Excel (nền vàng nhạt) là dữ liệu minh họa, **không seed**.

---

## 16. RỦI RO VÀ QUYẾT ĐỊNH CẦN CHỐT

### 16.1 Rủi ro chính và cách xử lý trong thiết kế

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Ngập task** do sinh tự động (12 SBU x nhiều hạng mục x hàng tháng) khiến nhân sự bỏ không dùng | Cao | Fan-out dạng checklist (mục 6.5); gộp thông báo (11.3); trần 200 task mỗi lần (7.7); bắt đầu chỉ với khoảng 15 hạng mục ưu tiên cao trong số 46 |
| **Trung tâm không chịu dùng**, vì đã quá tải và có xu hướng không nhận thêm việc từ Marketing | Cao | Trung tâm chỉ nhận ít việc, xác nhận bằng một cú bấm trong email, không bắt học app; đo đếm thực tế rồi mới mở rộng |
| **Nhiều hệ thống song song** (Excel, Zalo, MISA, CommerceOS) và không rõ đâu là nguồn thật | Cao | Quy định: MISA là nơi phê duyệt chính thức, MKT OS là nơi theo dõi thực thi và lưu link MISA; sau khi chạy ổn thì ngừng cập nhật sheet 2, 3, 4 bằng tay |
| **Nút cổ chai thiết kế** (một designer nhận việc từ nhiều nguồn) | Trung bình | Workload view, ước tính giờ, hạn cam kết ở request |
| Nhập sai file template làm hỏng dữ liệu | Trung bình | Dry-run, undo 72 giờ, trần số lượng |
| Chất lượng dữ liệu import kém (người điền thiếu) | Trung bình | Template có danh sách thả xuống và hướng dẫn; ô bắt buộc rõ ràng |
| Phạm vi phình ra (Foundation, ads, AI...) | Trung bình | Ranh giới phase nghiêm ngặt; Foundation chỉ là lưới văn bản |
| Thay đổi tổ chức (sáp nhập TMĐT, nhân sự ra vào) | Trung bình | Người dùng, SBU, người phụ trách là dữ liệu cấu hình, không viết cứng trong mã |
| Thông báo quá nhiều gây mệt | Trung bình | Mục 11.3 |

### 16.2 Quyết định chủ sản phẩm cần chốt (kèm giá trị mặc định agent dùng nếu chưa có phản hồi)

| # | Câu hỏi | Mặc định |
|---|---|---|
| 1 | Hướng triển khai: tự lưu trữ tại Việt Nam hay dịch vụ quản lý nước ngoài? | Chạy được cả hai, chưa cố định |
| 2 | Công ty có dùng Google Workspace để đăng nhập không? | Có, miền `vmg.edu.vn` |
| 3 | Tuần làm việc của phòng: thứ 2-6 hay có thứ 7? | Thứ 2 đến thứ 6 |
| 4 | SLA xử lý từng loại request? | Chưa có; người tiếp nhận tự nhập hạn cam kết |
| 5 | Ai thiết kế, ai duyệt trong quy trình content? | Trân thiết kế, Trưởng phòng duyệt |
| 6 | Trung tâm thuộc KV2 và KV3? | Gộp "KV2/KV3" |
| 7 | Phạm vi người dùng sau sáp nhập TMĐT (Trung tâm Kinh doanh TMĐT có dùng MKT OS không)? | Chỉ là một SBU trong danh sách, chưa có người dùng riêng |
| 8 | Nhắc qua Zalo có làm không? | Không, để phase 3 |
| 9 | Ngày giờ họp thống nhất Brand Theme hàng tháng? | Bỏ trống, task không có hạn cố định |
| 10 | Có cần nhân bản campaign ngay phase 1 không? | Không, phase 2 |

### 16.3 Hai điều phản biện cần chủ sản phẩm cân nhắc trước khi giao agent

1. **Tự xây hay dùng công cụ có sẵn.** ClickUp hoặc Asana có sẵn task, lặp, Kanban, Gantt, lịch, thông báo và import CSV. Việc tự xây chỉ đáng khi cần ba thứ công cụ có sẵn làm không tốt: (a) nạp plan campaign theo template riêng thành task kèm quan hệ campaign-brand-SBU, (b) quy tắc lặp "mỗi trung tâm một việc" gom theo người phụ trách, (c) ma trận SBU tự cập nhật từ task. Nếu ba điều này không thực sự cần, một bản cấu hình ClickUp có thể đạt 70% giá trị trong 1 tuần. Phần còn lại của spec chỉ nên làm nếu chấp nhận chi phí bảo trì một sản phẩm nội bộ (đặc biệt khi người xây chính cũng là người vận hành và quản lý phòng).
2. **Task chỉ hiệu quả nếu đầu vào đủ tốt.** Hệ thống nhắc việc rất tốt nhưng không tạo ra kỷ luật lập kế hoạch. Nếu file plan hàng tháng không có người điền đủ và đúng hạn, OS sẽ chỉ là nơi chứa các task thiếu thông tin. Nên coi việc ra plan đúng mốc ngày 10 (mốc 02) là một đầu việc quan trọng của chính hệ thống.

---

## PHỤ LỤC A - GỢI Ý LƯỢC ĐỒ CƠ SỞ DỮ LIỆU (RÚT GỌN, THAM KHẢO)

Agent được phép chỉnh tên cột và kiểu, miễn giữ đúng ý nghĩa và các ràng buộc duy nhất ghi chú.

```sql
create type task_status as enum ('todo','in_progress','in_review','blocked','done','cancelled');
create type task_priority as enum ('urgent','high','medium','low');
create type task_type as enum ('campaign_action','content','media','request','monitoring','ads','report','meeting','general');
create type task_source as enum ('manual','import','recurring','content_item','media_shoot','request','campaign_template');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin','manager','member','center_contributor','viewer')),
  team text not null default 'ho_marketing',
  sbu_id uuid references sbus(id),
  can_assign boolean not null default false,
  active boolean not null default true,
  notification_prefs jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                       -- T-000123
  title text not null,
  description text,
  type task_type not null default 'general',
  status task_status not null default 'todo',
  blocked_reason text,
  priority task_priority not null default 'medium',
  assignee_id uuid references users(id),
  creator_id uuid references users(id),
  start_date date,
  due_date date,
  due_time time,
  time_slot text check (time_slot in ('morning','afternoon','all_day')),
  estimate_hours numeric(6,2),
  completed_at timestamptz,
  parent_id uuid references tasks(id),
  campaign_id uuid references campaigns(id),
  brand_id uuid references brands(id),
  workstream text, channel text, deliverable_url text, reference_url text,
  is_milestone boolean not null default false,
  source_type task_source not null default 'manual',
  source_id uuid,
  recurring_rule_id uuid references recurring_rules(id),
  occurrence_date date,
  scope_key text,                                   -- sbu_id hoặc owner_id khi fan-out
  external_key text, import_scope text,
  import_batch_id uuid references import_batches(id),
  manually_edited_fields text[] not null default '{}',
  sort_order numeric not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Chống sinh trùng việc lặp:
create unique index tasks_recurring_uniq
  on tasks (recurring_rule_id, occurrence_date, coalesce(scope_key,''))
  where recurring_rule_id is not null and deleted_at is null;
-- Khóa upsert khi import:
create unique index tasks_import_uniq
  on tasks (import_scope, external_key)
  where external_key is not null and deleted_at is null;
create index tasks_assignee_due on tasks (assignee_id, due_date) where deleted_at is null;
create index tasks_campaign on tasks (campaign_id) where deleted_at is null;

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text,
  task_template jsonb not null,
  freq text not null check (freq in ('daily','weekly','monthly','yearly')),
  interval int not null default 1,
  by_weekday int[], by_month_day int, by_nth_weekday jsonb,
  day_rule text not null default 'calendar_day',
  holiday_policy text not null default 'none',
  due_offset_days int not null default 0,
  start_offset_days int not null default 3,
  due_time time,
  starts_on date not null, ends_on date, max_occurrences int,
  assignment_mode text not null default 'fixed_user',
  fixed_assignee_id uuid references users(id),
  round_robin_user_ids uuid[],
  scope_mode text not null default 'single',
  scope_sbu_ids uuid[],
  fan_out_mode text not null default 'checklist_per_owner',
  generation_horizon_days int not null default 45,
  completion_behavior text not null default 'fixed_schedule',
  skipped_dates date[] not null default '{}',
  active boolean not null default true, paused_until date,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  kind text not null,                               -- assigned, due_today, overdue, escalation, mention, digest...
  task_id uuid references tasks(id),
  title text not null, body text,
  channel text not null,                            -- in_app, email, push
  dedupe_key text,                                  -- (task_id, kind, ngày)
  read_at timestamptz, sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe on notifications (user_id, channel, dedupe_key) where dedupe_key is not null;
```

---

## PHỤ LỤC B - CỘT CỦA CÁC TEMPLATE IMPORT

Quy ước chung: ngày nhập `dd/mm/yyyy`; nhiều giá trị trong một ô ngăn cách bằng dấu chấm phẩy `;`; người dùng được nhận diện bằng **email**; brand và SBU bằng **mã**; cột có dấu `*` là bắt buộc.

### B1. Template T1 - Plan campaign tháng

**Sheet `CAMPAIGN`** (khóa: `campaign_code`)

| Cột | Ghi chú |
|---|---|
| `campaign_code`* | `BT-2026-11` |
| `name`* | |
| `type`* | `brand_theme` / `product_gtm` / `business_program` / `rebrand` / `data_program` / `internal_program` / `other` |
| `brand_codes` | `VMG;VMG_IELTS` |
| `start_date`*, `end_date`* | |
| `status` | |
| `owner_email` | |
| `tagline`, `occasion`, `target_audience`, `insight_message`, `objective`, `hero_activity`, `cta`, `channels`, `role_split`, `budget_note`, `kpi_note`, `notes` | văn bản tự do |

**Sheet `ACTIONS`** (khóa: `action_code`, duy nhất trong phạm vi `campaign_code`)

| Cột | Ghi chú |
|---|---|
| `campaign_code`* | phải có trong sheet `CAMPAIGN` hoặc trong hệ thống |
| `action_code`* | `A01` |
| `parent_action_code` | tạo task con |
| `workstream` | nhóm |
| `title`* | |
| `description` | |
| `type` | mặc định `campaign_action` |
| `assignee_email`* | |
| `collaborator_emails` | |
| `start_date`, `due_date`* | |
| `due_time`, `time_slot` | |
| `priority` | |
| `channel` | |
| `sbu_codes` | `VTS;PVT` hoặc `ALL` |
| `depends_on` | `A01;A02` (mã action) |
| `is_milestone` | `x` hoặc trống |
| `reference_url` | |
| `checklist` | các mục cách nhau `;` |
| `recurring_rule_code` | nếu muốn gắn với quy tắc lặp có sẵn |

### B2. Template T2 - Người dùng và SBU
`USERS`: `email`*, `full_name`*, `role`*, `team`, `sbu_code` (cho trung tâm), `can_assign`, `active`.
`SBUS`: `code`*, `name`*, `kind`*, `region`*, `ho_owner_email`, `active`.

### B3. Template T3 - Task lẻ hàng loạt
`task_key`*, `title`*, `description`, `type`, `assignee_email`*, `collaborator_emails`, `start_date`, `due_date`*, `time_slot`, `priority`, `campaign_code`, `brand_code`, `sbu_codes`, `channel`, `reference_url`, `checklist`.

### B4. Template T4 - Quy tắc lặp
`rule_code`*, `name`*, `title_template`* (có biến `{{month}}`...), `description_template`, `type`, `priority`, `freq`*, `interval`, `by_weekday` (`2;4`), `by_month_day` (số hoặc `-1`), `day_rule`, `holiday_policy`, `due_offset_days`, `start_offset_days`, `due_time`, `starts_on`*, `ends_on`, `assignment_mode`*, `assignee_email`, `scope_mode`, `scope_sbu_codes` (`ALL` hoặc danh sách), `fan_out_mode`, `checklist` (với `{{sbu_name}}` nếu `per_sbu`), `campaign_code`.

### B5. Template T6 - Content calendar
`content_key`*, `brand_code`*, `campaign_code`, `sbu_code`, `publish_date`*, `publish_time`, `channel`*, `content_pillar`, `topic`*, `target_audience`, `key_message`, `format`, `resource_source`, `owner_email`*, `cta`, `target_metric`, `support_needed`, `status`, `post_url`.

### B6. Template T7 - Media production plan
Sheet `SHOOTS`: `shoot_code`*, `shoot_date`*, `location`, `sbu_code`, `brand_code`, `purpose`, `crew`, `equipment`, `script_url`, `status`, `notes`. Sheet `DELIVERABLES`: `shoot_code`*, `deliverable_type`*, `quantity`, `channel`, `brand_code`, `campaign_code`, `editor_email`, `due_date`.

### B7. Template T5, T8, T9
Cột theo đúng trường của `requests`, `brand_foundation_entries` và `sbu_catalog_items` ở mục 4.2. Agent tạo template từ định nghĩa bảng, giữ cùng quy ước.

---

## PHỤ LỤC C - QUY TẮC LẶP SEED (NHỊP ĐIỀU PHỐI BRAND CAMPAIGN HÀNG THÁNG)

Giám đốc Khối R&D đã ban hành cơ chế điều phối Brand Campaign hàng tháng, lặp lại mỗi tháng với 6 mốc cố định. Tất cả task bên dưới dành cho **tháng kế tiếp** (campaign chạy ở tháng M+1 được chuẩn bị trong tháng M).

| Mã | Mốc | Ngày danh nghĩa trong tháng M | Việc | Người phụ trách | Chế độ |
|---|---|---|---|---|---|
| `CAD-01` | Mốc 01 | [CẦN XÁC NHẬN] | Họp thống nhất Brand Theme tháng M+1 với Ban Điều Hành (Marketing chủ trì) | Trưởng phòng | single |
| `CAD-02` | Mốc 02 | Ngày 10 | Gửi email Brand Campaign bản nháp tháng M+1 cho các GĐKV | Trưởng phòng | single |
| `CAD-03` | Mốc 03 | Ngày 15 | Theo dõi: GĐKV hoàn thiện Brief chương trình bán hàng, gửi Marketing và BOD | Trưởng phòng (theo dõi), GĐKV (thực hiện) | `task_per_sbu` theo 3 khu vực, mỗi GĐKV nhận việc qua email xác nhận |
| `CAD-04` | Mốc 04 | Ngày 20 | Ban hành Brand Kit chính thức cho các trung tâm | Trưởng phòng | single, có checklist (Key Visual, Brand Theme Card, template) |
| `CAD-05` | Mốc 05 | Ngày 25 | Theo dõi: trung tâm gửi Content Plan về Marketing | Nhân sự HO theo SBU | `checklist_per_owner` (Khiết 5 SBU, Đạt 7 SBU), mỗi SBU một mục "đã nhận" |
| `CAD-06a` | Sau mốc 05 | Ngày 25 + 3 ngày làm việc, không quá ngày 28 | Thẩm định Content Plan của từng trung tâm, phản hồi phê duyệt | Nhân sự HO theo SBU | `checklist_per_owner` |
| `CAD-06b` | Mốc 06 | Ngày 29 (nếu tháng ngắn thì ngày cuối tháng) | Phê duyệt và khởi động triển khai Content Plan đã duyệt | Trưởng phòng | single |
| `CAD-07` | (lặp) | Ngày làm việc cuối tháng | Báo cáo Marketing tháng | Trưởng phòng | single |
| `CAD-08` | (lặp) | Ngày làm việc đầu tháng | Rà soát Google Maps các trung tâm | Nhân sự HO theo SBU | `checklist_per_owner` |
| `CAD-09` | (lặp) | Ngày 28 | Kiểm tra hiện trạng POSM các trung tâm | Nhân sự HO theo SBU | `checklist_per_owner` |

Lưu ý: phê duyệt chính thức vẫn qua email theo cơ chế đã ban hành; Zalo chỉ để nhắc tiến độ. MKT OS ghi nhận và nhắc, **không thay thế** văn bản phê duyệt.

---

*Hết tài liệu. Khi có câu hỏi chưa rõ, agent ghi lại thành danh sách "Câu hỏi mở" gửi chủ sản phẩm, không tự suy đoán các mục có thẻ [CẦN XÁC NHẬN].*
