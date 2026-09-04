# VMG TMĐT OS - SPECIFICATION v1.0
### Hệ thống quản trị và thực thi vận hành Thương mại điện tử - Phòng Marketing, TMĐT & CRM

| | |
|---|---|
| **Mã tài liệu** | VMG-TMDT-OS-SPEC-v1.0 |
| **Ngày lập** | 28/08/2026 |
| **Chủ dự án** | Trưởng phòng Marketing, TMĐT & CRM |
| **Nguồn tham chiếu** | `VMG_Ads_Lead_Tracker.xlsx` (11 sheet, dữ liệu đến 26/08/2026) |
| **Trạng thái** | Draft để review nội bộ trước khi khởi tạo codebase |
| **Đối tượng đọc** | Người phát triển (Claude Code), Trưởng phòng, thành viên TMĐT |

---

## CÁCH DÙNG TÀI LIỆU NÀY

Tài liệu này là **nguồn sự thật duy nhất** cho toàn bộ dự án. Khi làm việc với Claude Code:

1. Đặt file này tại `/docs/SPEC.md` trong repo, commit ngay từ đầu.
2. Mỗi phiên làm việc, yêu cầu Claude Code đọc lại Mục 5 (Mô hình dữ liệu), Mục 6 (Quy tắc nghiệp vụ) và Mục 7 (Công thức chỉ số) trước khi viết code liên quan.
3. **Mục 24 (Quyết định còn treo) phải được chốt trước khi bắt đầu Phase tương ứng.** Không code trên giả định.
4. Mọi thay đổi nghiệp vụ phải cập nhật vào file này trước, code sau. Không để code là nơi duy nhất chứa logic nghiệp vụ.

**Nguyên tắc bất di bất dịch của dự án:** mọi công thức chỉ số chỉ được định nghĩa **một lần duy nhất** tại tầng service (Mục 7). Dashboard, KPI, cảnh báo, báo cáo đều gọi cùng một hàm. Đây chính là lỗi chết người của file sheet hiện tại (cùng một chỉ số CPMQL được tính bằng 3 công thức khác nhau ở 3 sheet, cho 3 kết quả khác nhau).

---

# PHẦN I - BỐI CẢNH VÀ MỤC TIÊU

## 1. Bối cảnh

### 1.1. Hiện trạng vận hành

Đội TMĐT hiện vận hành trên một Google Sheet duy nhất với phân công:

| Vai trò | Người | Nhiệm vụ trên sheet |
|---|---|---|
| Marketing Executive | Khiết | Cập nhật ngân sách ads, số message theo campaign, hằng ngày, trên `Campaign Monitor` và `Ads tracker` |
| E-Commerce Executive | Kiên, Ý | Nhập thông tin lead và quá trình tư vấn vào `Lead Sheet`, tick trạng thái |
| Trưởng phòng | Nghiêm | Đọc `Dashboard`, ra quyết định tắt/bật/tối ưu campaign |

Logic hiện tại: `Campaign Monitor` dùng `COUNTIFS` đếm ngược từ `Lead Sheet` theo tên campaign để tính CPL, CPMQL, CAC theo từng campaign.

### 1.2. Chẩn đoán các lỗi cấu trúc của file sheet hiện tại

Đây không phải liệt kê để chê file cũ. Đây là danh sách những thứ hệ thống mới **bắt buộc** phải giải quyết, vì nếu không, web mới sẽ chỉ là phiên bản đắt tiền hơn của cùng một vấn đề.

**(a) Khóa liên kết là chuỗi văn bản tự do.**
`Campaign Monitor!A4` chứa `"Kien_T6.01_FT_Message"`, và `Lead Sheet!J` phải khớp đúng từng ký tự. Trong dữ liệu thực tế có các giá trị như:
- `Khiết_FT_TMĐT_02.07\nID: 120247600089430044` (có ký tự xuống dòng bên trong)
- `Khiết - 12/08- TMDT.Q3.2026 - TIN NHAN - TESOL - Bản sao`
- `Khiết - 12/08 - TMDT.Q3.2026 - FT 1.5 - FT` và `Khiết - 12.08 - TMDT.Q3.2026 - page Tieng Trung`

Chỉ cần lệch một dấu cách hoặc một dấu chấm, `COUNTIFS` trả về 0 và campaign đó hiển thị CPMQL = "-" mà không ai biết là do sai khóa hay do thật sự không có MQL. **Đây là lỗi âm thầm, nguy hiểm nhất trong toàn bộ hệ thống hiện tại.**

**(b) Một trường trạng thái gánh hai khái niệm khác nhau.**
Cột `Trạng Thái` trộn lẫn *giai đoạn phễu* (New, KLH được, Đã tư vấn, MQL, SQL) với *kết quả cuối* (Chốt HV, Không chốt, Không nhu cầu). Hệ quả: khi một lead MQL chuyển sang "Không chốt", nó biến mất khỏi số đếm MQL. Để chữa, sheet phải viết `COUNTIF(MQL) + COUNTIF(SQL) + COUNTIF(Chot HV)` - nhưng công thức này vẫn **bỏ sót** lead đã từng là MQL rồi rơi về "Không chốt". Số MQL thực tế đang bị báo thiếu.

**(c) Hai nguồn số liệu lead cùng tồn tại, không ai biết dùng cái nào.**
Sheet có đồng thời `Lead + mess` (nhập tay), `MQL (file gốc)` (nhập tay), `Leads (auto LS)`, `MQL (auto LS)`. Trong `Dashboard`, CPL lấy từ nguồn nhập tay, CPMQL lấy từ nguồn auto. Hai mẫu số khác nhau nhưng đặt cạnh nhau như thể so sánh được.

**(d) Dải ô trong công thức không nhất quán.**
Trích từ `Dashboard`: `SUM('Campaign Monitor'!E4:E507)` ở dòng 26, nhưng `SUM('Campaign Monitor'!E4:E3562)/SUM('Campaign Monitor'!F4:F35)` ở dòng 31, và `SUM('Campaign Monitor'!E4:E35)` ở dòng 33. Ba con số "tổng spend" khác nhau trong cùng một dashboard. Tương tự tại Section 3B: `$B$4:$B$107`, `$B$4:$B$507`, `$B$4:$B$5007` xen kẽ nhau.

**(e) Kiểu dữ liệu ngày tháng hỗn tạp.**
Cột `Ngày LH lại` có 45 giá trị phân biệt, trong đó lẫn lộn kiểu `datetime` (`2026-08-04`) với kiểu chuỗi (`"30/07/2026"`, `" 30/06/2026"` có dấu cách đầu). Có ô ngày bị nhập nhầm vào cột `Lý do từ chối`. Có ô ngày với serial number vượt giới hạn (dòng 206-213). Không thể lọc "quá hạn" một cách đáng tin cậy trên nền dữ liệu này.

**(f) Danh mục tư vấn viên không chuẩn hóa.**
15 giá trị phân biệt cho ~5 con người thật: `Kien` (312), `Kiên` (4), `Hien` (54), `Hiền` (26), `Thy` (44), `Hiền/ Thy` (2), `Hiền / Thy` (1), `Hiền/ Kiên` (1), `Trung Tam` (16), `Trung tâm` (2), `Trung Tâm` (1), `Chưa` (1). Không thể đo hiệu suất cá nhân, không thể tính thưởng.

**(g) Sheet đã bắt đầu phân rã.**
Tồn tại song song `Dashboard` và `Bản sao của Dashboard`, `ADS TRACKER-` và `Ads tracker` (1226 vs 1225 dòng, công thức khác nhau). Không ai biết bản nào đúng.

**(h) Không có lịch sử.**
Không thể biết một lead đã được chăm sóc mấy lần, ai đổi trạng thái lúc nào, ngày hẹn cũ là ngày nào. Toàn bộ quy tắc escalate theo "số lần im lặng" mà anh mô tả **không thể thực thi được trên sheet**, vì sheet không lưu số lần.

**(i) Ràng buộc dữ liệu không tồn tại.**
Có 23 lead trạng thái `Chot HV` nhưng chỉ 22 dòng có doanh thu. Cột `Lý do từ chối` chỉ có 12/47 case Không chốt + Không nhu cầu được điền.

### 1.3. Điểm cần nói thẳng

Rủi ro lớn nhất của dự án này **không phải kỹ thuật**. Quy mô dữ liệu rất nhỏ: khoảng 570 lead, 38 campaign, 10 người dùng. Về mặt kỹ thuật đây là bài toán dễ.

Rủi ro thật là **sự chấp nhận của người dùng**. Kiên và Ý hiện nhập lead trên sheet với thao tác gõ tự do, không ràng buộc, cực nhanh. Web mới nếu chậm hơn, nhiều bước hơn, hoặc chặn họ vì thiếu trường bắt buộc, họ sẽ quay lại sheet trong hai tuần và dự án chết. Vì vậy spec này đặt ra các ràng buộc UX cứng ở Mục 9.6 mà không được thỏa hiệp.

Rủi ro thứ hai: hệ thống này sẽ **gắn với tiền thưởng** (cơ chế thưởng Q3/2026 tính 50.000đ/HVM lũy kế và % doanh thu gộp theo mức hoàn thành KPI). Ngay khi một con số trên web quyết định thu nhập của một người, con số đó trở thành đối tượng tranh chấp. Do đó audit log và khóa sổ kỳ (Mục 16) không phải tính năng "nice to have", mà là điều kiện để hệ thống được tin cậy.

---

## 2. Mục tiêu và phi mục tiêu

### 2.1. Ba mục tiêu chính (theo yêu cầu)

| # | Mục tiêu | Diễn giải thành yêu cầu kiểm chứng được |
|---|---|---|
| M1 | Dashboard rõ ràng, đầy đủ, theo thời gian | Trưởng phòng mở web, trong dưới 10 giây trả lời được: campaign nào đang lỗ, sản phẩm nào đang hiệu quả, tuần này so với tuần trước ra sao, có bao nhiêu lead đang bị bỏ rơi |
| M2 | Tài khoản riêng, quản trị task cá nhân và tổng thể | Mỗi nhân sự đăng nhập thấy đúng danh sách việc hôm nay của mình; Trưởng phòng thấy tiến độ của cả đội trên một màn hình |
| M3 | Giao và quản trị KPI trên web | KPI được gán bằng form, số thực tế tự động lấy từ dữ liệu vận hành, % hoàn thành cập nhật theo thời gian thực |

### 2.2. Mục tiêu ngầm nhưng quan trọng hơn

| # | Mục tiêu | Lý do |
|---|---|---|
| M4 | Loại bỏ hoàn toàn lỗi khóa liên kết văn bản tự do | Xem 1.2(a). Đây là lý do kỹ thuật cốt lõi để rời sheet |
| M5 | Ép kỷ luật chăm sóc lead qua trường "Ngày LH lại" | Quy trình escalate 5 bước không thể vận hành thủ công |
| M6 | Tạo bản ghi lịch sử không thể sửa lén | Nền tảng cho tính thưởng và cho báo cáo BOD |

### 2.3. Phi mục tiêu (KHÔNG làm trong phạm vi dự án này)

Ghi rõ để tránh phình phạm vi:

- **Không** thay thế DotB EMS. Web này quản lý giai đoạn *trước khi trở thành học viên*. Sau khi chốt, dữ liệu bàn giao sang EMS theo quy trình hiện hành.
- **Không** đồng bộ hai chiều tự động với DotB ở Phase 1-3. Chỉ export.
- **Không** kết nối Meta Marketing API để tự kéo spend ở Phase 1. Marketing Executive vẫn nhập tay. (Xem Mục 24-QĐ08 để cân nhắc Phase 4.)
- **Không** làm hệ thống chat/inbox. E-Commerce Executive vẫn trả lời khách trên Meta Business Suite và Zalo.
- **Không** đo impression, click, CTR, reach. Theo chỉ đạo: chỉ đo từ lead đến HV chốt.
- **Không** làm module kế toán, hóa đơn, hợp đồng điện tử. E-Contract là dự án riêng phối hợp Phòng Pháp chế.
- **Không** làm ứng dụng di động native. Web responsive là đủ.

### 2.4. Tiêu chí thành công (đo sau 60 ngày golive)

| Tiêu chí | Ngưỡng |
|---|---|
| Tỷ lệ lead được nhập qua web thay vì sheet | 100% |
| Tỷ lệ lead có trạng thái khác "Không nhu cầu" mà thiếu Ngày LH lại | Dưới 5% |
| Tỷ lệ lead quá hạn chăm sóc trên 3 ngày | Dưới 10% |
| Số lần Trưởng phòng phải hỏi lại số liệu vì nghi ngờ sai | 0 |
| Thời gian nhập một lead mới | Dưới 30 giây |
| Số campaign bị kill do vượt ngưỡng CPMQL mà không ai phát hiện trong 48h | 0 |

---

## 3. Người dùng và phân quyền

### 3.1. Vai trò

Theo quy tắc trình bày tài liệu tổ chức của phòng, hệ thống dùng **chức danh**, không dùng tên riêng, ở mọi nơi cấu hình vai trò.

| Mã vai trò | Chức danh | Số lượng dự kiến | Mô tả |
|---|---|---|---|
| `ADMIN` | Trưởng phòng Marketing, TMĐT & CRM | 1 | Toàn quyền, cấu hình hệ thống, khóa sổ kỳ |
| `MANAGER` | Phó phòng Marketing / người được ủy quyền | 0-1 | Như ADMIN trừ cấu hình hệ thống và xóa dữ liệu |
| `MARKETING` | Marketing Executive | 1-2 | Quản lý campaign, nhập số liệu ads hằng ngày |
| `EC` | E-Commerce Executive | 2-4 | Quản lý lead được phân công, tư vấn, chốt |
| `VIEWER` | Ban Giám đốc / Khối R&D | 2-5 | Chỉ xem dashboard và báo cáo, không xem chi tiết thông tin cá nhân khách hàng |

### 3.2. Ma trận phân quyền

Ký hiệu: C=Tạo, R=Xem, U=Sửa, D=Xóa, `-`=Không quyền, `own`=chỉ bản ghi của mình

| Đối tượng | ADMIN | MANAGER | MARKETING | EC | VIEWER |
|---|---|---|---|---|---|
| Lead - danh sách | CRUD | CRUD | R | CR + U(own) | - |
| Lead - thông tin liên hệ (SĐT, email) | R | R | - | R(own) | - |
| Lead - doanh thu | CRUD | CRUD | R | CR + U(own) | R (chỉ tổng) |
| Lead - phân công lại | U | U | - | - | - |
| Tương tác/nhật ký chăm sóc | R | R | R | CR(own) | - |
| Campaign | CRUD | CRUD | CRU | R | R |
| Số liệu ads hằng ngày | CRUD | CRUD | CRU | R | R |
| Task cá nhân | CRUD | CRUD | CRU(own) | CRU(own) | - |
| Task giao cho người khác | CRUD | CRUD | - | - | - |
| KPI - thiết lập, giao chỉ tiêu | CRUD | CRU | - | - | - |
| KPI - xem kết quả | R(all) | R(all) | R(own) | R(own) | R(tổng) |
| Sale Enablement | CRUD | CRUD | CRU | R | R |
| Audit log | R | R | - | - | - |
| Khóa/mở sổ kỳ | U | - | - | - | - |
| Quản lý người dùng | CRUD | - | - | - | - |

### 3.3. Ba quyết định phân quyền cần lưu ý

**(a) EC nhìn thấy lead của nhau hay không?**
Khuyến nghị: **có, ở chế độ chỉ đọc**. Đội chỉ 2-4 người, việc che giấu tạo ra chi phí quản lý lớn hơn lợi ích. Ngoài ra khi một EC nghỉ phép, người còn lại phải tiếp quản được ngay. Nhưng **chỉ EC được phân công mới sửa được**, tránh giẫm chân và tranh công.

**(b) VIEWER (BOD) có được xem SĐT khách không?**
Khuyến nghị: **không**. Không có nhu cầu nghiệp vụ, và giảm bề mặt rủi ro dữ liệu cá nhân. Dashboard cho VIEWER chỉ hiển thị số tổng hợp.

**(c) MARKETING có sửa được trạng thái lead không?**
Khuyến nghị: **không**. Nếu Marketing sửa được trạng thái, chỉ số CPMQL mà chính Marketing bị đánh giá sẽ do Marketing tự tạo ra. Đây là xung đột lợi ích cơ bản, phải chặn ở tầng quyền chứ không phải bằng lời hứa.

---

## 4. Từ điển thuật ngữ và định nghĩa nghiệp vụ

Phần này là ràng buộc pháp lý nội bộ của dự án. Mọi tranh cãi số liệu về sau đều quy chiếu về đây.

### 4.1. Định nghĩa phễu

| Thuật ngữ | Định nghĩa chính thức | Nguồn dữ liệu |
|---|---|---|
| **Lead** | Tất cả tin nhắn hoặc đăng ký form, **bất kể đã có số điện thoại hay chưa** | Số nhập tay theo campaign theo ngày, do Marketing Executive nhập từ Meta Business Suite |
| **MQL** | Khách trao đổi được và có quan tâm thật (xác nhận mục tiêu rõ ràng, hỏi giá, hỏi lịch khai giảng) | Bản ghi lead trên hệ thống, do E-Commerce Executive đánh dấu |
| **SQL** | Có nhu cầu và khả năng mua hàng cao (đã hỏi giá và không phản đối, hỏi hình thức thanh toán) | Bản ghi lead |
| **HV Chốt** | Khách đã đăng ký và thanh toán thành công | Bản ghi lead, bắt buộc kèm doanh thu > 0 |
| **Cold Data** | Lead đã qua đủ 5 nhịp chăm sóc mà vẫn im lặng | Hệ thống tự chuyển |

