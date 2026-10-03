CREATE TYPE "public"."ads_line" AS ENUM('b2c_system', 'b2c_center', 'ecom', 'b2b', 'osir', 'vmp');--> statement-breakpoint
CREATE TYPE "public"."ads_period_type" AS ENUM('week', 'month');--> statement-breakpoint
CREATE TABLE "ads_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sbu_id" uuid NOT NULL,
	"period" text NOT NULL,
	"campaign_name" text NOT NULL,
	"misa_request_url" text,
	"messages" numeric(10, 0),
	"reach" numeric(12, 0),
	"impressions" numeric(12, 0),
	"conversations" numeric(10, 0),
	"comments" numeric(10, 0),
	"engagements" numeric(10, 0),
	"reactions" numeric(10, 0),
	"spend" numeric(14, 0) NOT NULL,
	"spend_with_vat" numeric(14, 0),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ads_disbursement_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line" "ads_line" NOT NULL,
	"period" text NOT NULL,
	"planned_amount" numeric(14, 0) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ads_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line" "ads_line" NOT NULL,
	"period_type" "ads_period_type" DEFAULT 'month' NOT NULL,
	"period" text NOT NULL,
	"sbu_id" uuid,
	"budget" numeric(14, 0),
	"center_order_budget" numeric(14, 0),
	"ho_topup_budget" numeric(14, 0),
	"leads" numeric(10, 0),
	"new_students" numeric(10, 0),
	"messages" numeric(10, 0),
	"impressions" numeric(12, 0),
	"revenue" numeric(14, 0),
	"actual_revenue" numeric(14, 0),
	"mql" numeric(10, 0),
	"deals" numeric(10, 0),
	"misa_order_code" text,
	"status" "ads_status" DEFAULT 'planned' NOT NULL,
	"report_url" text,
	"start_date" date,
	"end_date" date,
	"center_feedback" text,
	"mkt_assessment" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ads_campaigns" ADD CONSTRAINT "ads_campaigns_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_metrics" ADD CONSTRAINT "ads_metrics_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ads_campaigns_period_idx" ON "ads_campaigns" USING btree ("period");--> statement-breakpoint
CREATE INDEX "ads_campaigns_sbu_idx" ON "ads_campaigns" USING btree ("sbu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_disbursement_plan_uniq" ON "ads_disbursement_plan" USING btree ("line","period");--> statement-breakpoint
CREATE INDEX "ads_metrics_period_idx" ON "ads_metrics" USING btree ("period");--> statement-breakpoint
CREATE INDEX "ads_metrics_sbu_idx" ON "ads_metrics" USING btree ("sbu_id");--> statement-breakpoint
CREATE INDEX "ads_metrics_line_idx" ON "ads_metrics" USING btree ("line");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_metrics_upsert_uniq" ON "ads_metrics" USING btree ("line","period_type","period",coalesce("sbu_id", '00000000-0000-0000-0000-000000000000'));