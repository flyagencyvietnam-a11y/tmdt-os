-- Request chỉ là sổ ghi nhận task được order, không có bước tiếp nhận/duyệt (SPEC Phụ lục D mục 25).
-- Bảng định tuyến không còn dùng. Trạng thái cũ new/accepted/in_review gộp về in_progress.
ALTER TABLE "request_routing" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "request_routing" CASCADE;--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "status" SET DEFAULT 'in_progress';--> statement-breakpoint
UPDATE "requests" SET "status" = 'in_progress' WHERE "status" IN ('new', 'accepted', 'in_review');