### 4.2. Điểm cực kỳ quan trọng về hai mẫu số

Theo nguyên tắc vận hành đã chốt: **chỉ nhập vào hệ thống những lead đã là MQL, hoặc lead chưa MQL nhưng có số điện thoại.** Nghĩa là một lượng lead thô (tin nhắn hỏi vu vơ rồi im, không để lại SĐT) sẽ **không bao giờ tồn tại dưới dạng bản ghi**.

Hệ quả bắt buộc phải tuân thủ:

```
Số Lead dùng để báo cáo  =  tổng cột messages nhập tay theo campaign/ngày
                            KHÔNG PHẢI đếm số bản ghi lead trên hệ thống

Số MQL, SQL, HV Chốt      =  đếm từ bản ghi lead trên hệ thống
                            KHÔNG PHẢI nhập tay
```

Hệ thống phải hiển thị **hai con số này ở hai chỗ khác nhau, có nhãn khác nhau**, và tuyệt đối không cho phép đặt cạnh nhau kiểu gợi ý rằng chúng cùng loại. Đây chính là chỗ file sheet hiện tại gây nhầm lẫn.

Hệ thống **phải** hiển thị cảnh báo khi `số bản ghi lead của campaign > số messages nhập tay của campaign đó`, vì đó là dấu hiệu Marketing quên nhập số hoặc EC gán sai campaign.

### 4.3. Quy tắc "giai đoạn cao nhất từng đạt"

Đây là thay đổi cấu trúc quan trọng nhất so với sheet.

Mỗi lead có hai thuộc tính độc lập:

- **`stage`** - giai đoạn hiện tại, có thứ tự: `NEW` (0) < `NO_CONTACT` (1) < `CONSULTING` (2) < `MQL` (3) < `SQL` (4) < `WON` (5)
- **`outcome`** - kết quả, không có thứ tự: `OPEN` | `WON` | `LOST` | `DISQUALIFIED`

Và một trường dẫn xuất do hệ thống tự tính, không cho sửa:

- **`max_stage`** - giai đoạn cao nhất từng đạt được, chỉ tăng, không bao giờ giảm

**Mọi số đếm phễu trong toàn hệ thống đều dùng `max_stage`, không dùng `stage`.**

Ví dụ: một lead lên MQL ngày 5/8, lên SQL ngày 10/8, rồi từ chối ngày 20/8 vì giá cao.
- `stage` = SQL, `outcome` = LOST, `max_stage` = SQL
- Lead này **vẫn được đếm** vào MQL của tháng 8 và SQL của tháng 8. Chi phí để tạo ra MQL này đã tiêu rồi, việc mất khách sau đó không xóa được sự thật là ads đã tạo ra một MQL.
- Đây là cách đúng để đo hiệu quả ads. Cách của sheet hiện tại đang báo thiếu MQL.

**Ngày ghi nhận giai đoạn:** hệ thống lưu `mql_at`, `sql_at`, `won_at` (timestamp lần đầu đạt giai đoạn đó). Báo cáo theo tháng dùng các mốc này, không dùng ngày tiếp nhận lead. Điều này cho phép trả lời chính xác câu "tháng 8 tạo ra bao nhiêu MQL".

### 4.4. Định nghĩa trạng thái chi tiết (chuyển thể từ sheet "Định nghĩa lead")

| Stage | Nhãn hiển thị | Ý nghĩa | Tín hiệu nhận biết | Việc cần làm ngay |
|---|---|---|---|---|
| `NEW` | Mới | Khách vừa nhắn, chưa ai phản hồi | Tin nhắn đầu tiên chưa có reply từ page | Phản hồi trong 15 phút. Chuyển sang Đang tư vấn ngay khi bắt đầu trò chuyện |
| `NO_CONTACT` | Không liên hệ được | Đã có hành động liên lạc nhưng chưa trao đổi được | Gọi không bắt máy, nhắn Zalo không phản hồi | Thử lại sau 4-6 tiếng hoặc sang hôm sau |
| `CONSULTING` | Đang tư vấn | Đang hoặc đã trao đổi trực tiếp | Cuộc trò chuyện đang diễn ra, khách hỏi về sản phẩm, giá, lịch học | Áp dụng HỎI - HIỂU - HƯỚNG. Không để cuộc trò chuyện kết thúc bằng câu trả lời đóng |
| `MQL` | MQL | Đủ điều kiện về nhu cầu: biết mục tiêu, đúng sản phẩm | Khách xác nhận mục tiêu rõ ràng, hỏi giá và lịch khai giảng cụ thể | Gửi thông tin khóa học, giá, lịch khai giảng gần nhất. Mời đặt lịch tư vấn sâu |
| `SQL` | SQL | Đủ điều kiện về tài chính và quyết định | Đã hỏi giá và không phản đối, hỏi hình thức thanh toán, trả góp | Chốt sale, mời làm test, học thử. Follow-up trong 24h |
| `WON` | Chốt HV | Đã đăng ký và thanh toán thành công | Có xác nhận đăng ký, khách xác nhận chuyển khoản | Ghi nhận doanh thu, chuyển thông tin sang vận hành xếp lớp, gửi tin nhắn chào mừng |

| Outcome | Nhãn hiển thị | Ý nghĩa | Xử lý |
|---|---|---|---|
| `OPEN` | Đang theo | Còn trong phễu | Bắt buộc có Ngày LH lại |
| `WON` | Đã chốt | Thắng | Bắt buộc có doanh thu và ngày chốt |
| `LOST` | Không chốt | Đã tư vấn đủ nhưng khách không đăng ký lúc này | Bắt buộc ghi lý do. Là warm audience, không xóa, đưa vào danh sách remarketing sau 30-45 ngày |
| `DISQUALIFIED` | Không nhu cầu / Spam | Sai đối tượng hoàn toàn, nhắn nhầm, đối thủ, spam | Đóng, không follow-up, **không bắt buộc Ngày LH lại** |

### 4.5. Danh mục sản phẩm (chuẩn hóa)

Lấy từ dữ liệu thực tế cột `SP (chuẩn)` và Kế hoạch T9. Danh mục này phải là bảng dữ liệu cấu hình được, không hard-code.

| Mã | Tên đầy đủ | Ghi chú |
|---|---|---|
| `TESOL` | TESOL E-PATH | Sản phẩm lõi. Phân loại Hybrid. Ưu tiên nguồn lực số 1, 50% ngân sách |
| `VSTEP` | VSTEP Mastery | 20% ngân sách theo Kế hoạch T9 |
| `TQ` | Tiếng Trung | 10% ngân sách |
| `FT15` | IELTS Fast Track 1.5 | **Dừng từ Q4/2026.** Hệ thống phải hỗ trợ đánh dấu sản phẩm `is_active = false` mà vẫn giữ dữ liệu lịch sử |
| `FLEXTRACK` | FlexTrack 1-1 / nhóm nhỏ | 10% ngân sách |
| `IE` | IELTS Express Online | |
| `GT` | Tiếng Anh Giao tiếp | |
| `EDU` | EduNext (B2B) | |
| `KHAC` | Khác | Bắt buộc kèm ghi chú |

### 4.6. Danh mục nguồn / kênh

| Mã | Tên | Ghi chú |
|---|---|---|
| `FB` | Facebook | Chiếm 90% lead hiện tại |
| `GOOGLE` | Google | |
| `TIKTOK` | TikTok | |
| `ZALO` | Zalo | |
| `HOTLINE` | Hotline | |
| `ORGANIC` | Organic / tự nhiên | Không thuộc campaign trả phí |
| `REFERRAL` | Giới thiệu | Có chính sách giảm 5% cho người giới thiệu |
| `KHAC` | Khác | |

**Quy tắc:** lead thuộc nguồn `ORGANIC`, `REFERRAL`, `HOTLINE` **không được** gán vào campaign trả phí. Nếu gán, chi phí CPMQL của campaign đó sẽ bị làm đẹp giả tạo. Hệ thống phải chặn ở tầng validate.

---

## 5. Kiến trúc kỹ thuật

### 5.1. Ngăn xếp công nghệ đề xuất

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Một codebase cho cả UI và API. Phù hợp làm việc với Claude Code |
| CSDL | PostgreSQL 16 | Cần quan hệ, ràng buộc toàn vẹn, transaction. Đây là lý do chính rời khỏi sheet |
| ORM | Drizzle ORM | Migration rõ ràng, SQL sinh ra dễ đọc, dễ kiểm tra khi debug số liệu |
| Xác thực | Auth.js (NextAuth) - Credentials provider | Đội nhỏ, nội bộ. Không cần OAuth ngoài. Có thể bổ sung Google Workspace sau |
| UI | Tailwind CSS + shadcn/ui | Nhanh, nhất quán, dễ áp bộ nhận diện VMG |
| Bảng dữ liệu | TanStack Table v8 | Nền tảng cho yêu cầu filter/group by kiểu Airtable (Mục 14) |
| Biểu đồ | Recharts | Đủ dùng cho dashboard, không cần thư viện nặng |
| Tác vụ định kỳ | node-cron trong tiến trình, hoặc cron hệ điều hành | Cần cho cảnh báo 8h sáng |
| Triển khai | Docker Compose trên VPS đặt tại Việt Nam | Chủ quyền dữ liệu. Xem 5.3 |

### 5.2. Nguyên tắc kiến trúc

1. **Tầng service là nơi duy nhất chứa logic nghiệp vụ.** Không viết logic tính CPMQL trong component React. Không viết trong query SQL rải rác. Tất cả nằm trong `/lib/services/metrics.ts` và được test riêng.
2. **Không tính chỉ số ở client.** Client chỉ nhận số đã tính xong. Tránh lặp lại thảm họa "mỗi sheet một công thức".
3. **Mọi mốc thời gian lưu ở UTC, hiển thị ở `Asia/Ho_Chi_Minh`.** Ranh giới "ngày" trong mọi báo cáo và cảnh báo là 00:00 giờ Việt Nam.
4. **Soft delete mặc định.** Không xóa cứng bản ghi lead, campaign, doanh thu. Chỉ đánh dấu `deleted_at`.
5. **Tất cả bảng dữ liệu nghiệp vụ đều có `created_at`, `updated_at`, `created_by`, `updated_by`.**

### 5.3. Ghi chú về hạ tầng và chủ quyền dữ liệu

Hệ thống chứa dữ liệu cá nhân của khách hàng (họ tên, số điện thoại, email) trong đó có trẻ vị thành niên. Định hướng self-hosting trên hạ tầng Việt Nam đã được xác lập ở cấp phòng và spec này tuân theo.

Khuyến nghị cụ thể:
- VPS tại Việt Nam, cấu hình tối thiểu 2 vCPU / 4GB RAM / 60GB SSD. Với ~570 lead và 10 người dùng, đây là quá đủ trong nhiều năm.
- Docker Compose gồm 3 service: `app` (Next.js), `db` (PostgreSQL), `caddy` (reverse proxy, tự động HTTPS).
- Backup: `pg_dump` tự động hằng ngày, giữ 30 bản, đồng bộ ra một nơi lưu trữ thứ hai khác nhà cung cấp.
- **Phải kiểm thử khôi phục backup ít nhất một lần trước khi golive.** Backup chưa từng được khôi phục thử thì không phải backup.

**Phản biện cần cân nhắc:** self-hosting đồng nghĩa với việc phòng phải tự chịu trách nhiệm vá bảo mật, giám sát uptime, và khôi phục sự cố - trong khi phòng hiện chỉ có một nhân sự kỹ thuật CRM duy nhất. Nếu người đó nghỉ, không ai vận hành được. Đề xuất giảm thiểu: viết `RUNBOOK.md` với quy trình khôi phục từng bước, và đặt toàn bộ cấu hình hạ tầng dưới dạng file trong repo (infrastructure as code), để bất kỳ ai đọc được cũng dựng lại được.

---

# PHẦN II - MÔ HÌNH DỮ LIỆU

## 6. Sơ đồ quan hệ tổng thể

```
users ──┬──< leads (assigned_to)
        ├──< lead_interactions (created_by)
        ├──< tasks (assignee_id)
        ├──< kpi_assignments (user_id)
        └──< audit_logs (actor_id)

products ──┬──< campaigns
           ├──< leads
           └──< kpi_assignments (scope)

campaigns ──┬──< campaign_daily_metrics   [số liệu nhập tay: spend, messages]
            └──< leads                     [khóa ngoại thật, không phải chuỗi]

leads ──┬──< lead_interactions             [nhật ký chăm sóc]
        ├──< lead_stage_history            [lịch sử chuyển giai đoạn]
        └──< enrollments                   [doanh thu, có thể nhiều dòng/lead]

periods ──< period_locks                   [khóa sổ kỳ]
```

## 7. Định nghĩa bảng chi tiết

### 7.1. `users`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `email` | text | UNIQUE, NOT NULL | Dùng để đăng nhập |
| `password_hash` | text | NOT NULL | bcrypt |
| `full_name` | text | NOT NULL | |
| `job_title` | text | NOT NULL | Chức danh, dùng trong tài liệu và báo cáo |
| `role` | enum | NOT NULL | `ADMIN` \| `MANAGER` \| `MARKETING` \| `EC` \| `VIEWER` |
| `is_active` | boolean | default true | Nghỉ việc thì tắt, không xóa |
| `alias_names` | text[] | | Các biến thể tên cũ trên sheet, phục vụ migration: ví dụ `['Kien','Kiên']` |
| `created_at` `updated_at` | timestamptz | | |

### 7.2. `products`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `code` | text | UNIQUE | `TESOL`, `FT15`, ... |
| `name` | text | NOT NULL | Tên đầy đủ hiển thị |
| `list_price` | bigint | | Giá niêm yết, VND. Dùng để tính room CAC |
| `cac_room_pct` | numeric(5,2) | default 15.00 | % giá niêm yết được phép chi cho CAC |
| `target_cpmql` | bigint | | Ngưỡng cảnh báo CPMQL riêng cho sản phẩm này |
| `kill_threshold_no_mql` | bigint | | Mức spend tích lũy mà chưa ra MQL nào thì kill |
| `budget_share_pct` | numeric(5,2) | | Tỷ trọng ngân sách phân bổ |
| `priority` | int | | 1 = cao nhất |
| `is_active` | boolean | default true | FT15 sẽ chuyển false từ Q4/2026 |
| `sort_order` | int | | |

### 7.3. `campaigns`

Đây là bảng thay thế cho khóa văn bản tự do. Mỗi campaign là một thực thể có ID.

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `internal_code` | text | UNIQUE, NOT NULL | Sinh tự động theo quy ước, xem 7.3.1 |
| `display_name` | text | NOT NULL | Tên hiển thị do người dùng đặt |
| `external_id` | text | | ID campaign trên Meta / Google, ví dụ `120247600089430044` |
| `product_id` | uuid | FK products, NOT NULL | |
| `channel` | enum | NOT NULL | `FB` \| `GOOGLE` \| `TIKTOK` \| `KHAC` |
| `objective` | enum | | `MESSAGE` \| `LEADFORM` \| `TRAFFIC` \| `KHAC` |
| `owner_id` | uuid | FK users, NOT NULL | Người chịu trách nhiệm campaign |
| `status` | enum | NOT NULL, default `ON` | `ON` \| `OFF` \| `PAUSED` |
| `daily_budget` | bigint | | Ngân sách ngày, VND |
| `started_on` | date | NOT NULL | |
| `ended_on` | date | NULL | NULL nghĩa là chưa kết thúc. Campaign chạy ngân sách ngày, không có ngày kết thúc định trước |
| `notes` | text | | |
| `deleted_at` | timestamptz | | |

**Ràng buộc:** khi `status` chuyển `OFF`, hệ thống ghi `ended_on = ngày hiện tại` và ghi audit log kèm lý do bắt buộc.

#### 7.3.1. Quy ước mã campaign nội bộ

Sinh tự động, không cho sửa tay:

```
{PRODUCT}-{CHANNEL}-{OBJECTIVE}-{YYMM}-{SEQ}
Ví dụ:  TESOL-FB-MSG-2609-01
        FT15-FB-LEADFORM-2608-03
```

Người dùng vẫn đặt `display_name` tự do để dễ nhận diện, nhưng mọi liên kết dữ liệu dùng `id`. Trường `external_id` để đối chiếu ngược với Meta Ads Manager khi cần.

**Tại sao quan trọng:** hiện tại lead được gán campaign bằng cách gõ/chọn chuỗi văn bản. Sau khi đổi sang khóa ngoại, việc "campaign hiển thị 0 MQL vì gõ sai tên" trở thành bất khả thi về mặt kỹ thuật.

### 7.4. `campaign_daily_metrics`

Bảng này chứa **duy nhất** số liệu do Marketing Executive nhập tay.

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `campaign_id` | uuid | FK campaigns, NOT NULL | |
| `metric_date` | date | NOT NULL | |
| `spend` | bigint | NOT NULL, >= 0 | Chi tiêu thực, VND |
| `messages` | int | NOT NULL, >= 0 | Số tin nhắn + đăng ký form. **Đây là con số Lead chính thức để báo cáo** |
| `entered_by` | uuid | FK users | |
| `entered_at` | timestamptz | | |
| `note` | text | | |

