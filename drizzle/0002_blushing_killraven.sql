CREATE TYPE "public"."ads_status" AS ENUM('planned', 'running', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."monitoring_alert" AS ENUM('overdue', 'due_soon', 'ok', 'no_data');--> statement-breakpoint
CREATE TYPE "public"."monitoring_kind" AS ENUM('posm', 'signage', 'ooh', 'google_maps', 'vmp_booth', 'exam_room', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_export_kind" AS ENUM('weekly_summary', 'monthly_summary', 'bod_schedule');--> statement-breakpoint
ALTER TYPE "public"."import_template" ADD VALUE 'T5';--> statement-breakpoint
ALTER TYPE "public"."import_template" ADD VALUE 'T6';--> statement-breakpoint
ALTER TYPE "public"."import_template" ADD VALUE 'T7';--> statement-breakpoint
ALTER TYPE "public"."import_template" ADD VALUE 'T8';--> statement-breakpoint
ALTER TYPE "public"."import_template" ADD VALUE 'T9';--> statement-breakpoint
CREATE TABLE "content_workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid,
	"channel" text,
	"steps" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ads_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"sbu_id" uuid NOT NULL,
	"product" text,
	"channel" text,
	"objective" text,
	"center_budget" numeric(14, 0),
	"ho_budget" numeric(14, 0),
	"actual_spend" numeric(14, 0),
	"actual_leads" numeric(10, 0),
	"misa_order_code" text,
	"status" "ads_status" DEFAULT 'planned' NOT NULL,
	"report_url" text,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "monitoring_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sbu_id" uuid NOT NULL,
	"kind" "monitoring_kind" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"current_state_note" text,
	"last_updated_date" date,
	"cycle_months" integer DEFAULT 12 NOT NULL,
	"photo_url" text,
	"last_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "report_export_kind" NOT NULL,
	"period" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_workflow_templates" ADD CONSTRAINT "content_workflow_templates_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_monthly" ADD CONSTRAINT "ads_monthly_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_items" ADD CONSTRAINT "monitoring_items_last_task_id_tasks_id_fk" FOREIGN KEY ("last_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ads_monthly_period_idx" ON "ads_monthly" USING btree ("period");--> statement-breakpoint
CREATE INDEX "ads_monthly_sbu_idx" ON "ads_monthly" USING btree ("sbu_id");--> statement-breakpoint
CREATE INDEX "monitoring_items_sbu_idx" ON "monitoring_items" USING btree ("sbu_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_exports_kind_idx" ON "report_exports" USING btree ("kind","created_at");