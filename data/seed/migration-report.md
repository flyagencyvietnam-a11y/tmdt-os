# Báo cáo đối chiếu migration — 2026-08-29T04:50:12.747Z

Chế độ: **COMMIT (ghi DB)**
Nguồn: `data/seed/VMG_Ads_Lead_Tracker.xlsx`

| Chỉ số | Trên sheet | Sau khi nhập | Chênh lệch | Giải thích |
|---|---:|---:|---:|---|
| Tổng số dòng lead (có họ tên) | 566 | 566 | 0 | |
| Lead trạng thái "MQL" | 356 | 356 | 0 | |
| Lead trạng thái "SQL" | 63 | 63 | 0 | |
| Lead trạng thái "(trống)" | 29 | 29 | 0 | |
| Lead trạng thái "Khong chot" | 24 | 24 | 0 | |
| Lead trạng thái "Khong nhu cau" | 24 | 24 | 0 | |
| Lead trạng thái "Chot HV" | 23 | 23 | 0 | |
| Lead trạng thái "KLH duoc" | 19 | 19 | 0 | |
| Lead trạng thái "Da tu van" | 16 | 16 | 0 | |
| Lead trạng thái "New" | 12 | 12 | 0 | |
| Dòng có doanh thu | 22 | 22 | 0 | tách thành `enrollments` |
| Tổng doanh thu | 201.747.000 | 201.747.000 | 0 | |
| Tổng spend (Campaign Monitor) | 105.645.951 | 105.645.951 | 0 | nhập dạng TỔNG/campaign tại ngày chốt số, chưa tách theo ngày |
| Tổng messages (Campaign Monitor) | 1.419 | 1.419 | 0 | |
| Giá trị campaign phân biệt | 58 | 58 | 0 | map TỰ SINH — chưa gộp bản trùng |

## Cần xử lý tay trước khi `--commit`

- ⚠️ Chưa có `data/seed/campaign-map.json`. Đã sinh `campaign-map.template.json` (58 campaign). Gộp bản trùng ("... - Bản sao"), sửa `product_code`/`channel`, đổi tên thành `campaign-map.json`, chạy lại.
- Giả định "Không chốt" → max_stage = **MQL** (SPEC Phụ lục A.1). Nếu đổi sang CONSULTING, số MQL lịch sử giảm ~24.
- 23 dòng có ngày không hợp lệ (xử lý tay): 17, 42, 76, 77, 85, 101, 180, 181, 197, 198, 200, 206, 207, 208, 209, 210, 211, 212, 213, 224, 326, 358, 364
- 1 lead "Chốt HV" KHÔNG có doanh thu → nhập là WON nhưng KHÔNG tạo enrollment (DB cấm gross_amount = 0). Cần EC bổ sung doanh thu tuần đầu golive (SPEC 19.2 bước 6).
- Sản phẩm chưa nhận diện (đưa về KHAC): "KHAC" ×16, "Test IELTS - Phước Tân" ×1
- Tư vấn viên: map qua `users.alias_names` (đã seed các biến thể). Giá trị ghép ("Hiền/ Thy") gán cho người đứng đầu + ghi chú.

> Mọi lead nhập từ sheet được đánh dấu `migrated = true`. Báo cáo giai đoạn trước golive phải ghi chú "số liệu ước tính từ dữ liệu di chuyển".