**UNIQUE(campaign_id, metric_date)** - một campaign một ngày chỉ có một dòng. Sửa thì cập nhật dòng cũ và ghi audit.

**Không** có cột MQL, SQL, HV chốt ở bảng này. Các số đó luôn được tính từ bảng `leads`. Đây là điểm sửa lỗi so với sheet (nơi có cả `MQL (file gốc)` nhập tay lẫn `MQL (auto LS)`).

### 7.5. `leads`

Bảng trung tâm của hệ thống.

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `code` | text | UNIQUE | Mã lead dạng `L-2608-0421`, sinh tự động, dùng khi trao đổi nội bộ |
| `received_at` | timestamptz | NOT NULL | Ngày tiếp nhận |
| `full_name` | text | NOT NULL | |
| `name_normalized` | text | index | Tên đã chuẩn hóa để dò trùng, xem 8.3 |
| `phone` | text | index | Chuẩn hóa về dạng `0xxxxxxxxx`. Có thể NULL |
| `phone_normalized` | text | index | Bỏ khoảng trắng, dấu chấm, đổi `+84` thành `0` |
| `email` | text | | |
| `fb_profile` | text | | Link hoặc tên page/profile Facebook |
| `product_id` | uuid | FK products, NOT NULL | Sản phẩm chuẩn hóa |
| `product_raw` | text | | Sản phẩm khách nói, dạng thô |
| `source` | enum | NOT NULL | Xem 4.6 |
| `campaign_id` | uuid | FK campaigns, NULL | NULL nếu nguồn organic/referral/hotline |
| `stage` | enum | NOT NULL, default `NEW` | Giai đoạn hiện tại |
| `max_stage` | enum | NOT NULL, default `NEW` | Do hệ thống tính, không cho sửa tay |
| `outcome` | enum | NOT NULL, default `OPEN` | |
| `assigned_to` | uuid | FK users, NULL | E-Commerce Executive phụ trách |
| `next_contact_date` | date | NULL | **Ngày LH lại** - trường điều phối trung tâm |
| `silence_count` | int | NOT NULL, default 0 | Số lần khách im lặng liên tiếp |
| `last_contacted_at` | timestamptz | | Lần chăm sóc gần nhất |
| `mql_at` | timestamptz | | Lần đầu đạt MQL |
| `sql_at` | timestamptz | | Lần đầu đạt SQL |
| `won_at` | timestamptz | | Ngày chốt |
| `lost_reason` | text | | Bắt buộc khi outcome = LOST |
| `disqualify_reason` | enum | | `SPAM` \| `WRONG_TARGET` \| `COMPETITOR` \| `DUPLICATE` \| `KHAC` |
| `is_cold` | boolean | default false | Đã chuyển Cold Data |
| `consult_note` | text | | Ghi chú tư vấn tổng hợp, dạng markdown |
| `placement_test_result` | text | | Kết quả test đầu vào |
| `class_assigned` | text | | Lớp được xếp |
| `preferred_schedule` | text | | Lịch rảnh |
| `desired_start_date` | date | | Ngày muốn học |
| `ems_status` | enum | NOT NULL, default `CHUA` | `CHUA` \| `DA_NHAP` — bàn giao DotB EMS (gộp từ tab "Bàn giao EMS" cũ) |
| `ems_link` | text | | Link hồ sơ học viên trên EMS |
| `duplicate_of` | uuid | FK leads, NULL | Nếu được xác nhận là trùng |
| `deleted_at` | timestamptz | | |

> **Bàn giao EMS** (SPEC Mục 2.3 — "chỉ export"): không còn tab riêng. `ems_status` /
> `ems_link` nằm trên chính lead, chỉ có nghĩa cho lead đã chốt (`outcome = WON`). Sửa
> tại chỗ trên bảng `/lead` (view dựng sẵn "Chờ bàn giao EMS" = `WON AND ems_status =
> CHUA`) hoặc ở trang chi tiết lead. Cột `enrollments.ems_student_id` giữ nguyên cho
> tương thích, không dùng ở giao diện nữa.

**Chỉ mục cần thiết:** `(next_contact_date, outcome)` cho hàng đợi quá hạn, `(campaign_id, max_stage)` cho tính chỉ số campaign, `(assigned_to, next_contact_date)` cho work queue cá nhân, `(mql_at)`, `(won_at)` cho báo cáo theo kỳ.

### 7.6. `lead_interactions`

Nhật ký chăm sóc. Bảng này là thứ file sheet hoàn toàn không có, và là điều kiện để quy tắc escalate 5 bước vận hành được.

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `lead_id` | uuid | FK leads, NOT NULL | |
| `occurred_at` | timestamptz | NOT NULL, default now | |
| `channel` | enum | NOT NULL | `CALL` \| `ZALO` \| `MESSENGER` \| `EMAIL` \| `SMS` \| `MEET` |
| `direction` | enum | NOT NULL | `OUTBOUND` \| `INBOUND` |
| `result` | enum | NOT NULL | `RESPONDED` \| `NO_RESPONSE` \| `REFUSED` \| `RESCHEDULED` |
| `content` | text | | Nội dung trao đổi |
| `stage_before` | enum | | Ghi nhận tự động |
| `stage_after` | enum | | Ghi nhận tự động |
| `next_contact_date_set` | date | | Ngày hẹn lại được đặt trong lần này |
| `created_by` | uuid | FK users, NOT NULL | |

### 7.7. `lead_stage_history`

Ghi mọi lần chuyển giai đoạn. Tách riêng khỏi `lead_interactions` vì giai đoạn có thể thay đổi mà không có tương tác (ví dụ hệ thống tự chuyển Cold Data).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `lead_id` | uuid | FK leads |
| `from_stage` / `to_stage` | enum | |
| `from_outcome` / `to_outcome` | enum | |
| `changed_at` | timestamptz | |
| `changed_by` | uuid | FK users, NULL nếu do hệ thống |
| `reason` | text | |

### 7.8. `enrollments`

Tách doanh thu ra bảng riêng thay vì một cột trên `leads`.

**Lý do:** một lead có thể mua nhiều lần (ví dụ mua IELTS Express 1 rồi mua tiếp Express 2), hoặc trả góp nhiều đợt. Dữ liệu hiện tại đã có dấu hiệu này (một số dòng doanh thu 7.920.000 lặp lại 8 lần, 37.152.000 một lần - biên độ rất rộng). Nếu để một cột, không thể phân biệt "một hợp đồng lớn" với "nhiều lần thanh toán".

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `lead_id` | uuid | FK leads, NOT NULL | |
| `product_id` | uuid | FK products, NOT NULL | Có thể khác sản phẩm quan tâm ban đầu |
| `contract_date` | date | NOT NULL | |
| `gross_amount` | bigint | NOT NULL, > 0 | Doanh thu gộp trước giảm trừ |
| `discount_amount` | bigint | default 0 | |
| `net_amount` | bigint | GENERATED | `gross_amount - discount_amount` |
| `collected_amount` | bigint | default 0 | Tiền thực thu, phục vụ KPI "Tiền thu" |
| `student_count` | int | default 1 | Số HVM ghi nhận. Phục vụ KPI HVM và thưởng 50.000đ/HVM |
| `ems_student_id` | text | | Mã học viên bên DotB EMS sau khi bàn giao |
| `note` | text | | |

**Ràng buộc nghiệp vụ:** khi tạo `enrollment` đầu tiên cho một lead, hệ thống tự động đặt `lead.outcome = WON`, `lead.stage = WON`, `lead.won_at = contract_date`. Ngược lại, **không cho phép** đặt outcome = WON bằng tay nếu chưa có enrollment. Đây là cách chặn triệt để tình trạng 23 lead Chốt HV nhưng chỉ 22 dòng có doanh thu.

### 7.9. `tasks`

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `title` | text | NOT NULL | |
| `description` | text | | Markdown |
| `group_code` | text | | Nhóm công việc, ví dụ `A. QUY TRÌNH CHUNG` |
| `product_id` | uuid | FK products, NULL | Nếu task gắn sản phẩm cụ thể |
| `type` | enum | NOT NULL | `PROJECT` \| `RECURRING` \| `SYSTEM` |
| `assignee_id` | uuid | FK users, NOT NULL | |
| `co_assignees` | uuid[] | | Người phối hợp |
| `created_by` | uuid | FK users | |
| `goal_kpi` | text | | Mục tiêu / KPI của đầu việc, dạng chữ |
| `due_date` | date | | |
| `status` | enum | NOT NULL, default `TODO` | `TODO` \| `IN_PROGRESS` \| `DONE` \| `BLOCKED` \| `CANCELLED` |
| `priority` | enum | default `NORMAL` | `LOW` \| `NORMAL` \| `HIGH` \| `URGENT` |
| `progress_pct` | int | 0-100 | |
| `recurrence_rule` | text | | Chuỗi RRULE nếu type = RECURRING |
| `parent_task_id` | uuid | FK tasks | Cho task con sinh từ task định kỳ |
| `link_url` | text | | Link tài liệu ngoài (Canva, Drive) |
| `blocked_reason` | text | | Bắt buộc khi status = BLOCKED |
| `completed_at` | timestamptz | | |
| `deleted_at` | timestamptz | | |

### 7.10. `kpi_definitions` và `kpi_assignments`

Tách định nghĩa chỉ tiêu khỏi việc giao chỉ tiêu.

**`kpi_definitions`** - danh mục các loại chỉ tiêu có thể giao:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | UNIQUE, ví dụ `HVM`, `REVENUE_GROSS`, `CASH_COLLECTED`, `MQL_COUNT`, `CPMQL`, `DATA_COMPLIANCE` |
| `name` | text | Tên hiển thị |
| `unit` | enum | `COUNT` \| `VND` \| `PERCENT` \| `RATIO` |
| `direction` | enum | `HIGHER_BETTER` \| `LOWER_BETTER` |
| `source` | enum | `AUTO` \| `MANUAL` |
| `formula_key` | text | Khóa trỏ tới hàm tính trong `metrics.ts`, chỉ dùng khi source = AUTO |
| `description` | text | Định nghĩa chính thức, hiển thị khi hover |

**`kpi_assignments`** - một chỉ tiêu cụ thể giao cho một người hoặc một nhóm trong một kỳ:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `kpi_definition_id` | uuid | FK |
| `period_type` | enum | `MONTH` \| `QUARTER` \| `YEAR` |
| `period_start` / `period_end` | date | |
| `scope_type` | enum | `USER` \| `TEAM` \| `PRODUCT` |
| `user_id` | uuid | FK users, NULL nếu scope khác |
| `product_id` | uuid | FK products, NULL nếu không giới hạn sản phẩm |
| `target_value` | numeric | Chỉ tiêu |
| `weight_pct` | numeric(5,2) | Trọng số trong tổng KPI của người đó. Tổng trọng số mỗi người mỗi kỳ phải bằng 100 |
| `threshold_tiers` | jsonb | Các mốc hoàn thành, ví dụ `[{"pct":85},{"pct":90},{"pct":100}]` |
| `manual_actual` | numeric | Chỉ dùng khi source = MANUAL |
| `note` | text | |
| `created_by` | uuid | FK users |

**Ràng buộc:** hệ thống phải cảnh báo (không chặn cứng) khi tổng `weight_pct` của một user trong một kỳ khác 100.

### 7.11. `saved_views`

Phục vụ yêu cầu filter/group by kiểu Airtable.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `entity` | enum | `LEADS` \| `CAMPAIGNS` \| `TASKS` \| `DAILY_METRICS` \| `ENROLLMENTS` |
| `name` | text | Tên view |
| `owner_id` | uuid | FK users |
| `visibility` | enum | `PRIVATE` \| `SHARED` |
| `config` | jsonb | Toàn bộ cấu hình filter, sort, group, cột hiển thị. Xem Mục 14.3 |
| `is_default` | boolean | View mặc định của người đó cho entity đó |

### 7.12. `audit_logs`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigserial | PK |
| `occurred_at` | timestamptz | |
| `actor_id` | uuid | FK users, NULL nếu hệ thống |
| `entity` | text | Tên bảng |
| `entity_id` | uuid | |
| `action` | enum | `CREATE` \| `UPDATE` \| `DELETE` \| `LOGIN` \| `EXPORT` \| `LOCK` \| `UNLOCK` |
| `changes` | jsonb | `{field: {from, to}}` |
| `ip` | inet | |

**Bắt buộc ghi audit cho:** mọi thay đổi `stage`, `outcome`, `assigned_to`, `next_contact_date` của lead; mọi thay đổi `spend`, `messages`; mọi thao tác trên `enrollments`; mọi thay đổi `kpi_assignments`; mọi lần export dữ liệu.

### 7.13. `period_locks`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `period_start` / `period_end` | date | |
| `locked_at` | timestamptz | |
| `locked_by` | uuid | FK users |
| `note` | text | |

Khi một kỳ bị khóa, mọi bản ghi có `metric_date`, `contract_date`, hoặc mốc `won_at` nằm trong kỳ đó trở thành chỉ đọc với tất cả vai trò trừ `ADMIN`. ADMIN muốn sửa phải mở khóa, và việc mở khóa được ghi audit.

### 7.14. `notifications`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK users |
| `type` | enum | `OVERDUE_LEADS` \| `CAMPAIGN_ALERT` \| `TASK_DUE` \| `KPI_RISK` \| `DATA_GAP` \| `ASSIGNMENT` |
| `severity` | enum | `INFO` \| `WARNING` \| `CRITICAL` |
| `title` / `body` | text | |
| `link_url` | text | Đường dẫn tới màn hình xử lý |
| `read_at` | timestamptz | |
| `created_at` | timestamptz | |

---

# PHẦN III - QUY TẮC NGHIỆP VỤ

## 8. Vòng đời lead

### 8.1. Máy trạng thái

```
                    ┌─────────────────────────────────────┐
                    ▼                                     │
  [NEW] ──▶ [NO_CONTACT] ──▶ [CONSULTING] ──▶ [MQL] ──▶ [SQL] ──▶ [WON]
    │            │                 │            │          │
    └────────────┴─────────────────┴────────────┴──────────┘
                                   │
                                   ▼
                        outcome = LOST / DISQUALIFIED
```

**Quy tắc chuyển:**

| Từ | Đến | Điều kiện |
|---|---|---|
| Bất kỳ | Giai đoạn cao hơn | Tự do, EC tự đánh giá |
| Bất kỳ | Giai đoạn thấp hơn | Cho phép, nhưng `max_stage` giữ nguyên, và bắt buộc ghi lý do |
| Bất kỳ (trừ WON) | `outcome = LOST` | Bắt buộc điền `lost_reason`. Không xóa `next_contact_date`, hệ thống tự đặt lại `+45 ngày` cho remarketing |
| Bất kỳ | `outcome = DISQUALIFIED` | Bắt buộc chọn `disqualify_reason`. Xóa `next_contact_date` |
| `SQL` | `WON` | Chỉ thông qua việc tạo `enrollment`. Không cho đổi trạng thái trực tiếp |
| `WON` | Bất kỳ | Chỉ `MANAGER` trở lên, bắt buộc ghi lý do, kỳ chưa khóa sổ |

**Quy tắc `max_stage`:** sau mỗi lần cập nhật, `max_stage = GREATEST(max_stage_cũ, stage_mới)`. Cài đặt bằng database trigger hoặc trong service layer, và có unit test riêng.

**Quy tắc mốc thời gian:** khi `max_stage` lần đầu đạt `MQL`, ghi `mql_at = now()`. Nếu lead được nhập trễ (nhập ngày 20/8 cho khách nhắn ngày 15/8), cho phép EC sửa `mql_at` về quá khứ, có audit log.

### 8.2. Cỗ máy chăm sóc theo "Ngày LH lại"

Đây là trái tim vận hành của EC.

**Nguyên tắc gốc:**
> Mọi lead sau khi chăm sóc **bắt buộc** phải có Ngày LH lại, trừ lead ở trạng thái `DISQUALIFIED` (Không nhu cầu, spam).
> Lead có Ngày LH lại nằm trong quá khứ = **đã trễ hẹn chăm sóc**.

**Bảng escalate theo số lần im lặng:**

| `silence_count` sau lần chăm sóc | Ngày LH lại được đề xuất | Kịch bản hành động |
|---|---|---|
| 1 | Cùng ngày (T+0) | Nhắc lại ngay trong ngày |
| 2 | T+1 | Nhắc lại vào ngày hôm sau |
| 3 | T+3 | Nhắc lại kèm chương trình ưu đãi |
| 4 | T+7 | Nhắn hỏi thăm, không bán |
| 5 | T+30 | Thăm dò lại nhu cầu |
| >= 6 | Không đặt | Hệ thống tự chuyển `is_cold = true`, `outcome = LOST`, `lost_reason = 'Không phản hồi sau 5 nhịp chăm sóc'` |

**Quy tắc tăng và reset `silence_count`:**

```
Khi EC ghi một interaction:
  - result = NO_RESPONSE     → silence_count += 1
  - result = RESPONDED       → silence_count = 0
  - result = RESCHEDULED     → silence_count = 0  (khách chủ động hẹn lại)
  - result = REFUSED         → không đổi, EC được nhắc chuyển outcome = LOST
```

