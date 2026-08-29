# VMG TMĐT OS

Hệ thống quản trị & thực thi vận hành Thương mại điện tử — Phòng Marketing, TMĐT & CRM (VMG).
Thay thế Google Sheet `VMG_Ads_Lead_Tracker.xlsx`.

> Nguồn sự thật nghiệp vụ: [`docs/SPEC.md`](docs/SPEC.md). Nguyên tắc kỹ thuật: [`CLAUDE.md`](CLAUDE.md).

## Trạng thái: Phase 0–4 hoàn tất

Toàn bộ lộ trình SPEC Mục 21 đã dựng + verify. 44 unit test. `git log`: 4 commit theo phase.

### Phase 0 — nền tảng
- **Schema đầy đủ** (Drizzle, `src/lib/db/schema/`) — 18 bảng theo SPEC Mục 7, CHECK
  constraint, generated column, chỉ mục, soft-delete.
- **Tầng công thức duy nhất** `src/lib/services/metrics.ts` (SPEC Mục 9) + unit test PGlite.
- **Xác thực & phân quyền** — Auth.js v5 Credentials, RBAC `src/lib/auth/permissions.ts`.
- **Data Grid dùng chung** `src/components/data-grid/` (SPEC Mục 16).
- **Quản lý người dùng**, đổi mật khẩu, audit log viewer.
- **Seed** danh mục + demo data. **Khung migration xlsx** (dry-run + đối chiếu).

### Phase 1 — vận hành cốt lõi (SPEC Mục 21)
- **Vòng đời lead** `src/lib/services/leads.ts` — máy trạng thái, `max_stage` chỉ tăng,
  mốc `mql_at/sql_at`, validation V01/V03/V04/V05/V07, khóa sổ kỳ (V13), stage history, audit.
- **Cỗ máy escalate** `src/lib/services/{escalate,interactions}.ts` — bảng nhịp SPEC Mục 8.2
  (T+0/T+1/T+3/T+7/T+30), `silence_count`, đẩy khỏi CN/ngày lễ, tự chuyển Cold Data ở nhịp 6.
- **Dò trùng** `src/lib/services/dedup.ts` — chấm điểm SPEC Mục 8.3 (red ≥60 / yellow 35-59), gộp lead.
- **Doanh thu** `src/lib/services/enrollments.ts` — enrollment đầu tiên tự chuyển lead WON
  (`won_at`, `credited_to` = QĐ05), V11.
- **Campaign** `src/lib/services/campaigns.ts` — `internal_code` tự sinh (SPEC 7.3.1), bật/tắt
  kèm lý do bắt buộc + `ended_on`.
- **Số liệu ads** `src/lib/services/daily-metrics.ts` — upsert theo (campaign, ngày) + audit,
  "sao chép hôm qua".
- **Màn hình:** `/lead` (Data Grid + 9 view dựng sẵn SPEC 11.4), `/lead/moi` (nhập nhanh +
  dò trùng inline), `/lead/[id]` (chăm sóc nhanh + doanh thu + lịch sử), `/hom-nay` (3 khối
  hàng đợi EC SPEC 11.1), `/campaign` (chỉ số 30 ngày + CPMQL tô màu), `/ads` (lưới nhập
  nhanh tự lưu SPEC 10.2).
- 31 unit test (metrics + lifecycle + escalate + dedup + enrollment).

### Phase 2 — nhìn thấy & điều hành (SPEC Mục 12/17/18)
- **Dashboard 3 tầng** [`/`](src/app/(app)/page.tsx): Tầng 1 "Cần hành động" (chỉ hiện khi
  có vấn đề, kèm nút), Tầng 2 "Sức khỏe" (thẻ chỉ số + biến động so kỳ trước/năm trước +
  phễu 2 kỳ), Tầng 3 "Bóc tách" (theo sản phẩm + đối chiếu % ngân sách phân bổ, theo nhân
  sự, xu hướng 12 tuần bằng Recharts, theo campaign top 20, **cohort** theo tháng tiếp nhận).
  Bộ lọc toàn cục (khoảng thời gian / so sánh / sản phẩm / kênh) ghi nhớ theo trình duyệt.
