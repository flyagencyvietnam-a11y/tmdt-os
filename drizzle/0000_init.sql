CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'LOCK', 'UNLOCK');--> statement-breakpoint
CREATE TYPE "public"."campaign_channel" AS ENUM('FB', 'GOOGLE', 'TIKTOK', 'KHAC');--> statement-breakpoint
CREATE TYPE "public"."campaign_objective" AS ENUM('MESSAGE', 'LEADFORM', 'TRAFFIC', 'KHAC');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('ON', 'OFF', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."disqualify_reason" AS ENUM('SPAM', 'WRONG_TARGET', 'COMPETITOR', 'DUPLICATE', 'KHAC');--> statement-breakpoint
CREATE TYPE "public"."interaction_channel" AS ENUM('CALL', 'ZALO', 'MESSENGER', 'EMAIL', 'SMS', 'MEET');--> statement-breakpoint
CREATE TYPE "public"."interaction_direction" AS ENUM('OUTBOUND', 'INBOUND');--> statement-breakpoint
CREATE TYPE "public"."interaction_result" AS ENUM('RESPONDED', 'NO_RESPONSE', 'REFUSED', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."kpi_direction" AS ENUM('HIGHER_BETTER', 'LOWER_BETTER');--> statement-breakpoint
CREATE TYPE "public"."kpi_period_type" AS ENUM('MONTH', 'QUARTER', 'YEAR');--> statement-breakpoint
CREATE TYPE "public"."kpi_scope_type" AS ENUM('USER', 'TEAM', 'PRODUCT');--> statement-breakpoint
CREATE TYPE "public"."kpi_source" AS ENUM('AUTO', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."kpi_unit" AS ENUM('COUNT', 'VND', 'PERCENT', 'RATIO');--> statement-breakpoint
CREATE TYPE "public"."lead_outcome" AS ENUM('OPEN', 'WON', 'LOST', 'DISQUALIFIED');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('FB', 'GOOGLE', 'TIKTOK', 'ZALO', 'HOTLINE', 'ORGANIC', 'REFERRAL', 'KHAC');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('NEW', 'NO_CONTACT', 'CONSULTING', 'MQL', 'SQL', 'WON');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('INFO', 'WARNING', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('OVERDUE_LEADS', 'CAMPAIGN_ALERT', 'TASK_DUE', 'KPI_RISK', 'DATA_GAP', 'ASSIGNMENT');--> statement-breakpoint
CREATE TYPE "public"."other_cost_type" AS ENUM('KOL_KOC', 'TOOL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'MANAGER', 'MARKETING', 'EC', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."saved_view_entity" AS ENUM('LEADS', 'CAMPAIGNS', 'TASKS', 'DAILY_METRICS', 'ENROLLMENTS');--> statement-breakpoint
CREATE TYPE "public"."saved_view_visibility" AS ENUM('PRIVATE', 'SHARED');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('PROJECT', 'RECURRING', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text NOT NULL,
	"role" "role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"alias_names" text[],
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"list_price" bigint,
	"cac_room_pct" numeric(5, 2) DEFAULT '15.00',
	"target_cpmql" bigint DEFAULT 600000,
	"kill_threshold_no_mql" bigint DEFAULT 900000,
	"budget_share_pct" numeric(5, 2),
	"priority" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "campaign_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"metric_date" date NOT NULL,
	"spend" bigint NOT NULL,
	"messages" integer NOT NULL,
	"entered_by" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_daily_metrics_campaign_date_uq" UNIQUE("campaign_id","metric_date"),
	CONSTRAINT "cdm_spend_nonneg" CHECK ("campaign_daily_metrics"."spend" >= 0),
	CONSTRAINT "cdm_messages_nonneg" CHECK ("campaign_daily_metrics"."messages" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_code" text NOT NULL,
	"display_name" text NOT NULL,
	"external_id" text,
	"product_id" uuid NOT NULL,
	"channel" "campaign_channel" NOT NULL,
	"objective" "campaign_objective",
	"owner_id" uuid NOT NULL,
	"status" "campaign_status" DEFAULT 'ON' NOT NULL,
	"daily_budget" bigint,
	"started_on" date NOT NULL,
	"ended_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "campaigns_internal_code_unique" UNIQUE("internal_code")
);
--> statement-breakpoint
CREATE TABLE "lead_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" "interaction_channel" NOT NULL,
	"direction" "interaction_direction" NOT NULL,
	"result" "interaction_result" NOT NULL,
	"content" text,
	"stage_before" "lead_stage",
	"stage_after" "lead_stage",
	"next_contact_date_set" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_stage" "lead_stage",
	"to_stage" "lead_stage",
	"from_outcome" "lead_outcome",
	"to_outcome" "lead_outcome",
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"full_name" text NOT NULL,
	"name_normalized" text,
	"phone" text,
	"phone_normalized" text,
	"email" text,
	"fb_profile" text,
	"product_id" uuid NOT NULL,
	"product_raw" text,
	"source" "lead_source" NOT NULL,
	"campaign_id" uuid,
	"stage" "lead_stage" DEFAULT 'NEW' NOT NULL,
	"max_stage" "lead_stage" DEFAULT 'NEW' NOT NULL,
	"outcome" "lead_outcome" DEFAULT 'OPEN' NOT NULL,
	"assigned_to" uuid,
	"originally_assigned_to" uuid,
	"next_contact_date" date,
	"silence_count" integer DEFAULT 0 NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"mql_at" timestamp with time zone,
	"sql_at" timestamp with time zone,
	"won_at" timestamp with time zone,
	"lost_reason" text,
	"disqualify_reason" "disqualify_reason",
	"is_cold" boolean DEFAULT false NOT NULL,
	"consult_note" text,
	"placement_test_result" text,
	"class_assigned" text,
	"preferred_schedule" text,
	"desired_start_date" date,
	"duplicate_of" uuid,
	"migrated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "leads_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"contract_date" date NOT NULL,
	"gross_amount" bigint NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint GENERATED ALWAYS AS (gross_amount - discount_amount) STORED,
	"collected_amount" bigint DEFAULT 0 NOT NULL,
	"student_count" integer DEFAULT 1 NOT NULL,
	"credited_to" uuid,
	"ems_student_id" text,
	"note" text,
	"needs_revenue_confirmation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "enrollments_gross_positive" CHECK ("enrollments"."gross_amount" > 0),
	CONSTRAINT "enrollments_discount_nonneg" CHECK ("enrollments"."discount_amount" >= 0),
	CONSTRAINT "enrollments_collected_nonneg" CHECK ("enrollments"."collected_amount" >= 0),
	CONSTRAINT "enrollments_student_count_positive" CHECK ("enrollments"."student_count" > 0),
	CONSTRAINT "enrollments_collected_le_net" CHECK ("enrollments"."collected_amount" <= "enrollments"."gross_amount" - "enrollments"."discount_amount")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"group_code" text,
	"product_id" uuid,
	"type" "task_type" DEFAULT 'PROJECT' NOT NULL,
	"assignee_id" uuid NOT NULL,
	"co_assignees" uuid[],
	"goal_kpi" text,
	"due_date" date,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"priority" "task_priority" DEFAULT 'NORMAL' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"recurrence_rule" text,
	"parent_task_id" uuid,
	"link_url" text,
	"blocked_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_progress_range" CHECK ("tasks"."progress_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "kpi_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_definition_id" uuid NOT NULL,
	"period_type" "kpi_period_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"scope_type" "kpi_scope_type" NOT NULL,
	"user_id" uuid,
	"product_id" uuid,
	"target_value" numeric NOT NULL,
	"weight_pct" numeric(5, 2) NOT NULL,
	"threshold_tiers" jsonb DEFAULT '[{"pct":85},{"pct":90},{"pct":100}]'::jsonb,
	"manual_actual" numeric,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" "kpi_unit" NOT NULL,
	"direction" "kpi_direction" DEFAULT 'HIGHER_BETTER' NOT NULL,
	"source" "kpi_source" NOT NULL,
	"formula_key" text,
	"description" text,
	CONSTRAINT "kpi_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "other_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cost_type" "other_cost_type" DEFAULT 'KOL_KOC' NOT NULL,
	"incurred_on" date NOT NULL,
	"product_id" uuid,
	"amount" bigint NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" "audit_action" NOT NULL,
	"changes" jsonb,
	"ip" "inet"
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holiday_date" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "holidays_holiday_date_unique" UNIQUE("holiday_date")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"severity" "notification_severity" DEFAULT 'INFO' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" uuid,
	"unlocked_at" timestamp with time zone,
	"unlocked_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" "saved_view_entity" NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "saved_view_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_daily_metrics" ADD CONSTRAINT "campaign_daily_metrics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_daily_metrics" ADD CONSTRAINT "campaign_daily_metrics_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interactions" ADD CONSTRAINT "lead_interactions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_interactions" ADD CONSTRAINT "lead_interactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_originally_assigned_to_users_id_fk" FOREIGN KEY ("originally_assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_credited_to_users_id_fk" FOREIGN KEY ("credited_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_kpi_definition_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_definition_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_costs" ADD CONSTRAINT "other_costs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_costs" ADD CONSTRAINT "other_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "cdm_date_idx" ON "campaign_daily_metrics" USING btree ("metric_date");--> statement-breakpoint
CREATE INDEX "campaigns_product_idx" ON "campaigns" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_owner_idx" ON "campaigns" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lead_interactions_lead_idx" ON "lead_interactions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_interactions_occurred_idx" ON "lead_interactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "lead_stage_history_lead_idx" ON "lead_stage_history" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_next_contact_outcome_idx" ON "leads" USING btree ("next_contact_date","outcome");--> statement-breakpoint
CREATE INDEX "leads_campaign_maxstage_idx" ON "leads" USING btree ("campaign_id","max_stage");--> statement-breakpoint
CREATE INDEX "leads_assigned_next_idx" ON "leads" USING btree ("assigned_to","next_contact_date");--> statement-breakpoint
CREATE INDEX "leads_mql_at_idx" ON "leads" USING btree ("mql_at");--> statement-breakpoint
CREATE INDEX "leads_won_at_idx" ON "leads" USING btree ("won_at");--> statement-breakpoint
CREATE INDEX "leads_sql_at_idx" ON "leads" USING btree ("sql_at");--> statement-breakpoint
CREATE INDEX "leads_name_normalized_idx" ON "leads" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX "leads_phone_normalized_idx" ON "leads" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "leads_product_idx" ON "leads" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "enrollments_lead_idx" ON "enrollments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "enrollments_contract_date_idx" ON "enrollments" USING btree ("contract_date");--> statement-breakpoint
CREATE INDEX "enrollments_product_idx" ON "enrollments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "enrollments_credited_idx" ON "enrollments" USING btree ("credited_to");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "kpi_assign_period_idx" ON "kpi_assignments" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "kpi_assign_user_idx" ON "kpi_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "other_costs_incurred_idx" ON "other_costs" USING btree ("incurred_on");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "period_locks_range_idx" ON "period_locks" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "saved_views_entity_owner_idx" ON "saved_views" USING btree ("entity","owner_id");