**Hành vi giao diện bắt buộc:** khi EC chọn `result = NO_RESPONSE`, hệ thống **tự động điền sẵn** Ngày LH lại theo bảng trên. EC được phép sửa (vì thực tế luôn có ngoại lệ), nhưng nếu sửa thì phải ghi lý do một dòng. Mục tiêu là làm cho việc tuân thủ quy trình trở thành đường ít trở ngại nhất, thay vì bắt buộc bằng luật.

**Ngoại lệ về ngày nghỉ:** nếu Ngày LH lại đề xuất rơi vào Chủ nhật hoặc ngày lễ, hệ thống đẩy sang ngày làm việc kế tiếp. Danh sách ngày lễ là bảng cấu hình.

### 8.3. Kiểm tra trùng lặp

**Bối cảnh:** vì chấp nhận theo dõi lead không có số điện thoại, trường dò trùng phải bao gồm tên. Nhưng dữ liệu thực tế cho thấy tên **không đủ tin cậy** để làm khóa: trong 566 bản ghi có 533 tên phân biệt, với `Hoa Nguyen` xuất hiện 4 lần và `Khanh Ngoc` 3 lần. Đây là tên hiển thị Facebook, hoàn toàn có thể là 4 người khác nhau.

**Vì vậy: không chặn cứng, chỉ cảnh báo có xếp hạng.**

Thuật toán khi nhập lead mới:

```
Chuẩn hóa:
  name_normalized  = bỏ dấu tiếng Việt, lowercase, gộp khoảng trắng, bỏ tiền tố
                     "Phụ Huynh", "PH", "Chị", "Anh", "Cô", "Bạn"
  phone_normalized = bỏ mọi ký tự không phải số, đổi "84xxx" và "+84xxx" thành "0xxx"

Điểm trùng (thang 100):
  +60  phone_normalized trùng khớp hoàn toàn
  +25  name_normalized trùng khớp hoàn toàn
  +15  name_normalized giống >= 85% (Levenshtein)
  +10  cùng product_id
  +10  cùng campaign_id
  +10  received_at cách nhau <= 7 ngày
  +15  email hoặc fb_profile trùng

Xử lý:
  >= 60  → cảnh báo đỏ, hiện bản ghi nghi trùng, mặc định nút "Gộp vào lead cũ"
  35-59  → cảnh báo vàng, hiện danh sách, cho phép "Vẫn tạo mới"
  < 35   → tạo bình thường
```

**Thao tác gộp:** giữ lead cũ làm bản chính, chuyển toàn bộ interaction của bản mới sang, đặt `duplicate_of` trên bản mới, ẩn khỏi mọi báo cáo nhưng không xóa. Lý do không xóa: cần giữ dấu vết để biết campaign nào đang tạo ra lead trùng (dấu hiệu targeting chồng lấn giữa các campaign).

**Chỉ số cần theo dõi:** tỷ lệ lead trùng theo campaign. Nếu một campaign có tỷ lệ trùng cao bất thường, đó là tín hiệu audience overlap và đang đốt tiền hai lần cho cùng một người.

### 8.4. Quy tắc kiểm tra dữ liệu (validation)

| Mã | Quy tắc | Mức | Hành vi |
|---|---|---|---|
| V01 | Lead có `outcome = OPEN` và đã có ít nhất 1 interaction thì bắt buộc có `next_contact_date` | CHẶN | Không lưu được |
| V02 | `outcome = DISQUALIFIED` thì không được có `next_contact_date` | CHẶN | Tự xóa khi chuyển trạng thái |
| V03 | `outcome = LOST` bắt buộc có `lost_reason` dài >= 10 ký tự | CHẶN | |
| V04 | `outcome = WON` bắt buộc có ít nhất 1 `enrollment` | CHẶN | Chỉ tạo được qua form enrollment |
| V05 | Lead nguồn `ORGANIC`/`REFERRAL`/`HOTLINE` không được gán `campaign_id` | CHẶN | |
| V06 | Lead `max_stage >= MQL` mà không có `phone` | CẢNH BÁO | Cho lưu, hiện cờ vàng. Vì có thể tư vấn hoàn toàn qua Messenger |
| V07 | `stage != NEW` mà `assigned_to` rỗng | CHẶN | |
| V08 | `next_contact_date` đặt xa hơn 90 ngày | CẢNH BÁO | Nhắc "Có phải bạn muốn chuyển Cold Data?" |
| V09 | Số bản ghi lead của campaign vượt quá tổng `messages` đã nhập cho campaign đó | CẢNH BÁO cấp hệ thống | Hiện trên dashboard Marketing, nghĩa là thiếu số liệu ads |
| V10 | Campaign `status = ON` nhưng 3 ngày liên tiếp không có `campaign_daily_metrics` | CẢNH BÁO | Nhắc Marketing Executive nhập số |
| V11 | `enrollment.collected_amount > enrollment.net_amount` | CHẶN | |
| V12 | Lead ở `stage = NEW` quá 24 giờ | CẢNH BÁO | Vi phạm cam kết phản hồi trong 15 phút |
| V13 | Thao tác trên bản ghi thuộc kỳ đã khóa sổ | CHẶN | Trừ ADMIN |


---

## 9. Công thức chỉ số - nguồn sự thật duy nhất

Toàn bộ nội dung mục này được cài đặt trong một file duy nhất: `/lib/services/metrics.ts`. Không có ngoại lệ.

### 9.1. Chỉ số cơ sở

Với một phạm vi lọc bất kỳ (khoảng thời gian, campaign, sản phẩm, kênh, người phụ trách):

| Chỉ số | Công thức | Nguồn |
|---|---|---|
| `spend` | `SUM(campaign_daily_metrics.spend)` | Nhập tay |
| `leads` | `SUM(campaign_daily_metrics.messages)` | Nhập tay |
| `leads_recorded` | `COUNT(leads WHERE duplicate_of IS NULL)` | Bản ghi |
| `mql` | `COUNT(leads WHERE max_stage >= MQL)` | Bản ghi |
| `sql` | `COUNT(leads WHERE max_stage >= SQL)` | Bản ghi |
| `won` | `COUNT(leads WHERE outcome = WON)` | Bản ghi |
| `hvm` | `SUM(enrollments.student_count)` | Bản ghi |
| `revenue_gross` | `SUM(enrollments.gross_amount)` | Bản ghi |
| `revenue_net` | `SUM(enrollments.net_amount)` | Bản ghi |
| `cash_collected` | `SUM(enrollments.collected_amount)` | Bản ghi |

### 9.2. Chỉ số dẫn xuất

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| `CPL` | `spend / leads` | Mẫu số là số nhập tay |
| `CPMQL` | `spend / mql` | **Chỉ số điều hành chính** |
| `CPSQL` | `spend / sql` | |
| `CAC` | `spend / won` | |
| `CR_lead_mql` | `mql / leads` | |
| `CR_mql_sql` | `sql / mql` | |
| `CR_sql_won` | `won / sql` | |
| `CR_lead_won` | `won / leads` | Tỷ lệ chuyển đổi toàn phễu |
| `ROAS` | `revenue_gross / spend` | |
| `AOV` | `revenue_gross / won` | Giá trị đơn trung bình |
| `revenue_after_mkt` | `revenue_gross - spend - kol_cost` | Chỉ tiêu KPI theo cơ chế thưởng Q3 |

**Quy tắc chia cho 0:** trả về `null`, hiển thị dấu `-`. **Tuyệt đối không** trả về 0, vì 0 và "không xác định" mang ý nghĩa quản trị trái ngược nhau. Sheet hiện tại trả về `"-"` là đúng, phải giữ nguyên tinh thần này.

### 9.3. Quy tắc quy kết theo thời gian (attribution)

Đây là điểm tinh vi nhất và là nơi số liệu dễ sai nhất.

**Vấn đề:** chi phí phát sinh ngày 1/9. Lead đến ngày 1/9. Nhưng lead đó lên MQL ngày 4/9 và chốt ngày 15/9. Nếu tính CPMQL của ngày 1/9 vào cuối ngày 1/9, kết quả sẽ là vô cực (spend > 0, MQL = 0), và hệ thống sẽ báo động giả.

**Quy tắc bắt buộc:**

```
Khi lọc theo khoảng thời gian [A, B]:
  spend, leads   → lọc theo campaign_daily_metrics.metric_date
  mql            → lọc theo leads.mql_at        (KHÔNG phải received_at)
  sql            → lọc theo leads.sql_at
  won, doanh thu → lọc theo enrollments.contract_date
```

**Cửa sổ quy kết (attribution window):** một lead chỉ được quy về campaign nếu `mql_at - received_at <= 90 ngày`. Ngoài khoảng đó, lead vẫn tính vào tổng nhưng không tính vào chỉ số campaign, vì mối quan hệ nhân quả đã quá loãng.

**Cảnh báo hiển thị bắt buộc:** khi người dùng xem CPMQL của một khoảng thời gian kết thúc trong vòng 7 ngày gần nhất, hệ thống hiển thị dòng nhắc:
> "Dữ liệu chưa chín. Lead phát sinh trong 7 ngày gần đây có thể chưa kịp lên MQL. CPMQL của giai đoạn này có xu hướng cao hơn thực tế."

Không có dòng nhắc này, sẽ có người tắt nhầm một campaign tốt chỉ vì nó mới chạy 2 ngày.

### 9.4. Quy tắc cảnh báo campaign

**Theo yêu cầu:** ngưỡng báo động CPMQL là 600.000đ. Với campaign chưa có MQL nào, mốc là 900.000đ (bằng 1,5 lần ngưỡng) thì kill.

**Cài đặt:**

```
Với mỗi campaign đang ON, tính trên hai cửa sổ:
  - Lifetime:  từ started_on đến hôm nay
  - Rolling:   14 ngày gần nhất

Quy tắc:
  R1 [CRITICAL - Đề xuất KILL]
     mql_lifetime = 0  AND  spend_lifetime >= kill_threshold_no_mql (mặc định 900.000)

  R2 [CRITICAL - Đề xuất KILL]
     mql_rolling >= 1  AND  cpmql_rolling > target_cpmql × 1.5

  R3 [WARNING - Cần tối ưu]
     mql_rolling >= 1  AND  cpmql_rolling > target_cpmql

  R4 [WARNING - Thiếu dữ liệu]
     campaign ON nhưng không có metric 3 ngày liên tiếp

  R5 [INFO - Đang tốt]
     cpmql_rolling <= target_cpmql × 0.7
     → gợi ý cân nhắc tăng ngân sách ngày
```

**Vì sao phải có hai cửa sổ:** campaign chạy ngân sách ngày, không có ngày kết thúc. Một campaign chạy 3 tháng, tháng đầu tệ và hai tháng sau tốt, nếu chỉ nhìn lifetime sẽ mãi mãi bị đánh dấu đỏ và bị kill oan. Ngược lại nếu chỉ nhìn rolling, sẽ không phát hiện được campaign đã đốt 20 triệu tổng cộng. Cần cả hai.

### 9.5. Phản biện quan trọng về ngưỡng 600.000đ

**Tôi không đồng tình với việc dùng một ngưỡng CPMQL duy nhất cho toàn bộ sản phẩm, và đề nghị anh cân nhắc lại trước khi cài cứng vào hệ thống.**

Lý do: các sản phẩm có giá niêm yết chênh nhau nhiều lần. Một MQL của TESOL E-PATH và một MQL của Tiếng Anh Giao tiếp không có cùng giá trị kinh tế. Áp cùng ngưỡng 600.000đ sẽ dẫn tới hai lỗi ngược chiều cùng lúc:
- Kill nhầm campaign TESOL đang có lãi tốt vì CPMQL 700.000đ (trong khi room CAC của TESOL thừa sức gánh);
- Nuôi campaign Giao tiếp lỗ vì CPMQL 500.000đ vẫn "dưới ngưỡng" (trong khi giá sản phẩm không đỡ nổi).

**Cách đúng để suy ra ngưỡng, dựa trên nguyên tắc room CAC = 15% giá niêm yết đã chốt trong chiến lược:**

```
CPMQL_target = (giá_niêm_yết × room_CAC%) × tỷ_lệ_MQL→Chốt

Ví dụ minh họa (số cần P.TCKT xác nhận):
  TESOL, giá 10.000.000, room 15% → CAC trần 1.500.000
  Nếu tỷ lệ MQL→Chốt là 30%      → CPMQL_target = 1.500.000 × 0,30 = 450.000
  Nếu tỷ lệ MQL→Chốt là 20%      → CPMQL_target = 300.000
```

Nghĩa là ngưỡng CPMQL **không phải một con số cố định**, mà là hàm của giá sản phẩm và tỷ lệ chuyển đổi thực tế. Hệ thống có đủ dữ liệu để tính `CR_mql_won` theo từng sản phẩm, nên hoàn toàn làm được.

**Đề xuất cài đặt thỏa hiệp:**
- Lưu `target_cpmql` ở cấp **sản phẩm** (bảng `products`), không phải hằng số toàn cục.
- Khởi tạo tất cả bằng 600.000 để không thay đổi hành vi hiện tại.
- Bổ sung một màn hình "Gợi ý ngưỡng" hiển thị song song: ngưỡng đang dùng, ngưỡng suy ra từ giá và tỷ lệ chuyển đổi thực tế 90 ngày qua, và chênh lệch.
- Sau 1-2 quý có đủ dữ liệu, đưa lên BOD/TCKT để chốt ngưỡng theo từng sản phẩm.

Ghi chú: trong file sheet hiện tại có một khối số ở `Campaign Monitor` cột T-U (FAST TRACK 1.5: 250.000 / EXPRESS: 200.000 / TESOL: 490.000 / GIAO TIẾP: 100.000) mà tôi **không xác định được** là ngưỡng CPMQL hay ngân sách ngày. Cần anh xác nhận. Nếu đó là ngưỡng CPMQL theo sản phẩm thì phòng đã đi đúng hướng này rồi và chỉ cần đưa vào hệ thống. Đánh dấu `[CẦN XÁC NHẬN]`.

### 9.6. Chỉ số kỷ luật vận hành

Nhóm chỉ số này không có trong sheet nhưng là thứ trực tiếp phục vụ mục tiêu M2 và M5.

| Chỉ số | Công thức | Ý nghĩa |
|---|---|---|
| `overdue_leads` | `COUNT(leads WHERE outcome = OPEN AND next_contact_date < hôm_nay)` | Số lead trễ hẹn chăm sóc |
| `overdue_rate` | `overdue_leads / COUNT(leads WHERE outcome = OPEN)` | Tỷ lệ trễ hẹn |
| `avg_overdue_days` | `AVG(hôm_nay - next_contact_date)` với lead trễ | Mức độ trễ trung bình |
| `no_next_date_rate` | Tỷ lệ lead OPEN đã có interaction mà thiếu Ngày LH lại | Đo mức tuân thủ quy trình |
| `first_response_rate` | Tỷ lệ lead rời `NEW` trong vòng 24h | Đo tốc độ phản hồi |
| `daily_clear_rate` | Số lead đến hẹn hôm nay đã được xử lý / tổng số đến hẹn hôm nay | Chỉ số làm việc hằng ngày của EC |
| `data_entry_compliance` | Số ngày Marketing nhập đủ số liệu / tổng số ngày trong kỳ | Đo kỷ luật của Marketing Executive |

**Đề xuất:** `daily_clear_rate` và `data_entry_compliance` nên trở thành KPI chính thức có trọng số nhỏ (5-10%) cho EC và Marketing Executive. Lý do: nếu không gắn KPI, dữ liệu sẽ thối dần và toàn bộ hệ thống mất giá trị trong 3 tháng. Đây là bài học đã thấy rõ từ chính file sheet hiện tại.

---

# PHẦN IV - ĐẶC TẢ CÁC MODULE

## 10. Module 1 - Campaign và số liệu quảng cáo

### 10.1. Màn hình `Campaigns`

Bảng danh sách dùng component Data Grid chung (Mục 16). **Sửa tại chỗ** (nhấp đôi,
role có `campaign.update`): `status` (ON/PAUSED/OFF — chọn OFF phải nhập lý do),
`display_name`, `daily_budget`, `channel`, `started_on`, `external_id`. Việc nhập số
liệu ads hằng ngày cũng nằm ngay ở bảng này (xem 10.2) qua 2 cột `Spend (ngày)` /
`Mess (ngày)` — chọn ngày ở đầu bảng. Cột mặc định:

| Cột | Nguồn | Định dạng |
|---|---|---|
| Trạng thái | `status` | Công tắc bật/tắt trực tiếp trên dòng |
| Mã nội bộ | `internal_code` | |
| Tên hiển thị | `display_name` | Link sang chi tiết |
| Sản phẩm | `product.code` | Chip màu |
| Kênh | `channel` | |
| Ngân sách/ngày | `daily_budget` | VND |
| Spend (kỳ) | tính | VND |
| Lead | tính, nhập tay | số nguyên |
| MQL | tính, bản ghi | số nguyên |
| SQL | tính | số nguyên |
| HV Chốt | tính | số nguyên |
| CPL | tính | VND |
| **CPMQL** | tính | VND, **tô màu theo ngưỡng** |
| CAC | tính | VND |
| CR Lead→HV | tính | % |
| Doanh thu | tính | VND |
| ROAS | tính | x |
| Người phụ trách | `owner` | |
| Cờ cảnh báo | tính | Biểu tượng R1-R5 |

