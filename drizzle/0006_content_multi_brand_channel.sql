ALTER TABLE "content_items" ADD COLUMN "brand_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "channels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Backfill: dòng cũ chỉ có 1 brand/1 kênh → mảng 1 phần tử.
UPDATE "content_items" SET "brand_ids" = ARRAY["brand_id"] WHERE cardinality("brand_ids") = 0;--> statement-breakpoint
UPDATE "content_items" SET "channels" = ARRAY["channel"] WHERE cardinality("channels") = 0;