- **Cảnh báo campaign R1–R5** đưa lên Tầng 1 + đường ống thông báo.
- **Thông báo trong ứng dụng** `src/lib/services/notifications.ts` — bảng `notifications`,
  chuông + badge chưa đọc trên header, trang `/thong-bao`, dedupe theo ngày.
- **Tác vụ định kỳ** `src/lib/{cron,services/jobs}.ts` — 6 job SPEC Mục 17.2 (8h digest quá
  hạn, 8h+10h30 rà R1–R5, 00:30 Cold Data, T2 tổng kết tuần, ngày 1 nhắc khóa sổ). node-cron
  in-process, bật bằng `ENABLE_CRON=true`; ADMIN có nút "Chạy tác vụ ngay".
- **Khóa sổ kỳ** [`/khoa-so`](src/app/(app)/khoa-so/page.tsx) (ADMIN) — khóa/mở tháng, mở
  khóa bắt buộc lý do + audit LOCK/UNLOCK; `assertNotLocked` đã gắn vào sửa số liệu ads,
  doanh thu, lead WON.
- 35 unit test.

### Phase 3 — quản trị đội (SPEC Mục 13/14/15)
- **Module KPI** `src/lib/services/kpi.ts` + [`/kpi`](src/app/(app)/kpi/page.tsx): giao chỉ
  tiêu theo kỳ/quý (cá nhân/đội/sản phẩm), số thực tế **tự lấy từ dữ liệu vận hành** qua
  `computeKpiActual`, thẻ tiến độ có vạch 85/90/100 + vạch tiến độ thời gian + cảnh báo
  "nguy cơ trượt", điểm KPI tổng, ma trận toàn đội, cảnh báo tổng trọng số ≠ 100%. Bảng
  `other_costs` (KOL/KOC) để `REVENUE_AFTER_MKT` chạy tự động (QĐ07). Kỳ đã bắt đầu → không
  sửa chỉ tiêu (trừ ADMIN + lý do + audit).
- **Module Task** `src/lib/services/tasks.ts` + [`/cong-viec`](src/app/(app)/cong-viec/page.tsx):
  Kanban 3 cột (của tôi / toàn đội), việc `RECURRING` với luật lặp rút gọn + cron sinh task
  con mỗi sáng, BLOCKED bắt buộc lý do, thẻ tổng % hoàn thành / quá hạn / bị chặn.
- **Sale Enablement** `src/lib/services/sale-kit.ts` + [`/sale-kit`](src/app/(app)/sale-kit/page.tsx):
  bảng `sale_kit_items`, chỉ nội dung `APPROVED` & chưa `valid_until` hiển thị cho EC, tìm
  toàn văn, nút sao chép, MANAGER duyệt/xóa.
- Sửa hiển thị Select (Base UI): component `SimpleSelect` truyền `items` để trigger hiện
  nhãn thay vì giá trị thô, áp cho toàn bộ dropdown.
- 39 unit test.

### Phase 4 — mở rộng & hoàn thiện (SPEC Mục 21)
- **Email cảnh báo** `src/lib/email.ts` (nodemailer) — gửi khi cảnh báo CRITICAL;
  chưa cấu hình SMTP → ghi log, không lỗi.
- **Xuất XLSX** `src/lib/export-xlsx.ts` + `POST /api/export` (ghi audit `EXPORT` kèm số
  dòng) — nút XLSX trong Data Grid + nút "Xuất XLSX" ở `/bao-cao` (5 sheet).
- **`/bao-cao`** — báo cáo đầy đủ: theo sản phẩm (+ đối chiếu % ngân sách), theo nhân
  sự, theo campaign, cohort, xu hướng tuần; toggle tháng/quý.