**Quy tắc tô màu CPMQL:**
- Xanh: `<= target × 0,7`
- Trung tính: `> target × 0,7` và `<= target`
- Vàng: `> target` và `<= target × 1,5`
- Đỏ: `> target × 1,5`, hoặc chưa có MQL và spend đã vượt ngưỡng kill

Dòng tổng cố định ở đầu bảng, tính lại theo bộ lọc đang áp dụng.

### 10.2. Nhập số liệu ads hằng ngày (gộp vào bảng Campaign)

**Không còn tab riêng "Nhập số liệu ads".** Việc nhập số liệu nằm ngay trong bảng
`/campaign` (10.1): chọn ngày ở đầu bảng (mặc định hôm nay), mỗi dòng campaign có 2
cột sửa tại chỗ **Spend (ngày)** và **Mess (ngày)**. Nhấp đôi để nhập, Enter lưu,
gọi `upsertDailyMetric` (UNIQUE campaign_id+metric_date, ghi audit `spend`/`messages`,
V13 chặn kỳ khóa). Các cột chỉ số 30 ngày (Spend/MQL/CPMQL…) hiển thị cạnh đó để
Marketing thấy hệ quả tức thì. Server action `copyYesterdayAction` vẫn còn cho tương
lai (nút "sao chép từ hôm qua").

Lý do gộp: đội 4–6 người, một bảng Campaign có đủ lọc/sắp xếp/nhập là đủ nhanh;
bớt một tab, bớt một chỗ dữ liệu lệch nhau.

### 10.3. Màn hình chi tiết campaign

Bố cục: hàng thẻ chỉ số ở trên, biểu đồ ở giữa, hai bảng ở dưới.

- **Thẻ chỉ số:** Spend, Lead, MQL, SQL, HV Chốt, CPMQL, CAC, ROAS - kèm mũi tên so sánh với 14 ngày trước.
- **Biểu đồ 1:** đường kép theo ngày - Spend (cột) và MQL (đường), cùng đường CPMQL trên trục phải, có đường kẻ ngang ở ngưỡng target.
- **Biểu đồ 2:** phễu Lead → MQL → SQL → HV Chốt với tỷ lệ chuyển đổi từng bậc.
- **Bảng 1:** số liệu theo ngày (spend, messages, MQL phát sinh trong ngày).
- **Bảng 2:** danh sách lead thuộc campaign, nhúng Data Grid.
- **Hộp lịch sử:** các lần bật/tắt, đổi ngân sách, kèm lý do và người thực hiện.

---

## 11. Module 2 - Quản lý lead và hàng đợi công việc của EC

### 11.1. Hàng đợi chăm sóc — gộp vào Module Task (Gói D)

> **Cập nhật:** không còn màn hình `/hom-nay` riêng. **Mỗi lead đến hẹn chăm sóc =
> 1 bản ghi `tasks` type `LEAD_CARE`** (`lead_id`, `assignee_id` = người phụ trách,
> `due_date` = `next_contact_date`, `priority` theo `silence_count` / lead mới). Sinh
> tự động mỗi sáng (`spawnLeadCareTasks`, trong `runAllMorningJobs`) và bỏ qua lead đã
> có task đang mở. **1 task = 1 phiên chăm sóc:** ghi 1 tương tác (`recordInteraction`)
> hoặc lead chuyển WON/LOST/DISQUALIFIED → task tự chuyển `DONE`; sáng hôm sau nếu vẫn
> đến hẹn thì sinh task mới. Xem và xử lý ở **Công việc** (`/cong-viec`), lọc theo
> "đến hạn hôm nay / quá hạn". `/hom-nay` redirect sang `/cong-viec`.

Bố cục gốc (giữ để tham chiếu ưu tiên hiển thị trong Công việc):

Bố cục ba khối xếp dọc, theo đúng thứ tự ưu tiên:

**Khối 1 - QUÁ HẠN (nền đỏ nhạt)**
- Tiêu đề: "Trễ hẹn chăm sóc: N khách"
- Sắp xếp: **lead trễ lâu nhất lên đầu** (theo đúng nguyên tắc anh nêu)
- Mỗi dòng hiển thị: tên, sản phẩm, số ngày trễ, giai đoạn, `silence_count`, ghi chú tư vấn gần nhất (2 dòng đầu), nút hành động nhanh
- Không cho phép thu gọn khối này khi còn lead quá hạn

**Khối 2 - ĐẾN HẸN HÔM NAY**
- Sắp xếp theo `silence_count` giảm dần (khách sắp rơi vào Cold Data được ưu tiên)

**Khối 3 - LEAD MỚI CHƯA XỬ LÝ**
- Lead `stage = NEW` được phân công cho mình
- Hiển thị đồng hồ đếm thời gian kể từ khi tiếp nhận, chuyển đỏ sau 24h

Bên cạnh: thanh tiến độ ngày - "Đã xử lý 8/23 khách hôm nay", cập nhật theo thời gian thực. Đây là `daily_clear_rate`.

### 11.2. Thao tác chăm sóc nhanh

Từ hàng đợi, EC bấm vào một lead, mở panel trượt bên phải (không chuyển trang, giữ nguyên vị trí trong hàng đợi).

Panel gồm:
- Thông tin khách, nút gọi và nút mở Zalo trực tiếp
- Toàn bộ lịch sử tương tác, mới nhất trên cùng
- **Form ghi nhận nhanh:** kênh, kết quả, nội dung, giai đoạn mới
- Khi chọn kết quả = Không phản hồi: Ngày LH lại **tự điền** theo bảng escalate, kèm dòng chữ giải thích "Đây là lần im lặng thứ 3, hệ thống đề xuất nhắc lại sau 3 ngày kèm ưu đãi"
- Gợi ý kịch bản: hiển thị nội dung mẫu tương ứng với nhịp escalate hiện tại, có nút sao chép
- Nút "Lưu và sang khách tiếp theo" - đây là nút chính, giúp EC chạy hết hàng đợi mà không rời màn hình

### 11.3. Màn hình nhập lead mới

Ràng buộc UX cứng: **hoàn thành trong dưới 30 giây.**

- Chỉ 5 trường bắt buộc: Họ tên, Sản phẩm, Nguồn, Campaign (ẩn nếu nguồn không phải paid), Giai đoạn.
- SĐT không bắt buộc (đúng theo nguyên tắc vận hành đã chốt).
- Kiểm tra trùng chạy nền, hiện cảnh báo ngay dưới ô tên khi gõ xong.
- Các trường học thuật (kết quả test, xếp lớp, lịch rảnh) nằm trong khối gập lại, mặc định đóng.
- Người phụ trách mặc định là người đang đăng nhập.
- Nút "Lưu và nhập tiếp" giữ nguyên Sản phẩm, Nguồn, Campaign cho lead kế tiếp.

### 11.4. Màn hình danh sách lead

Data Grid đầy đủ (Mục 16).

**Sửa tại chỗ trên bảng** (nhấp đôi — Gói F). Trường có tập giá trị cố định hiển thị
**dropdown (`<select>`)**, trường ngày hiển thị **date picker**, còn lại là ô nhập chữ.
Mọi thay đổi đi qua service (`updateLead` hoặc `reassignLead`), **không** bỏ qua
validate, và **ghi audit_logs**.

| Nhóm | Trường | Kiểu ô | Quyền | Ghi chú |
|---|---|---|---|---|
| Thông tin | họ tên, SĐT, email, ghi chú tư vấn | chữ | `lead.update` | họ tên không được rỗng |
| Danh mục | **Sản phẩm** (list từ `products` đang bật — "Cấu hình sản phẩm"), **Campaign** (list từ `campaigns`), **Nguồn** | dropdown | `lead.update` | lưu `product_id` / `campaign_id` / `source`; V05 khi Nguồn/Campaign xung khắc |
| Trạng thái | **Giai đoạn**, **Kết quả** | dropdown | `lead.update` **và** `lead.statusChange` | chạy đủ máy trạng thái 8.1: max_stage GREATEST, đóng dấu `mql_at`/`sql_at`, đóng task `LEAD_CARE`. Hạ giai đoạn → hỏi lý do. `LOST` → hỏi lý do ≥10 ký tự (V03). `DISQUALIFIED` → hỏi mã lý do (V02). **Lên `WON` phải qua enrollment** (V04) — chặn ở bảng |
| Lịch | **Ngày LH lại** | date | `lead.update` | V01 khi OPEN + đã có tương tác |
| Phân công | **Phụ trách** | dropdown (EC) | `lead.reassign` | đi qua `reassignLead`, giữ `originally_assigned_to` |
| EMS | trạng thái EMS, link EMS | dropdown / chữ | `lead.update` | xem 7.5 |

Audit các key: `full_name` `phone` `email` `source` `product_id` `consult_note`
`campaign_id` `stage` `outcome` `assigned_to` `next_contact_date` `ems_status` `ems_link`.
Khi bật quyền sửa, cột "Khách" bỏ liên kết (mở chi tiết qua cột "Mã") để nhấp đôi
không điều hướng.

Các view dựng sẵn chia sẻ cho cả đội:

| Tên view | Bộ lọc |
|---|---|
| Quá hạn chăm sóc | `outcome = OPEN AND next_contact_date < hôm nay` |
| Hôm nay | `next_contact_date = hôm nay` |
| Mới chưa xử lý | `stage = NEW` |
| Thiếu Ngày LH lại | `outcome = OPEN AND next_contact_date IS NULL AND có ít nhất 1 interaction` |
| Đang nóng | `max_stage = SQL AND outcome = OPEN` |
| Sắp thành Cold | `silence_count >= 4 AND outcome = OPEN` |
| Chốt tháng này | `outcome = WON AND won_at trong tháng` |
| Kho remarketing | `outcome = LOST AND next_contact_date <= hôm nay` |
| Thiếu SĐT nhưng là MQL | `max_stage >= MQL AND phone IS NULL` |

### 11.5. Phân công và chuyển giao lead

- ADMIN/MANAGER phân công lại được, đơn lẻ hoặc hàng loạt.
- Khi chuyển, hệ thống ghi audit và tạo thông báo cho cả hai bên.
- **Câu hỏi cần chốt:** khi một lead được chuyển từ EC A sang EC B rồi chốt, ai được tính HVM cho KPI và thưởng? Xem Mục 24-QĐ05. Đây là tranh chấp chắc chắn sẽ xảy ra, phải có quy tắc trước khi golive.

---

## 12. Module 3 - Dashboard

### 12.1. Nguyên tắc thiết kế

Dashboard hiện tại của sheet có 46 dòng số dày đặc. Nó trả lời được "số là bao nhiêu" nhưng không trả lời được "tôi phải làm gì". Dashboard mới phải đảo ngược thứ tự đó.

Ba tầng, từ trên xuống:
1. **Cần hành động** - những gì đang sai, kèm nút xử lý
2. **Sức khỏe hiện tại** - các chỉ số chính so với kỳ trước và so với chỉ tiêu
3. **Chi tiết bóc tách** - theo sản phẩm, campaign, kênh, nhân sự

### 12.2. Bộ lọc toàn cục

Áp dụng cho toàn bộ dashboard, ghi nhớ theo người dùng (localStorage):
- **Bộ chọn thời gian 4 cấp (Gói H):** 5 ô chọn cạnh nhau — **Nhanh · Năm · Quý ·
  Tháng · Tuần** — kiểu phân cấp, chọn tới đâu áp phạm vi tới đó:
  - *Nhanh:* Hôm nay / 7 ngày / 14 ngày (preset ngắn, độc lập với 4 cấp dưới).
  - *Năm:* 4 năm gần nhất → `year:YYYY` = cả năm.
  - *Quý:* Cả năm | Quý 1–4 → `quarter:YYYY-Q#`.
  - *Tháng:* Cả kỳ | các tháng (bó theo quý nếu đã chọn quý) → `month:YYYY-MM`.
  - *Tuần:* khóa cho tới khi chọn Tháng; sau đó liệt kê các **tuần báo cáo VMG**
    giao với tháng → `week:YYYY-MM-DD` (ngày Thứ 7 bắt đầu tuần).
  - Chọn cấp sâu hơn ghi đè cấp trên; bỏ (`Cả …`) lùi về cấp cha.
  - **Tuần báo cáo VMG = Thứ 7 tuần trước → Thứ 6 tuần này** (7 ngày). `weeklyTrend`
    và ô chọn tuần đều theo mốc này. Helper trong `src/lib/time.ts`:
    `reportWeekBounds` / `yearBounds` / `monthsOfYear` / `weeksOfMonth` /
    `parsePeriodParts` / `resolvePeriodValue` (kèm cấp `year:`).
- So sánh với: kỳ liền trước / cùng kỳ năm trước / không so sánh
- Sản phẩm (nhiều lựa chọn)
- Kênh (nhiều lựa chọn)
- Người phụ trách (nhiều lựa chọn)

**Tab "Báo cáo" cũ đã gộp vào Dashboard.** Khối "Bóc tách" (12.5) hiển thị breakdown
theo sản phẩm / campaign / nhân sự / xu hướng tuần / cohort cho kỳ đang chọn, kèm nút
**Xuất XLSX** (5 sheet) — chỉ ADMIN/MANAGER. Không còn route `/bao-cao`.

**Hiệu năng render (Gói E1).** Shell trang + bộ lọc phải hiển thị **tức thì**, không chờ
truy vấn. "Sức khỏe" (12.4) và "Bóc tách" (12.5) là hai `<Suspense>` riêng, khóa theo
bộ lọc — đổi kỳ thì khối cũ hiện skeleton lại ngay, phần nhẹ (Sức khỏe) về trước, phần
nặng (Bóc tách) về sau. Bộ lọc dùng `useTransition`: select nhảy giá trị ngay khi bấm
(giá trị lạc quan), hiện "đang tải…" trong lúc server render. Nhóm `(app)` có
`loading.tsx` chung để mọi lần điều hướng thấy phản hồi ngay thay vì đứng ở trang cũ.

**Gộp truy vấn breakdown (Gói E2).** Các hàm bóc tách (`breakdownByProduct` /
`ByCampaign` / `ByUser`, `weeklyTrend`) **không** gọi `getBaseMetrics` lặp theo từng
id/tuần nữa. Thay bằng 3 hàm gộp trong `metrics.ts` (vẫn là nguồn công thức duy nhất,
có test đối chiếu `metrics-breakdown.test.ts` chốt "gộp == lặp"):
`getBaseMetricsGrouped(filter, "product"|"campaign"|"assignee")` → `Map<id, BaseMetrics>`
bằng 3–4 `GROUP BY` / bảng nguồn; `getTrendSeries(weekStarts, filter)` → chuỗi tuần
bằng 3 truy vấn; `getOpsDisciplineGrouped({from,to})` → overdue/first-response theo
người bằng 2 truy vấn. Mỗi lần tải "Bóc tách" giảm từ ~vài trăm round-trip xuống ~15.
Chỉ số phái sinh vẫn đi qua `deriveMetrics` duy nhất.

**Cache 60s (Gói I).** "Sức khỏe" và "Bóc tách" là số tổng hợp, **không** riêng theo
người xem → bọc `unstable_cache` (`src/app/(app)/dashboard-cache.ts`), khóa theo
`(from, to, productIds, channels[, cmpMode])`, `revalidate: 60`, tag `"dashboard"`.
Người thứ hai chọn cùng kỳ / bấm qua lại vài kỳ quen thuộc → lấy từ cache, không đụng
DB. Thêm index `leads.received_at` và `lead_stage_history(lead_id, from_stage)`
(migration 0007) cho các truy vấn gộp.

### 12.3. Tầng 1 - Khối cần hành động

Chỉ hiện khi có vấn đề. Không có vấn đề thì khối này biến mất, không hiện dòng "Mọi thứ đều ổn" chiếm chỗ.

| Thẻ | Điều kiện | Nút |
|---|---|---|
| Campaign đề xuất KILL | Có campaign vi phạm R1 hoặc R2 | Xem danh sách |
| Lead quá hạn chăm sóc | `overdue_leads > 0` | Mở hàng đợi |
| Lead mới chưa xử lý quá 24h | V12 | Mở danh sách |
| Thiếu số liệu ads | V10 | Mở màn hình nhập |
| Lead thiếu Ngày LH lại | V01 vi phạm ở dữ liệu cũ | Mở danh sách |
| KPI có nguy cơ trượt | Tiến độ thực tế thấp hơn tiến độ thời gian trên 15% | Mở KPI |

### 12.4. Tầng 2 - Sức khỏe

Hàng thẻ chỉ số, mỗi thẻ có: giá trị, biến động so với kỳ so sánh (mũi tên và %), và biểu đồ tia nhỏ 30 ngày.

Thứ tự: Spend | Lead | MQL | SQL | HV Chốt | Doanh thu | CPMQL | CAC | ROAS

Dưới đó, phễu tổng quan dạng ngang với tỷ lệ chuyển đổi từng bậc, và bên cạnh là cùng phễu đó của kỳ trước để so sánh trực quan.

### 12.5. Tầng 3 - Bóc tách

**Bảng theo sản phẩm** (thay thế Section 2 và 3B của sheet):
Sản phẩm | Spend | Lead | MQL | SQL | HV Chốt | HVM | Doanh thu | CPL | CPMQL | CAC | CR | ROAS | % ngân sách thực tế vs phân bổ

