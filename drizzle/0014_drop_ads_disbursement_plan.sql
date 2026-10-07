-- Kế hoạch giải ngân đã được gộp vào ads_plans ở migration 0013. Chỉ xoá bảng cũ khi MỌI dòng của nó đã có mặt ở ads_plans
-- (cùng mảng, tháng, ngân sách) — nếu thiếu thì dừng migration, không mất dữ liệu.
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM "ads_disbursement_plan" d
  WHERE NOT EXISTS (
    SELECT 1 FROM "ads_plans" p
    WHERE p."line" = d."line" AND p."period" = d."period" AND p."sbu_id" IS NULL AND p."planned_budget" IS NOT NULL
  );
  IF missing > 0 THEN
    RAISE EXCEPTION 'ads_disbursement_plan còn % dòng chưa có trong ads_plans — dừng, không xoá bảng', missing;
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE "ads_disbursement_plan" CASCADE;
