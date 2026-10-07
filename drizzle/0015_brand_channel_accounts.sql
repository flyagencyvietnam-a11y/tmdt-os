DROP INDEX "brand_channels_uniq";--> statement-breakpoint
DROP INDEX "brand_perf_uniq";--> statement-breakpoint
ALTER TABLE "brand_channels" ADD COLUMN "account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_perf_metrics" ADD COLUMN "account" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_channels_uniq" ON "brand_channels" USING btree ("sbu_id","channel","account");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_perf_uniq" ON "brand_perf_metrics" USING btree ("sbu_id","channel","account","period");