Cột cuối rất quan trọng: đối chiếu tỷ trọng chi tiêu thực tế với tỷ trọng phân bổ đã duyệt (TESOL 50%, VSTEP 20%, Tiếng Trung 10%, FT15 10%, FlexTrack 10%). Lệch trên 10 điểm phần trăm thì tô cảnh báo. Sheet hiện tại không có đối chiếu này, nên việc chi lệch kế hoạch không ai phát hiện.

**Bảng theo campaign:** như Mục 10.1, giới hạn top 20 theo spend.

**Bảng "Tiến độ đội"** (Gói M — thay bảng "theo nhân sự" cũ; **bỏ bảng cohort**):
mỗi hàng một nhân sự (EC + MARKETING), cột:
Lead được giao | MQL | HV Chốt | HVM | Doanh thu | CR MQL→Chốt | **Phiên chăm sóc**
(số `lead_interactions` trong kỳ) | **Task xong/tổng** (task có `due_date` trong kỳ) |
**% task** | **Task trễ** | Tỷ lệ trễ hẹn | Tốc độ phản hồi lead mới.
Dòng cuối **TỔNG ĐỘI** (cộng các số đếm; CR & %task tính lại theo tổng; hai tỷ lệ ops
để "–"). Mục đích: BOD/quản lý nhìn ra ai đang tải nặng / chậm việc / chăm sóc ít.
Grouped queries trong `dashboard.ts` (`getTeamAux` + `breakdownByUser`), cache 60s.

**Biểu đồ xu hướng:** đường theo tuần cho Spend, MQL, HV Chốt, CPMQL trong 12 tuần gần nhất.

### 12.6. Dashboard riêng cho vai trò VIEWER (BOD)

Bản rút gọn, một màn hình:
- Doanh thu lũy kế so với chỉ tiêu quý, dạng thanh tiến độ
- HVM lũy kế so với chỉ tiêu
- ROAS tổng và theo sản phẩm
- Xu hướng doanh thu 12 tuần
- **Bảng "Tiến độ đội"** (12.5) — theo yêu cầu BOD (điều chỉnh so với bản gốc):
  BOD được xem tiến độ **theo từng người có tên** (task, chăm sóc, chuyển đổi, trễ hẹn)
  kèm dòng TỔNG ĐỘI. Đây là dữ liệu hiệu suất công việc, không phải dữ liệu cá nhân
  của khách hàng.
- **Vẫn không** hiển thị thông tin liên hệ khách hàng cho VIEWER.

---

## 13. Module 4 - Quản trị công việc

### 13.1. Phân biệt hai loại công việc

Đây là quyết định thiết kế quan trọng, cần nói rõ để tránh làm sai.

**Không tạo task cho từng lead cần chăm sóc.** Nếu làm vậy, mỗi ngày hệ thống sinh 20-40 task, danh sách task trở thành rác và không ai dùng nữa.

Thay vào đó:

| Loại | Nơi quản lý | Ví dụ |
|---|---|---|
| Việc chăm sóc lead | **task `LEAD_CARE`** sinh tự động từ lead đến hẹn (Mục 11.1) — hiển thị chung ở Công việc | Gọi lại khách A, nhắn ưu đãi cho khách B |
| Việc dự án, việc định kỳ | Module Task (`PROJECT` / `RECURRING`) | Xây sale kit TESOL, gửi quy trình tư vấn |

Cầu nối giữa hai loại: chỉ số `daily_clear_rate` xuất hiện trên dashboard quản lý như một dòng "công việc" của EC, dù không phải task.

### 13.2. Cấu trúc task

Kế thừa cấu trúc đang dùng ở sheet "Kế hoạch T9", vốn đã hợp lý: Nhóm | Đầu việc | Mục tiêu/KPI | Vai trò chính | Timeline | Trạng thái | Link.

Bổ sung:
- `type = RECURRING` với luật lặp, ví dụ "Nhập số liệu ads" lặp mỗi ngày làm việc, tự sinh task con mỗi sáng
- `type = SYSTEM` cho task do hệ thống sinh, ví dụ "Xử lý 12 lead quá hạn"
- Trạng thái `BLOCKED` bắt buộc kèm lý do - phục vụ việc phát hiện điểm nghẽn, đặc biệt là nút thắt thiết kế

### 13.3. Màn hình

**Task của tôi:** ba cột Kanban (Cần làm / Đang làm / Xong), lọc theo tuần.

**Lưu trữ (Gói G).** Task đã **Xong** có nút **"Lưu trữ"** → đặt `tasks.archived_at`,
ẩn khỏi bảng (không phải xóa — bản ghi vẫn còn, vẫn tính vào thẻ tổng / `% hoàn thành`).
Nút **"Đã lưu trữ (N)"** trên thanh công cụ bật `?archived=1` để xem lại, mỗi thẻ khi đó
có nút **"bỏ lưu trữ"**. Chỉ lưu trữ được task `DONE`. Ghi `audit_logs` key `archived_at`.
`listTasks` mặc định lọc `archived_at IS NULL`, trừ khi truyền `includeArchived`.

**Toàn đội (chỉ MANAGER trở lên):**
- Chế độ bảng: Data Grid, mặc định gom nhóm theo người phụ trách
- Chế độ dòng thời gian: thanh ngang theo tuần, mỗi hàng một người, thấy được ai đang quá tải
- Thẻ tổng: tổng đầu việc, đã xong, % hoàn thành, số việc quá hạn, số việc bị chặn

Chỉ số `% hoàn thành` tính giống sheet Kế hoạch T9: `số task DONE / tổng số task trong kỳ`.

### 13.4. Việc định kỳ cần cấu hình sẵn

**Task "Nhập số liệu ads hôm nay" (Gói K).** Job sáng (`runSpawnAdsEntry` trong
`runAllMorningJobs`) tạo **1 task/ngày cho mỗi user vai trò `MARKETING`** đang hoạt
động — `type = SYSTEM`, `group_code = 'ADS'`, `due_date = hôm nay`, link `/ads`.
Idempotent trong ngày (bỏ qua nếu người đó đã có task ADS `due_date = hôm nay`).
Task **tự chuyển DONE** (`completeAdsEntryTasksIfDone`) khi trong ngày mọi campaign
đang ON đều đã có bản ghi `campaign_daily_metrics` — gọi sau mỗi lần lưu số liệu
campaign và trong job sáng. Không cần bảng template; logic ở
`src/lib/services/ads-entry-tasks.ts`.

| Việc | Người | Tần suất | Hạn trong ngày |
|---|---|---|---|
| Nhập spend và messages các campaign | Marketing Executive | Hằng ngày (T2-T7) | 10:00 |
| Xử lý hàng đợi lead quá hạn | E-Commerce Executive | Hằng ngày | 17:30 |
| Rà soát cảnh báo campaign | Marketing Executive | Hằng ngày | 11:00 |
| Cập nhật đầy đủ trạng thái lead trong ngày | E-Commerce Executive | Hằng ngày | Cuối ngày |
| Review CPMQL theo sản phẩm | Trưởng phòng | Hằng tuần, thứ Hai | |
| Chốt số liệu tháng, khóa sổ | Trưởng phòng | Hằng tháng, ngày 3 | |


---

## 14. Module 5 - Giao và quản trị KPI

### 14.1. Mô hình

KPI trong hệ thống này phải khớp với cơ chế thưởng hiệu suất TMĐT đã chốt, nếu không sẽ có hai bộ số và tranh chấp là chắc chắn.

Cấu trúc đã chốt cần được hệ thống hỗ trợ:
- 3 chỉ tiêu với trọng số **30 / 30 / 40**: HVM / Tiền thu / Doanh thu gộp sau trừ chi phí Marketing và KOL-KOC
- Các mốc hoàn thành: **85% / 90% / 100%**
- Kỳ tính: theo quý

Hệ thống không hard-code các con số này. Chúng là dữ liệu trong `kpi_definitions` và `kpi_assignments`, để khi cơ chế thưởng thay đổi ở quý sau thì chỉ cần cấu hình lại.

### 14.2. Danh mục chỉ tiêu khởi tạo

| Mã | Tên | Đơn vị | Nguồn | Công thức |
|---|---|---|---|---|
| `HVM` | Học viên mới | Số | AUTO | `SUM(enrollments.student_count)` trong kỳ |
| `CASH_COLLECTED` | Tiền thu | VND | AUTO | `SUM(enrollments.collected_amount)` |
| `REVENUE_GROSS` | Doanh thu gộp | VND | AUTO | `SUM(enrollments.gross_amount)` |
| `REVENUE_AFTER_MKT` | Doanh thu gộp sau chi phí MKT và KOL/KOC | VND | AUTO | `REVENUE_GROSS - spend - kol_cost` |
| `MQL_COUNT` | Số MQL tạo ra | Số | AUTO | `COUNT(max_stage >= MQL)` theo `mql_at` |
| `CPMQL` | Chi phí mỗi MQL | VND | AUTO, thấp hơn tốt hơn | `spend / mql` |
| `DAILY_CLEAR_RATE` | Tỷ lệ xử lý hàng đợi đúng hẹn | % | AUTO | Mục 9.6 |
| `DATA_COMPLIANCE` | Tỷ lệ ngày nhập đủ số liệu ads | % | AUTO | Mục 9.6 |
| `TASK_COMPLETION` | Tỷ lệ hoàn thành đầu việc | % | AUTO | Task DONE / tổng task |
| `CUSTOM_MANUAL` | Chỉ tiêu nhập tay | tùy | MANUAL | Trưởng phòng tự nhập số thực tế |

**Lưu ý về `kol_cost`:** hiện chưa có nơi lưu chi phí KOL/KOC. Cần bổ sung một bảng `other_costs` đơn giản (kỳ, loại chi phí, sản phẩm, số tiền, ghi chú) để công thức `REVENUE_AFTER_MKT` chạy được. Nếu không có bảng này, chỉ tiêu trọng số 40% sẽ phải nhập tay và mất tính tự động.

### 14.3. Màn hình giao KPI

- Chọn kỳ (**Quý** hoặc **Tháng** — Gói J; BOD phê duyệt KPI theo cả 2 nhịp),
  chọn phạm vi (cá nhân / đội / sản phẩm)
- Thêm từng dòng chỉ tiêu: loại KPI, chỉ tiêu, trọng số, **Ngân sách đã giao (đ)**
  — số BOD phê duyệt cho chỉ tiêu/kỳ đó (`kpi_assignments.allocated_budget`, cho
  trống nếu KPI không gắn ngân sách). Ghi audit key `allocated_budget`.
- Thanh kiểm tra tổng trọng số, cảnh báo khi khác 100%
- Nút "Sao chép từ kỳ trước"
- Sau khi lưu, hệ thống gửi thông báo cho người được giao
- **KPI đã giao và kỳ đã bắt đầu thì không sửa được chỉ tiêu**, trừ ADMIN với lý do bắt buộc và ghi audit. Đây là điều kiện để KPI có sức nặng.

### 14.4. Màn hình theo dõi KPI

**Cho cá nhân:**
Mỗi chỉ tiêu một thẻ: tên, chỉ tiêu, thực tế, % hoàn thành, trọng số, điểm quy đổi, thanh tiến độ có vạch mốc 85/90/100.

Bên cạnh mỗi thanh có **vạch tiến độ thời gian**: nếu hôm nay là ngày 40 của một quý 90 ngày, vạch nằm ở 44%. Nếu tiến độ thực tế thấp hơn vạch này quá 15 điểm phần trăm, hiển thị cảnh báo "Có nguy cơ trượt chỉ tiêu".

Dòng cuối: **Điểm KPI tổng** = `Σ (% hoàn thành từng chỉ tiêu × trọng số)`, giới hạn trần 100% cho mỗi chỉ tiêu khi cộng dồn (tránh việc vượt mạnh một chỉ tiêu bù cho việc trượt hoàn toàn chỉ tiêu khác).

**Cho quản lý:** bảng tất cả người, mỗi hàng một người, các cột là từng chỉ tiêu, ô hiển thị % và tô màu. Cột cuối là điểm tổng.

**Trên Dashboard — mục "Theo KPI" (Gói J).** Khi bộ lọc thời gian đang ở một Tháng
hoặc Quý khớp đúng mốc `kpi_assignments.period_start/period_end`: hiện bảng chỉ tiêu
(mã · phạm vi · mục tiêu · thực tế · % hoàn thành · trọng số · cờ *trễ nhịp*) và dải
**ngân sách**: giao (`Σ allocated_budget` các chỉ tiêu trùng kỳ) · đã giải ngân
(`getBaseMetrics(kỳ).spend` — nguồn công thức duy nhất) · còn lại · % giải ngân ·
nhịp kỳ. Kỳ không khớp (tuần / năm / nhanh) → hiện gợi ý chọn Tháng/Quý. Dữ liệu
cache 60s như các khối khác (`getKpiFollowCached`). Helper `getBudgetProgressForPeriod`
trong `src/lib/services/kpi.ts`.

### 14.5. Phản biện về thiết kế KPI

Hai điểm cần cân nhắc trước khi cài đặt:

**(a) Cả 3 chỉ tiêu của EC đều là chỉ tiêu kết quả cuối phễu, phụ thuộc nặng vào chất lượng lead do Marketing tạo ra.** Nếu Marketing chạy ads kém, EC không đạt KPI dù làm tốt phần việc của mình. Ngược lại, EC có thể đạt KPI mà không cần chăm sóc tốt nếu lead đang chảy vào dồi dào. Đề xuất: bổ sung 1 chỉ tiêu quy trình trọng số nhỏ (5-10%) như `DAILY_CLEAR_RATE`, lấy từ phần trọng số của chỉ tiêu HVM. Điều này đưa phần EC kiểm soát được vào trong công thức đánh giá.

**(b) Nguyên tắc "KPI phải đi cùng quyền điều hành".** Nếu một người bị đo bằng chỉ số mà họ không kiểm soát được đầu vào, đó là bẫy trách nhiệm. Cụ thể: nếu Marketing Executive bị đo bằng CPMQL, thì Marketing Executive phải có quyền tắt campaign, đổi ngân sách, đổi nội dung - chứ không phải chỉ có quyền nhập số. Hệ thống nên phản ánh đúng thực tế phân quyền đó, hoặc phải điều chỉnh KPI.

---

## 15. Module 6 - Sale Enablement

### 15.1. Phạm vi

Trang tra cứu nội bộ cho EC, mở nhanh trong lúc đang tư vấn khách.

Nội dung:
- Thông tin sản phẩm: mô tả, đối tượng phù hợp, lộ trình, thời lượng, hình thức học
- Bảng giá và các gói
- Lịch khai giảng gần nhất
- Chương trình khuyến mãi đang hiệu lực
- Hình ảnh báo giá, sale kit, template (nhúng hoặc link Canva)
- Kịch bản tư vấn: nguyên tắc HỎI - HIỂU - HƯỚNG, xử lý phản đối thường gặp
- Câu hỏi thường gặp

### 15.2. Yêu cầu bắt buộc

- **Mỗi mục nội dung có `valid_until`.** Khi quá hạn, hệ thống tự ẩn và cảnh báo người phụ trách. Lý do: báo giá và khuyến mãi hết hạn nằm lẫn trong tài liệu là nguồn gốc của việc EC báo sai giá cho khách.
- **Mọi nội dung có trạng thái duyệt.** Chỉ nội dung `APPROVED` mới hiển thị cho EC.
- **Áp dụng nguyên tắc chống bịa số liệu của phòng:** không đưa vào trang này bất kỳ con số, chứng nhận, cam kết kết quả, hay lời chứng thực nào chưa được xác nhận. Nội dung chưa xác nhận phải được gắn nhãn `[CẦN XÁC NHẬN]` và không được hiển thị cho EC.
- Tìm kiếm toàn văn, mở được bằng phím tắt từ mọi màn hình.
- Nút sao chép nhanh cho từng đoạn nội dung, để dán thẳng vào Zalo hoặc Messenger.

### 15.3. Ghi chú về mức độ ưu tiên

Module này có giá trị thực nhưng **không nên làm ở Phase 1**. Nó cạnh tranh nguồn lực với các module cốt lõi, và trong ngắn hạn có thể thay thế bằng một thư mục Drive được tổ chức tốt. Xếp vào Phase 3.

---

## 16. Module 7 - Data Grid kiểu Airtable

Đây là yêu cầu được nhấn mạnh là "quan trọng". Xây một component dùng chung cho mọi bảng dữ liệu trong hệ thống.

### 16.1. Tính năng bắt buộc

**Lọc:**
- Nhiều điều kiện, ghép bằng AND hoặc OR
- Nhóm điều kiện lồng nhau tối thiểu 2 cấp: `(A và B) hoặc (C và D)`
- Toán tử theo kiểu dữ liệu:
  - Chữ: chứa, không chứa, bằng, khác, rỗng, không rỗng, bắt đầu bằng
  - Số và tiền: `=`, `≠`, `>`, `>=`, `<`, `<=`, trong khoảng, rỗng
  - Ngày: đúng ngày, trước, sau, trong khoảng, hôm nay, hôm qua, 7 ngày qua, 30 ngày qua, tháng này, tháng trước, quý này, **quá hạn**, trong X ngày tới
  - Danh mục: là, không là, là một trong, không là một trong
  - Có/không: đúng, sai

**Gom nhóm:**
- Tối đa 3 cấp
- Nhóm mở rộng và thu gọn được, ghi nhớ trạng thái
- Mỗi nhóm hiển thị dòng tổng hợp: đếm, tổng, trung bình, nhỏ nhất, lớn nhất - cấu hình được theo từng cột
- Ví dụ dùng thực tế: gom lead theo Campaign rồi theo Giai đoạn, xem tổng doanh thu từng nhóm