- **Migration xlsx `--commit`** `scripts/migrate-xlsx.ts` — writer đầy đủ + báo cáo đối
  chiếu (`data/seed/migration-report.md`, SPEC 19.3). Đã test: 566 lead / 58 campaign /
  22 enrollment ghi thành công. `campaign-map.json` điền tay hoặc tự sinh template.
- **`/ban-giao`** — bàn giao học viên sang DotB EMS: danh sách WON + doanh thu, xuất
  CSV, nhập mã HV EMS (SPEC 2.3).
- **QĐ08 sẵn sàng** — cột `campaign_daily_metrics.source` (MANUAL/API) +
  `src/lib/services/meta-sync.ts` (stub, tôn trọng số nhập tay).
- **Chấm điểm lead tự động** `src/lib/services/lead-score.ts` — luật, cột "Điểm" +
  view "Ưu tiên" ở danh sách lead.
- **Dashboard VIEWER** — `/` khi role VIEWER: một màn hình, doanh thu/HVM lũy kế vs chỉ
  tiêu quý, ROAS tổng + theo SP, xu hướng 12 tuần, không dữ liệu cá nhân (SPEC 12.6).
- **Hạ tầng (infrastructure as code, SPEC 5.3):** `Dockerfile`, `docker-compose.yml`
  (app/db/caddy), `Caddyfile`, `scripts/backup.sh`, `RUNBOOK.md` đầy đủ.

### Việc thật cần bạn quyết (không phải code)
- **QĐ01/QĐ02** — ngưỡng CPMQL & giá niêm yết từ TCKT (hiện mặc định 600k).
- **QĐ09/QĐ11** — VPS production, người dự phòng, rà soát Pháp chế về dữ liệu người < 18.
- **Migration** — điền `campaign-map.json` (gộp 58 giá trị campaign trùng), chốt giả
  định "Không chốt" → `max_stage`, rồi `npm run xlsx:migrate -- --commit`.
- Xóa tài khoản demo `admin/admin` trong `scripts/seed.ts` trước golive.

## Chạy dev

```bash
cp .env.example .env.local     # rồi điền DATABASE_URL + AUTH_SECRET
npm install
npm run db:migrate             # áp schema
npm run db:seed                # danh mục + demo data
npm run dev                    # http://localhost:3000
```

Đăng nhập lần đầu: `truongphong@vmg.local` / `ChangeMe#2026` (buộc đổi mật khẩu).

### Database

`DATABASE_URL` trỏ tới PostgreSQL bất kỳ:
- **Dev**: Supabase (Project Settings → Database → Connection string). Dùng chuỗi
  *Session pooler* hoặc *Transaction pooler*; code đã đặt `prepare: false` cho pooler.
- **Production**: PostgreSQL self-host trên hạ tầng Việt Nam (SPEC Mục 5.3 — chủ quyền
  dữ liệu, có dữ liệu cá nhân người < 18 tuổi). Chỉ cần đổi `DATABASE_URL`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit test (PGlite in-memory) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Sinh migration từ schema |
| `npm run db:migrate` | Áp migration lên `DATABASE_URL` |
| `npm run db:seed` | Seed (`-- --no-demo` để bỏ dữ liệu demo) |
| `npm run xlsx:migrate` | Dry-run migration từ `data/seed/VMG_Ads_Lead_Tracker.xlsx` |
| `npm run xlsx:inspect "<sheet>" <rows>` | Xem nhanh nội dung sheet |

## Quyết định còn treo

Xem SPEC Mục 24. Trước Phase 1–2 cần chốt: QĐ01 (ngưỡng CPMQL T-U), QĐ02 (giá niêm yết
từ TCKT), QĐ05 (tính công lead chuyển tay — hiện code theo "người chốt" + lưu
`originally_assigned_to`), QĐ07 (bảng `other_costs` cho KOL/KOC — đã có bảng), QĐ09/QĐ11
(hạ tầng & pháp lý dữ liệu cá nhân).
