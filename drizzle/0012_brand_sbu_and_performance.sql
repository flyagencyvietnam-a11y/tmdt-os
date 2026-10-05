ALTER TYPE "public"."sbu_kind" ADD VALUE 'brand';--> statement-breakpoint
ALTER TYPE "public"."sbu_region" ADD VALUE 'BRAND';--> statement-breakpoint
CREATE TABLE "brand_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sbu_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"label" text,
	"url" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "brand_perf_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sbu_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"period" text NOT NULL,
	"impressions" numeric(14, 0),
	"reach" numeric(14, 0),
	"engagements" numeric(14, 0),
	"video_views" numeric(14, 0),
	"link_clicks" numeric(14, 0),
	"sessions" numeric(14, 0),
	"posts" numeric(10, 0),
	"followers" numeric(14, 0),
	"new_followers" numeric(14, 0),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sbus" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "brand_channels" ADD CONSTRAINT "brand_channels_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_perf_metrics" ADD CONSTRAINT "brand_perf_metrics_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_channels_uniq" ON "brand_channels" USING btree ("sbu_id","channel");--> statement-breakpoint
CREATE INDEX "brand_channels_sbu_idx" ON "brand_channels" USING btree ("sbu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_perf_uniq" ON "brand_perf_metrics" USING btree ("sbu_id","channel","period");--> statement-breakpoint
CREATE INDEX "brand_perf_period_idx" ON "brand_perf_metrics" USING btree ("period");--> statement-breakpoint
ALTER TABLE "sbus" ADD CONSTRAINT "sbus_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;