**Sắp xếp:** nhiều cấp, kéo thả để đổi thứ tự ưu tiên.

**Cột:** ẩn hiện, kéo đổi thứ tự, ghim cột trái, chỉnh độ rộng.

**Sửa tại chỗ:** nhấp đôi để sửa, Enter lưu, Escape hủy, Tab sang ô kế. Ô bị khóa (kỳ đã chốt, không đủ quyền) hiển thị mờ.

**Chọn nhiều dòng và thao tác hàng loạt:** đổi trạng thái, phân công lại, đặt Ngày LH lại, xuất file.

**View lưu được:**
- Đặt tên, lưu toàn bộ cấu hình lọc, sắp xếp, gom nhóm, cột
- Riêng tư hoặc chia sẻ toàn đội
- Đặt view mặc định
- Chia sẻ bằng link chứa cấu hình

**Xuất dữ liệu:** CSV và XLSX, xuất đúng những gì đang lọc và những cột đang hiện. Mọi lần xuất đều ghi audit log.

**Hiệu năng:** cuộn ảo cho danh sách dài. Với quy mô dưới 5.000 dòng có thể lọc phía client, trên mức đó chuyển sang lọc phía server. Với dữ liệu hiện tại (570 lead) thì client là quá đủ và nhanh hơn.

### 16.2. Cấu trúc lưu cấu hình view

```json
{
  "filters": {
    "conjunction": "and",
    "conditions": [
      { "field": "outcome", "operator": "is", "value": "OPEN" },
      { "conjunction": "or", "conditions": [
          { "field": "next_contact_date", "operator": "is_overdue" },
          { "field": "silence_count", "operator": ">=", "value": 4 }
      ]}
    ]
  },
  "sorts": [
    { "field": "next_contact_date", "direction": "asc" },
    { "field": "silence_count", "direction": "desc" }
  ],
  "groupBy": [
    { "field": "assigned_to", "collapsed": false },
    { "field": "product_id", "collapsed": true }
  ],
  "columns": [
    { "field": "full_name", "visible": true, "width": 200, "pinned": "left" },
    { "field": "phone", "visible": true, "width": 130 },
    { "field": "revenue", "visible": true, "aggregate": "sum" }
  ],
  "rowHeight": "medium"
}
```

### 16.3. Ghi chú kỹ thuật

Component tự xây trên `filter-engine` / `aggregations` thuần (không phụ thuộc TanStack
Table). **Không** dùng thư viện grid thương mại nặng nề - quy mô dữ liệu không cần đến,
và chi phí bảo trì sẽ vượt lợi ích.

**Cuộn ảo (đã làm):** dùng `@tanstack/react-virtual`. Cả cây nhóm được **phẳng hoá**
thành một mảng "dòng nhìn thấy" (tiêu đề nhóm + dòng dữ liệu, bỏ qua con của nhóm đã
thu), rồi chỉ render cửa sổ đang thấy + overscan. Nhờ vậy gom nhóm trên vài trăm dòng
không còn giật (trước đây render toàn bộ cây). Bảng dùng `table-layout: fixed` +
`<colgroup>` (bề rộng lấy từ `view.columns[].width` → `column.defaultWidth` → mặc định
theo kiểu dữ liệu) để chiều rộng cột ổn định khi các dòng liên tục vào/ra DOM. Vùng
cuộn cao tối đa `70vh`, header dính (`position: sticky`).

Xây component này **trước** khi xây các màn hình danh sách, vì cả 5 màn hình bảng đều phụ thuộc vào nó. Đây là hạng mục nằm trên đường găng của dự án.

---

## 17. Thông báo và cảnh báo

### 17.1. Kênh

| Kênh | Phase | Ghi chú |
|---|---|---|
| Trong ứng dụng (chuông + trung tâm thông báo) | 1 | Bắt buộc |
| Email | 2 | Cho cảnh báo mức CRITICAL |
| Zalo OA | 4 | Cần đăng ký Zalo OA và API. Đánh giá sau |

**Khuyến nghị thực tế:** đừng làm push Zalo ở giai đoạn đầu. Đội chỉ 4-6 người, ngồi cùng văn phòng, và cảnh báo trong ứng dụng cộng với email là đủ. Đầu tư vào tích hợp Zalo lúc này là tối ưu sai chỗ.

### 17.2. Lịch chạy tự động

| Thời điểm (giờ Việt Nam) | Việc | Người nhận |
|---|---|---|
| 08:00 hằng ngày | Tổng hợp lead quá hạn theo từng EC, tạo thông báo | Từng EC + Trưởng phòng |
| 08:00 hằng ngày | Rà soát quy tắc R1-R5 cho tất cả campaign ON | Marketing Executive + Trưởng phòng |
| 08:00 hằng ngày | Sinh task con từ task định kỳ | Người phụ trách |
| 10:30 hằng ngày | Kiểm tra V10 - campaign ON thiếu số liệu | Marketing Executive |
| 00:30 hằng ngày | Chuyển Cold Data cho lead `silence_count >= 6` | Ghi log, không thông báo |
| Thứ Hai 08:00 | Tổng kết tuần: chỉ số chính, biến động, cảnh báo | Trưởng phòng |
| Ngày 1 hằng tháng 08:00 | Nhắc chốt số và khóa sổ tháng trước | Trưởng phòng |

Nội dung thông báo lead quá hạn phải cụ thể, không chung chung:
> "Bạn có 12 khách trễ hẹn chăm sóc, trễ nhất là 8 ngày (Nguyễn Văn A - TESOL - đã im lặng 3 lần). Mở hàng đợi."

---

## 18. Kiểm toán, khóa sổ và bảo mật

### 18.1. Vì sao phần này bắt buộc

Hệ thống này tạo ra các con số quyết định tiền thưởng. Ngay khi điều đó đúng, mọi con số đều có thể trở thành đối tượng tranh chấp: ai chốt khách này, doanh thu ghi ngày nào, ai đổi trạng thái lúc nào.

Không có audit log và khóa sổ, hệ thống sẽ không được tin, và mọi người sẽ quay lại đối chiếu bằng file riêng - tức là quay lại đúng vấn đề ban đầu.

### 18.2. Quy tắc

- Ghi audit đầy đủ cho các nhóm thao tác nêu ở Mục 7.12.
- Màn hình audit log có bộ lọc theo người, theo bảng, theo khoảng thời gian, chỉ ADMIN và MANAGER xem được.
- Trên mỗi bản ghi lead và enrollment có tab "Lịch sử thay đổi" hiển thị dạng dòng thời gian, dễ đọc.
- Khóa sổ theo tháng: sau khi khóa, dữ liệu thuộc tháng đó chỉ đọc với tất cả trừ ADMIN.
- Không cho phép tạo enrollment với `contract_date` thuộc kỳ đã khóa.

### 18.3. Bảo mật và dữ liệu cá nhân

- Mật khẩu băm bằng bcrypt, tối thiểu 10 vòng.
- Bắt buộc đổi mật khẩu ở lần đăng nhập đầu.
- Phiên đăng nhập hết hạn sau 12 giờ không hoạt động.
- Giới hạn số lần đăng nhập sai: khóa 15 phút sau 5 lần.
- HTTPS bắt buộc.
- Số điện thoại và email hiển thị đầy đủ cho EC được phân công và cấp quản lý; che một phần cho các vai trò khác.
- Mọi lần xuất dữ liệu đều ghi log kèm số dòng đã xuất.
- **Lưu ý pháp lý:** hệ thống chứa dữ liệu cá nhân của người dưới 18 tuổi. Cần rà soát cùng Phòng Pháp chế về nghĩa vụ theo Nghị định về bảo vệ dữ liệu cá nhân, đặc biệt về cơ sở pháp lý xử lý dữ liệu và thời hạn lưu trữ. Đánh dấu `[CẦN XÁC NHẬN]`.
- Cần bổ sung chính sách xóa dữ liệu: lead ở trạng thái Cold Data quá 24 tháng sẽ được ẩn danh hóa (giữ số liệu thống kê, xóa thông tin liên hệ).

---

## 19. Di chuyển dữ liệu từ Google Sheet

### 19.1. Phạm vi

Chuyển toàn bộ dữ liệu lịch sử từ `VMG_Ads_Lead_Tracker.xlsx`:
- `Lead Sheet` → `leads`, `enrollments`
- `Campaign Monitor` + `Ads tracker` → `campaigns`, `campaign_daily_metrics`
- `Kế hoạch T9` → `tasks`
- `Định nghĩa lead`, `Rule tiếp nhận`, `Quy trình tư vấn Tesol` → nội dung Sale Enablement

**Không** chuyển: `Dashboard`, `Bản sao của Dashboard`, `ADS TRACKER-` (bản trùng), `Lịch làm việc`.

### 19.2. Các bước bắt buộc trước khi nhập

**Bước 1 - Xây bảng ánh xạ campaign.**
Xuất danh sách tất cả giá trị phân biệt ở cột `Campaign ID` của Lead Sheet (38 giá trị) và cột tên campaign của Ads tracker. Đối chiếu thủ công, gộp các bản trùng ("... - Bản sao"), gán mỗi giá trị vào một `campaign.id` mới. Đây là công việc thủ công không tránh được, do dữ liệu gốc là văn bản tự do. Ước tính 2-3 giờ.

**Bước 2 - Chuẩn hóa tư vấn viên.**
Ánh xạ 15 giá trị về đúng số người thật, dùng trường `users.alias_names`. Các giá trị ghép như `Hiền/ Thy`, `Hiền/ Kiên` phải được quyết định gán cho ai (đề xuất: người đứng đầu, và ghi chú trong `consult_note`).

**Bước 3 - Chuẩn hóa ngày tháng.**
Xử lý cả kiểu datetime lẫn chuỗi `dd/mm/yyyy`. Bỏ khoảng trắng thừa. Các dòng có serial number ngày không hợp lệ (dòng 206-213) phải xuất ra danh sách riêng để xử lý tay. Ô ngày nằm nhầm ở cột `Lý do từ chối` phải được nhận diện và bỏ qua.

**Bước 4 - Suy ra `max_stage` và các mốc thời gian.**
Đây là điểm không thể khôi phục chính xác, vì sheet không lưu lịch sử. Quy tắc suy luận:
```
max_stage = stage hiện tại  (không thể biết lead từng lên cao hơn rồi rơi)
mql_at    = NULL nếu max_stage < MQL, ngược lại = received_at  [XẤP XỈ]
won_at    = ngày trong cột doanh thu nếu có, ngược lại = received_at  [XẤP XỈ]
```
**Phải đánh dấu rõ:** mọi lead di chuyển từ sheet được gắn cờ `migrated = true`. Báo cáo theo tháng cho giai đoạn trước golive phải ghi chú "số liệu ước tính từ dữ liệu di chuyển". Không được trộn lẫn số ước tính với số đo thật mà không ghi chú.

**Bước 5 - Suy ra `silence_count`.**
Không có dữ liệu để suy. Đặt tất cả về 0, trừ lead có Ngày LH lại đã quá hạn trên 30 ngày thì đặt `silence_count = 4` để chúng vào đúng nhịp escalate cuối.

**Bước 6 - Tách doanh thu thành enrollments.**
22 dòng có doanh thu. Với dòng có `stage = Chot HV` nhưng thiếu doanh thu, tạo enrollment với `gross_amount = 0` và gắn cờ `[CẦN XÁC NHẬN]`, giao EC bổ sung trong tuần đầu golive.

### 19.3. Báo cáo đối chiếu sau khi nhập

Script migration phải xuất ra một file đối chiếu bắt buộc phải được duyệt trước khi golive:

| Chỉ số | Trên sheet | Sau khi nhập | Chênh lệch | Giải thích |
|---|---|---|---|---|
| Tổng số dòng lead | | | | |
| Số lead theo từng trạng thái | | | | |
| Tổng spend | | | | |
| Tổng doanh thu | | | | |
| Số campaign | | | | Dự kiến giảm do gộp bản trùng |
| Số dòng bị loại | | | | Kèm lý do từng dòng |

### 19.4. Chiến lược chuyển đổi

**Chạy song song 2 tuần.** Trong 2 tuần đó, dữ liệu nhập vào cả web và sheet. Cuối mỗi tuần đối chiếu số. Chỉ khi hai bên khớp trong 2 tuần liên tiếp mới ngừng sheet.

**Đây là chi phí đáng bỏ ra.** Cắt chuyển đột ngột sẽ dẫn tới việc mất niềm tin ngay tuần đầu nếu có bất kỳ số nào lệch, và rất khó lấy lại.

Sau khi ngừng, sheet chuyển sang chế độ chỉ đọc, giữ nguyên làm lưu trữ, không xóa.

---

## 20. Giao diện và bộ nhận diện

### 20.1. Màu sắc

Theo bộ nhận diện VMG:

| Vai trò | Mã màu |
|---|---|
| Đỏ VMG - màu chính | `#BE202F` |
| Vàng đồng VMG - màu bổ trợ | `#8B672A` |
| Nền | Trắng và xám rất nhạt |
| Chữ | Đen 80% cho nội dung, đen 50% cho chú thích |

**Lưu ý quan trọng:** tỷ lệ 60% đỏ / 30% vàng của bộ nhận diện là quy tắc cho **ấn phẩm truyền thông**, không áp dụng cho giao diện phần mềm quản trị. Một dashboard 60% màu đỏ sẽ không đọc được và làm mất tác dụng của màu đỏ khi dùng để báo động.

Nguyên tắc áp dụng cho phần mềm:
- Đỏ VMG chỉ dùng cho: thanh điều hướng, nút hành động chính, logo
- Màu trạng thái tách riêng, không dùng màu thương hiệu: xanh lá cho tốt, hổ phách cho cảnh báo, đỏ cam cho nghiêm trọng
- Nền và bảng giữ trung tính để số liệu nổi lên

### 20.2. Chữ

Font hệ thống của giao diện: Inter hoặc Be Vietnam Pro (hỗ trợ tiếng Việt tốt). Số liệu dùng biến thể chữ số cùng chiều rộng (tabular numerals) để các cột số thẳng hàng.

Font VMG chỉ dùng cho tài liệu xuất ra, không dùng cho giao diện.

### 20.3. Nguyên tắc trình bày số

- Tiền tệ: `1.234.567 đ`, dấu chấm phân cách nghìn
- Số lớn trên thẻ chỉ số rút gọn: `12,3 tr`, `1,45 tỷ`
- Phần trăm: 1 chữ số thập phân
- Không có dữ liệu: hiển thị `-`, **không** hiển thị `0`
- Biến động: mũi tên kèm số, xanh khi tốt, đỏ khi xấu - theo chiều tốt của từng chỉ số (CPMQL giảm là xanh)

### 20.4. Giao diện di động

EC thường xuyên chăm sóc khách ngoài giờ và trên điện thoại. Ưu tiên tối ưu di động cho:
- Màn hình "Hôm nay"
- Panel chăm sóc nhanh
- Nhập lead mới

Các màn hình bảng và dashboard chấp nhận trải nghiệm cơ bản trên di động.

---

# PHẦN V - TRIỂN KHAI

## 21. Lộ trình theo giai đoạn

### Phase 0 - Nền tảng (tuần 1)
- Khởi tạo dự án, Docker Compose, CI cơ bản
- Schema đầy đủ và migration
- Xác thực, phân quyền, quản lý người dùng
- **Component Data Grid** (Mục 16) - làm trước vì mọi thứ phụ thuộc
- Dữ liệu danh mục: sản phẩm, nguồn, trạng thái

### Phase 1 - Vận hành cốt lõi (tuần 2-4)
- Module Campaign, nhập số liệu hằng ngày
- Module Lead: nhập, danh sách, chi tiết, tương tác
- Cỗ máy Ngày LH lại và escalate
- Màn hình "Hôm nay" của EC
- Kiểm tra trùng
- Enrollment và doanh thu
- Script migration và chạy đối chiếu
- Audit log

**Kết thúc Phase 1 là có thể chạy song song với sheet.**

### Phase 2 - Nhìn thấy và điều hành (tuần 5-6)
- Dashboard đầy đủ 3 tầng
- Quy tắc cảnh báo campaign R1-R5
- Tác vụ định kỳ, thông báo trong ứng dụng và email
- Khóa sổ kỳ
- Xuất báo cáo

**Kết thúc Phase 2 là có thể ngừng sheet.**

### Phase 3 - Quản trị đội (tuần 7-9)
- Module Task
- Module KPI
- Dashboard cho VIEWER
- Sale Enablement

### Phase 4 - Mở rộng (sau khi ổn định, đánh giá lại nhu cầu)
- Tích hợp Meta Marketing API để tự kéo spend
- Push Zalo OA
- Xuất dữ liệu sang DotB EMS
- Chấm điểm lead tự động

**Cảnh báo về tiến độ:** ước tính trên giả định một người làm toàn thời gian cùng Claude Code. Nếu việc phát triển là kiêm nhiệm bên cạnh công việc phòng, nhân đôi thời gian. Đừng cam kết với BOD theo con số lạc quan.

---

## 22. Tiêu chí nghiệm thu

