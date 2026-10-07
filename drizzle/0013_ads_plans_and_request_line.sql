CREATE TABLE "ads_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line" "ads_line" NOT NULL,
	"period" text NOT NULL,
	"sbu_id" uuid,
	"planned_budget" numeric(14, 0),
	"target_leads" numeric(10, 0),
	"target_new_students" numeric(10, 0),
	"target_messages" numeric(10, 0),
	"target_mql" numeric(10, 0),
	"target_revenue" numeric(14, 0),
	"target_deals" numeric(10, 0),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ads_campaigns" ALTER COLUMN "sbu_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ads_campaigns" ADD COLUMN "line" "ads_line" DEFAULT 'b2c_center' NOT NULL;--> statement-breakpoint
ALTER TABLE "ads_plans" ADD CONSTRAINT "ads_plans_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ads_plans_period_idx" ON "ads_plans" USING btree ("period");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_plans_uniq" ON "ads_plans" USING btree ("line","period",coalesce("sbu_id", '00000000-0000-0000-0000-000000000000'));--> statement-breakpoint
CREATE INDEX "ads_campaigns_line_idx" ON "ads_campaigns" USING btree ("line");--> statement-breakpoint
-- Gộp kế hoạch giải ngân cũ vào kế hoạch tháng (mỗi dòng = ngân sách kế hoạch của 1 mảng/tháng, không trung tâm).
INSERT INTO "ads_plans" ("line", "period", "planned_budget", "notes", "created_at", "updated_at", "created_by", "updated_by")
SELECT d."line", d."period", d."planned_amount", d."notes", d."created_at", d."updated_at", d."created_by", d."updated_by"
FROM "ads_disbursement_plan" d
ON CONFLICT DO NOTHING;