### 22.1. Kịch bản kiểm thử bắt buộc

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| T01 | Tạo lead mới, chuyển lên MQL, rồi chuyển outcome sang LOST | Số đếm MQL **không giảm**. `max_stage` vẫn là MQL |
| T02 | Tạo lead trùng tên với lead cũ cùng campaign trong 3 ngày | Hiện cảnh báo vàng, cho phép tạo mới |
| T03 | Tạo lead trùng số điện thoại | Hiện cảnh báo đỏ, mặc định gợi ý gộp |
| T04 | Ghi interaction kết quả Không phản hồi lần thứ 3 | Ngày LH lại tự điền T+3, gợi ý kịch bản kèm ưu đãi |
| T05 | Ghi interaction Không phản hồi lần thứ 6 | Lead tự chuyển Cold Data, outcome = LOST |
| T06 | Đặt outcome = WON mà chưa có enrollment | Bị chặn |
| T07 | Tạo enrollment | Lead tự chuyển WON, ghi `won_at` |
| T08 | Campaign chi 950.000đ, chưa có MQL | Cảnh báo CRITICAL R1 xuất hiện trên dashboard |
| T09 | Campaign CPMQL 14 ngày = 700.000đ, target 600.000đ | Cảnh báo WARNING R3 |
| T10 | Sửa spend của một ngày thuộc kỳ đã khóa | Bị chặn với vai trò MANAGER, cho phép với ADMIN kèm log |
| T11 | Lọc lead: `(outcome = OPEN và quá hạn) hoặc silence_count >= 4`, gom nhóm theo EC rồi theo sản phẩm | Kết quả đúng, dòng tổng theo nhóm đúng |
| T12 | Lưu view, đăng xuất, đăng nhập lại | View được khôi phục nguyên trạng |
| T13 | Vai trò MARKETING mở lead và thử đổi trạng thái | Không thấy nút sửa trạng thái |
| T14 | Vai trò VIEWER mở dashboard | Không thấy số điện thoại, không thấy tên lead |
| T15 | Xem CPMQL của 3 ngày gần nhất | Hiển thị cảnh báo dữ liệu chưa chín |
| T16 | Đối chiếu tổng spend, tổng doanh thu, số MQL giữa dashboard và bảng chi tiết | Khớp tuyệt đối |
| T17 | Chạy migration trên bản sao dữ liệu | Báo cáo đối chiếu không có chênh lệch ngoài dự kiến |
| T18 | Khôi phục hệ thống từ bản backup | Thành công, dữ liệu nguyên vẹn |

### 22.2. Điều kiện golive

- Toàn bộ T01-T18 đạt
- Chạy song song 2 tuần, số liệu khớp 2 tuần liên tiếp
- Đã kiểm thử khôi phục backup thành công
- Đã có `RUNBOOK.md`
- Đã đào tạo và mỗi người dùng đã tự thao tác được nghiệp vụ của mình

---

## 23. Rủi ro và biện pháp

| # | Rủi ro | Mức | Biện pháp |
|---|---|---|---|
| R01 | EC quay lại dùng sheet vì web chậm hơn | **Cao** | Ràng buộc UX cứng Mục 11.3, đo thời gian nhập lead thực tế trong tuần đầu, sửa ngay nếu vượt 30 giây |
| R02 | Marketing không nhập số liệu hằng ngày, dashboard rỗng | **Cao** | Cảnh báo V10, đưa `DATA_COMPLIANCE` thành KPI có trọng số |
| R03 | Số liệu web lệch số liệu sheet trong giai đoạn song song, mất niềm tin | **Cao** | Báo cáo đối chiếu Mục 19.3, giải thích từng chênh lệch trước khi golive |
| R04 | Một người duy nhất hiểu hệ thống, nghỉ là tắc | **Cao** | RUNBOOK, hạ tầng dạng file trong repo, spec này được cập nhật liên tục |
| R05 | Phình phạm vi, không bao giờ golive | Trung bình | Danh sách phi mục tiêu Mục 2.3 được đóng băng, mọi bổ sung đẩy sang Phase 4 |
| R06 | Ngưỡng CPMQL sai dẫn tới kill nhầm campaign tốt | Trung bình | Ngưỡng theo sản phẩm, màn hình gợi ý ngưỡng, xem 9.5 |
| R07 | Tranh chấp tính công khi lead chuyển tay | Trung bình | Chốt quy tắc QĐ05 trước golive |
| R08 | Rò rỉ dữ liệu cá nhân | Trung bình | Phân quyền chặt, che số điện thoại, log mọi lần xuất |
| R09 | Mất dữ liệu do sự cố VPS | Trung bình | Backup hằng ngày ra nơi thứ hai, kiểm thử khôi phục |
| R10 | Dữ liệu di chuyển bị coi là số đo thật | Thấp | Gắn cờ `migrated`, ghi chú trên mọi báo cáo giai đoạn cũ |


---

## 24. Quyết định còn treo - PHẢI CHỐT TRƯỚC KHI CODE

Đây là mục quan trọng nhất của tài liệu đối với anh. Mỗi mục dưới đây là một chỗ tôi **không thể tự quyết** vì thiếu thông tin hoặc vì đó là quyết định quản trị, không phải quyết định kỹ thuật. Nếu code trên giả định, chi phí sửa về sau sẽ rất lớn.

| Mã | Câu hỏi | Ảnh hưởng tới | Khuyến nghị của tôi | Hạn chốt |
|---|---|---|---|---|
| **QĐ01** | Khối số ở `Campaign Monitor` cột T-U (FT15: 250.000 / Express: 200.000 / TESOL: 490.000 / Giao tiếp: 100.000) là ngưỡng CPMQL theo sản phẩm hay ngân sách ngày? | Toàn bộ quy tắc cảnh báo | Nếu là ngưỡng CPMQL thì dùng ngay, thay cho hằng số 600.000 | Trước Phase 2 |
| **QĐ02** | Giá niêm yết chính thức của từng sản phẩm và room CAC thực tế do TCKT xác nhận | Công thức suy ngưỡng CPMQL, Mục 9.5 | Lấy từ mô hình tài chính của P.TCKT, không tự đặt | Trước Phase 2 |
| **QĐ03** | Cửa sổ đo CPMQL để ra quyết định kill: lifetime, rolling 14 ngày, hay cả hai? | Quy tắc R1-R5 | Cả hai, như đã đề xuất ở 9.4 | Trước Phase 2 |
| **QĐ04** | EC có được xem lead của EC khác không? | Phân quyền | Có, chỉ đọc | Trước Phase 1 |
| **QĐ05** | Lead chuyển từ EC A sang EC B rồi chốt: ai được tính HVM và doanh thu cho KPI/thưởng? | KPI, thưởng, báo cáo nhân sự | Tính cho người chốt (`assigned_to` tại thời điểm tạo enrollment), nhưng lưu thêm `originally_assigned_to` để tra cứu khi có tranh chấp | **Trước Phase 1** |
| **QĐ06** | Lead nguồn Organic và Giới thiệu có được tính vào MQL của KPI EC không? | KPI | Có, vì EC vẫn phải chăm sóc. Nhưng **không** tính vào chỉ số campaign | Trước Phase 3 |
| **QĐ07** | Chi phí KOL/KOC hiện được ghi nhận ở đâu? | Chỉ tiêu `REVENUE_AFTER_MKT` trọng số 40% | Cần bảng `other_costs` trong hệ thống, nếu không chỉ tiêu này phải nhập tay | Trước Phase 3 |
| **QĐ08** | Có kết nối Meta Marketing API để tự kéo spend không? | Phạm vi Phase 4, và cách thiết kế bảng `campaign_daily_metrics` | Không ở giai đoạn đầu. Nhưng thiết kế bảng đã sẵn sàng: chỉ cần thêm cột `source = MANUAL/API` | Phase 4 |
| **QĐ09** | Hạ tầng cụ thể: nhà cung cấp VPS, ai chịu trách nhiệm vận hành, ai là người dự phòng? | Toàn bộ | Xem cảnh báo ở 5.3 về rủi ro một người | **Trước Phase 0** |
| **QĐ10** | Có cần dữ liệu B2G và các sản phẩm ngoài TMĐT trong hệ thống này không? | Phạm vi | Không. Giữ hệ thống chỉ cho TMĐT. Mở rộng sang toàn phòng là dự án khác | Trước Phase 0 |
| **QĐ11** | Chính sách lưu trữ và xóa dữ liệu cá nhân, đặc biệt với người dưới 18 tuổi | Tuân thủ pháp lý | Rà soát cùng Phòng Pháp chế | Trước golive |
| **QĐ12** | Hệ thống này quan hệ thế nào với quyết định One Data Architecture A1/A2/A3 sẽ chốt cuối 2026? | Chiến lược | **Xem phân tích bên dưới** | **Trước Phase 0** |

### Ghi chú riêng cho QĐ12 - điểm cần cân nhắc nghiêm túc nhất

Phòng đang có một quyết định kiến trúc dữ liệu lớn treo đến cuối 2026: chọn giữa A1 (Kwise), A2 (tự xây cùng đối tác ngoài), A3 (vendor khác), với Kịch bản B làm cầu tạm một năm. Nguyên tắc đã chốt xuyên suốt là "Quy trình - Con người - Nền tảng".

Dự án web này, nếu không định vị rõ, có thể trở thành **một biến số làm phức tạp thêm quyết định đó**: sáu tháng nữa khi BOD chọn A, sẽ có câu hỏi "vậy cái web TMĐT tự xây kia thì sao, có phải bỏ đi không, có phải tích hợp không".

Hai cách định vị, và tôi khuyến nghị cách thứ hai:

**Cách 1 - Coi đây là ứng cử viên cho hướng A2 (tự xây).**
Rủi ro cao. Một công cụ vận hành cho 6 người rất khác một EMIS cho 44.000 học viên và 10 trung tâm. Việc dùng thành công công cụ nhỏ để lập luận rằng tự xây được hệ thống lớn là một bước nhảy logic không có cơ sở, và nếu BOD tin theo rồi thất bại thì hậu quả thuộc về phòng.

**Cách 2 - Coi đây là công cụ vận hành chuyên biệt của TMĐT, nằm ngoài phạm vi quyết định A.**
Lập luận: đây là lớp **pre-enrollment**, xử lý khách hàng tiềm năng trước khi trở thành học viên. DotB EMS và mọi phương án A đều xử lý lớp **post-enrollment**. Hai lớp này khác nhau về bản chất dữ liệu và vòng đời. Việc có một công cụ riêng cho lớp trước là chuẩn mực phổ biến, không mâu thuẫn với bất kỳ phương án A nào.

Nếu chọn cách 2, cần nói rõ ngay trong tài liệu trình BOD (nếu có): **hệ thống này không tranh chấp phạm vi với One Data Architecture, và điểm bàn giao dữ liệu là thời điểm chốt học viên.** Điều này bảo vệ dự án khỏi bị cuốn vào cuộc tranh luận A1/A2/A3, đồng thời tránh cho phòng bị hiểu là đang tự ý xây EMIS song song.

Có một lợi ích phụ đáng kể nếu định vị đúng: sau 6-12 tháng vận hành, phòng sẽ có dữ liệu thực về những gì một hệ thống quản trị khách hàng cần - danh sách trường thực dùng, quy trình thực chạy, chỗ nào nhân sự làm sai. Đây là đầu vào có giá trị cho việc viết yêu cầu của phương án A, đúng theo nguyên tắc "Quy trình là gốc". Nhưng đó là **sản phẩm phụ**, không phải mục tiêu, và không nên dùng làm lý do biện minh cho dự án.

---

## PHỤ LỤC A - Ánh xạ cột từ file sheet sang hệ thống

### A.1. `Lead Sheet`

| Cột sheet | Trường hệ thống | Ghi chú xử lý |
|---|---|---|
| STT | (bỏ) | Thay bằng `leads.code` sinh tự động |
| Ngay tiep nhan | `received_at` | Chuẩn hóa cả kiểu date lẫn chuỗi dd/mm/yyyy |
| Ho ten | `full_name` + `name_normalized` | |
| So dien thoai | `phone` + `phone_normalized` | |
| Email/Page | `email` hoặc `fb_profile` | Tách theo định dạng: có `@` thì là email |
| SP quan tam (raw) | `product_raw` | |
| SP (chuan) | `product_id` | Ánh xạ theo bảng 4.5 |
| Ghi chu MKT | `consult_note` (thêm tiền tố "MKT:") | |
| Nguon/Kenh | `source` | Ánh xạ theo bảng 4.6, chuẩn hóa `Gioi thieu` → `REFERRAL` |
| Campaign ID (dropdown) | `campaign_id` | **Cần bảng ánh xạ thủ công**, xem 19.2 bước 1 |
| Co SDT (auto) | (bỏ) | Trở thành trường tính: `phone IS NOT NULL` |
| Trang Thai (dropdown) | `stage` + `outcome` + `max_stage` | Tách theo bảng dưới |
| Tu van vien | `assigned_to` | Ánh xạ qua `alias_names` |
| Ghi chu Tu Van | `consult_note` | |
| Ngay LH lai | `next_contact_date` | Chuẩn hóa, loại giá trị không hợp lệ |
| Ly do tu choi | `lost_reason` | Có ô chứa nhầm giá trị ngày, phải lọc |
| Ket qua Placement Test | `placement_test_result` | |
| Comment xep lop | `consult_note` (nối thêm) | |
| Xep lop | `class_assigned` | |
| Lich ranh | `preferred_schedule` | |
| Ngay muon hoc | `desired_start_date` | |
| Match lop | `class_assigned` (nối) | |
| Doanh thu | `enrollments.gross_amount` | Tạo bản ghi enrollment |

**Ánh xạ trạng thái:**

| Giá trị sheet | `stage` | `outcome` | `max_stage` |
|---|---|---|---|
| New | `NEW` | `OPEN` | `NEW` |
| KLH duoc | `NO_CONTACT` | `OPEN` | `NO_CONTACT` |
| Da tu van | `CONSULTING` | `OPEN` | `CONSULTING` |
| MQL | `MQL` | `OPEN` | `MQL` |
| SQL | `SQL` | `OPEN` | `SQL` |
| Chot HV | `WON` | `WON` | `WON` |
| Khong chot | `CONSULTING` | `LOST` | `MQL` (giả định, vì đã tư vấn đủ mới không chốt) |
| Khong nhu cau | `NEW` | `DISQUALIFIED` | `NEW` |

Giả định ở dòng "Khong chot" cần được anh xác nhận. Nếu không đồng ý, đặt `max_stage = CONSULTING` và số MQL lịch sử sẽ thấp hơn 24 đơn vị.

### A.2. `Campaign Monitor` và `Ads tracker`

| Cột sheet | Trường hệ thống |
|---|---|
| ID Campaign (rút gọn) / Tên Campaign | `campaigns.display_name` + `external_id` (tách phần "ID: ...") |
| SP | `campaigns.product_id` |
| Kênh | `campaigns.channel` |
| Status | `campaigns.status` |
| Spend thực (VND) | `campaign_daily_metrics.spend` |
| Lead + mess | `campaign_daily_metrics.messages` |
| MQL (file gốc) | (bỏ) - thay bằng tính từ bản ghi lead |
| SQL / HV Chot / Leads / MQL (auto LS) | (bỏ) - trở thành chỉ số tính |
| CPL / CPMQL / CAC / Conv | (bỏ) - trở thành chỉ số tính |
| Owner | `campaigns.owner_id` |
| Budget/ngày | `campaigns.daily_budget` |
| Tháng / Tuần | (bỏ) - suy từ `metric_date` |

### A.3. `Kế hoạch T9`

| Cột sheet | Trường hệ thống |
|---|---|
| Nhóm | `tasks.group_code` |
| Đầu việc | `tasks.title` + `description` |
| Mục tiêu / KPI | `tasks.goal_kpi` |
| Vai trò chính | `tasks.assignee_id` + `co_assignees` |
| Timeline | `tasks.due_date` |
| Trạng thái | `tasks.status` (Chưa làm → TODO, Đang làm → IN_PROGRESS, Hoàn thành → DONE) |
| Link | `tasks.link_url` |

---

## PHỤ LỤC B - Danh sách kiểm tra khi bắt đầu code với Claude Code

Trước phiên đầu tiên:

- [ ] Chốt QĐ09 (hạ tầng), QĐ10 (phạm vi), QĐ12 (định vị) - ba quyết định này ảnh hưởng đến toàn bộ dự án
- [ ] Chốt QĐ04, QĐ05 - ảnh hưởng schema
- [ ] Tạo repo, commit spec này tại `/docs/SPEC.md`
- [ ] Tạo `CLAUDE.md` ở gốc repo với nội dung: trỏ tới SPEC.md, nêu 5 nguyên tắc bất di bất dịch (một nguồn công thức duy nhất, không tính chỉ số ở client, mọi giờ theo `Asia/Ho_Chi_Minh`, soft delete, audit đầy đủ)
- [ ] Xuất dữ liệu sheet thành CSV sạch, đặt tại `/data/seed/`
- [ ] Hoàn thành bảng ánh xạ campaign thủ công (19.2 bước 1)

Thứ tự làm việc đề nghị với Claude Code:
1. Schema và migration trước, có seed dữ liệu giả để test
2. Viết `metrics.ts` và **unit test cho nó trước khi làm giao diện**. Đây là phần dễ sai nhất và cũng là phần quan trọng nhất
3. Data Grid
4. Các màn hình theo thứ tự Phase

---

*Hết tài liệu. Mọi thay đổi nghiệp vụ phải cập nhật tại đây trước khi sửa code.*
