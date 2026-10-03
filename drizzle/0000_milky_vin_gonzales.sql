CREATE TYPE "public"."assignment_mode" AS ENUM('fixed_user', 'sbu_ho_owner', 'round_robin', 'unassigned');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."brand_kind" AS ENUM('product', 'group');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('planned', 'preparing', 'running', 'paused', 'done', 'cancelled', 'needs_confirmation');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('brand_theme', 'product_gtm', 'business_program', 'rebrand', 'data_program', 'internal_program', 'other');--> statement-breakpoint
CREATE TYPE "public"."completion_behavior" AS ENUM('fixed_schedule', 'after_completion');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('brief', 'drafting', 'designing', 'in_review', 'approved', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."day_rule" AS ENUM('calendar_day', 'last_working_day', 'first_working_day');--> statement-breakpoint
CREATE TYPE "public"."dependency_type" AS ENUM('finish_to_start');--> statement-breakpoint
CREATE TYPE "public"."fan_out_mode" AS ENUM('checklist_per_owner', 'task_per_sbu');--> statement-breakpoint
CREATE TYPE "public"."foundation_status" AS ENUM('confirmed', 'needs_confirmation', 'proposed');--> statement-breakpoint
CREATE TYPE "public"."holiday_policy" AS ENUM('none', 'shift_earlier', 'shift_later');--> statement-breakpoint
CREATE TYPE "public"."import_row_result" AS ENUM('created', 'updated', 'skipped', 'error', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."import_template" AS ENUM('T1', 'T2', 'T3', 'T4');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('assigned', 'due_soon', 'due_today', 'overdue', 'escalation', 'mention', 'comment', 'status_change', 'due_change', 'assignee_change', 'blocked', 'dependency_cleared', 'request_new', 'request_due_soon', 'import_done', 'digest_daily', 'digest_weekly');--> statement-breakpoint
CREATE TYPE "public"."recurring_freq" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."request_in_scope" AS ENUM('yes', 'no', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."request_source_channel" AS ENUM('misa', 'email', 'zalo', 'direct', 'meeting', 'other');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('new', 'accepted', 'in_progress', 'in_review', 'done', 'rejected', 'postponed');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('design', 'ads', 'content', 'media', 'posm', 'event', 'consulting', 'other');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'manager', 'member', 'center_contributor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."saved_view_entity" AS ENUM('tasks');--> statement-breakpoint
CREATE TYPE "public"."saved_view_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."sbu_catalog_group" AS ENUM('online_inbound', 'online_outbound', 'offline_inbound', 'offline_outbound', 'cross');--> statement-breakpoint
CREATE TYPE "public"."sbu_item_status_value" AS ENUM('not_started', 'in_progress', 'done', 'blocked', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."sbu_item_status_source" AS ENUM('derived_from_task', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sbu_kind" AS ENUM('center', 'online_center', 'group');--> statement-breakpoint
CREATE TYPE "public"."sbu_region" AS ENUM('KV1', 'KV2', 'KV3', 'KV2_KV3', 'ONLINE', 'RND');--> statement-breakpoint
CREATE TYPE "public"."scope_mode" AS ENUM('single', 'per_sbu');--> statement-breakpoint
CREATE TYPE "public"."shoot_status" AS ENUM('planned', 'prepared', 'shot', 'editing', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('manual', 'import', 'recurring', 'content_item', 'media_shoot', 'request', 'campaign_template');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('campaign_action', 'content', 'media', 'request', 'monitoring', 'ads', 'report', 'meeting', 'general');--> statement-breakpoint
CREATE TYPE "public"."team" AS ENUM('ho_marketing', 'center', 'bod', 'other');--> statement-breakpoint
CREATE TYPE "public"."time_slot" AS ENUM('morning', 'afternoon', 'all_day');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "role" NOT NULL,
	"team" "team" DEFAULT 'ho_marketing' NOT NULL,
	"sbu_id" uuid,
	"can_assign" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"work_days" integer[] DEFAULT '{1,2,3,4,5}' NOT NULL,
	"avatar_url" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sbus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "sbu_kind" NOT NULL,
	"region" "sbu_region" NOT NULL,
	"ho_owner_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "sbus_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "brand_foundation_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"section_code" text NOT NULL,
	"component_code" text NOT NULL,
	"component_label" text NOT NULL,
	"content" text,
	"status" "foundation_status" DEFAULT 'needs_confirmation' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "brand_foundation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"content" text,
	"status" "foundation_status" NOT NULL,
	"version" integer NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "brand_kind" DEFAULT 'product' NOT NULL,
	"color" text,
	"public_name_allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "brands_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "campaign_brands" (
	"campaign_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	CONSTRAINT "campaign_brands_campaign_id_brand_id_pk" PRIMARY KEY("campaign_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "campaign_type" DEFAULT 'other' NOT NULL,
	"tagline" text,
	"occasion" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "campaign_status" DEFAULT 'planned' NOT NULL,
	"owner_id" uuid,
	"target_audience" text,
	"insight_message" text,
	"objective" text,
	"hero_activity" text,
	"cta" text,
	"channels" text,
	"role_split" text,
	"budget_note" text,
	"kpi_note" text,
	"source_note" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "campaigns_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_code" text,
	"name" text NOT NULL,
	"description" text,
	"task_template" jsonb NOT NULL,
	"freq" "recurring_freq" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"by_weekday" integer[],
	"by_month_day" integer,
	"by_nth_weekday" jsonb,
	"day_rule" "day_rule" DEFAULT 'calendar_day' NOT NULL,
	"holiday_policy" "holiday_policy" DEFAULT 'none' NOT NULL,
	"due_offset_days" integer DEFAULT 0 NOT NULL,
	"start_offset_days" integer DEFAULT 3 NOT NULL,
	"due_time" time,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"max_occurrences" integer,
	"assignment_mode" "assignment_mode" DEFAULT 'fixed_user' NOT NULL,
	"fixed_assignee_id" uuid,
	"round_robin_user_ids" uuid[],
	"scope_mode" "scope_mode" DEFAULT 'single' NOT NULL,
	"scope_sbu_ids" uuid[],
	"fan_out_mode" "fan_out_mode" DEFAULT 'checklist_per_owner' NOT NULL,
	"generation_horizon_days" integer DEFAULT 45 NOT NULL,
	"completion_behavior" "completion_behavior" DEFAULT 'fixed_schedule' NOT NULL,
	"skipped_dates" date[] DEFAULT '{}' NOT NULL,
	"campaign_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"paused_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "recurring_rules_rule_code_unique" UNIQUE("rule_code")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "task_type" DEFAULT 'general' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"blocked_reason" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"creator_id" uuid,
	"start_date" date,
	"due_date" date,
	"due_time" time,
	"time_slot" time_slot,
	"estimate_hours" numeric(6, 2),
	"completed_at" timestamp with time zone,
	"parent_id" uuid,
	"campaign_id" uuid,
	"brand_id" uuid,
	"workstream" text,
	"channel" text,
	"deliverable_url" text,
	"reference_url" text,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"source_type" "task_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"recurring_rule_id" uuid,
	"occurrence_date" date,
	"scope_key" text,
	"external_key" text,
	"import_scope" text,
	"import_batch_id" uuid,
	"manually_edited_fields" text[] DEFAULT '{}' NOT NULL,
	"sort_order" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"field" text NOT NULL,
	"from_value" jsonb,
	"to_value" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sbu_id" uuid,
	"note" text,
	"photo_url" text,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"sort_order" text DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentioned_user_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_collaborators" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_collaborators_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_confirmation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"token" text NOT NULL,
	"recipient_email" text,
	"recipient_name" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_confirmation_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL,
	"kind" "dependency_type" DEFAULT 'finish_to_start' NOT NULL,
	CONSTRAINT "task_dependencies_predecessor_id_successor_id_pk" PRIMARY KEY("predecessor_id","successor_id")
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"task_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "task_labels_task_id_label_pk" PRIMARY KEY("task_id","label")
);
--> statement-breakpoint
CREATE TABLE "task_sbus" (
	"task_id" uuid NOT NULL,
	"sbu_id" uuid NOT NULL,
	CONSTRAINT "task_sbus_task_id_sbu_id_pk" PRIMARY KEY("task_id","sbu_id")
);
--> statement-breakpoint
CREATE TABLE "task_watchers" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_watchers_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "request_routing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_type" "request_type" NOT NULL,
	"sbu_id" uuid,
	"assignee_id" uuid NOT NULL,
	"default_sla_days" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"received_date" date NOT NULL,
	"source_channel" "request_source_channel" DEFAULT 'other' NOT NULL,
	"requester_name" text NOT NULL,
	"requester_sbu_id" uuid,
	"request_type" "request_type" DEFAULT 'other' NOT NULL,
	"sbu_group" text,
	"description" text NOT NULL,
	"reference_url" text,
	"priority" text,
	"desired_date" date,
	"in_scope" "request_in_scope" DEFAULT 'needs_review' NOT NULL,
	"accepted_by_id" uuid,
	"committed_date" date,
	"completed_date" date,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"deliverable_url" text,
	"reject_reason" text,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"campaign_id" uuid,
	"sbu_id" uuid,
	"publish_date" date NOT NULL,
	"publish_time" time,
	"channel" text NOT NULL,
	"content_pillar" text,
	"topic" text NOT NULL,
	"target_audience" text,
	"key_message" text,
	"format" text,
	"resource_source" text,
	"owner_id" uuid,
	"cta" text,
	"target_metric" text,
	"support_needed" text,
	"status" "content_status" DEFAULT 'brief' NOT NULL,
	"post_url" text,
	"parent_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shoot_id" uuid NOT NULL,
	"deliverable_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"channel" text,
	"brand_id" uuid,
	"campaign_id" uuid,
	"editor_id" uuid,
	"due_date" date,
	"result_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "media_shoots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"shoot_date" date NOT NULL,
	"location" text,
	"sbu_id" uuid,
	"brand_id" uuid,
	"purpose" text,
	"crew" text,
	"equipment" text,
	"script_url" text,
	"status" "shoot_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_shoots_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sbu_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"group" "sbu_catalog_group" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"ho_plan" boolean DEFAULT false NOT NULL,
	"ho_execute" boolean DEFAULT false NOT NULL,
	"ho_control" boolean DEFAULT false NOT NULL,
	"center_role" text,
	"cycle" text,
	"priority" text,
	"reference_text" text,
	"default_recurring_rule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "sbu_catalog_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sbu_item_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"sbu_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "sbu_item_status_value" DEFAULT 'not_started' NOT NULL,
	"status_source" "sbu_item_status_source" DEFAULT 'derived_from_task' NOT NULL,
	"task_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"changes" jsonb
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holiday_date" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "holidays_holiday_date_unique" UNIQUE("holiday_date")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" "import_template" NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" uuid,
	"summary" jsonb,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"sheet" text,
	"raw_data" jsonb NOT NULL,
	"result" "import_row_result" NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"task_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" "saved_view_entity" DEFAULT 'tasks' NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" "saved_view_visibility" DEFAULT 'private' NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sbus" ADD CONSTRAINT "sbus_ho_owner_id_users_id_fk" FOREIGN KEY ("ho_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_foundation_entries" ADD CONSTRAINT "brand_foundation_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_foundation_history" ADD CONSTRAINT "brand_foundation_history_entry_id_brand_foundation_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."brand_foundation_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_foundation_history" ADD CONSTRAINT "brand_foundation_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_brands" ADD CONSTRAINT "campaign_brands_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_brands" ADD CONSTRAINT "campaign_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_fixed_assignee_id_users_id_fk" FOREIGN KEY ("fixed_assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_confirmation_tokens" ADD CONSTRAINT "task_confirmation_tokens_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_id_tasks_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_id_tasks_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sbus" ADD CONSTRAINT "task_sbus_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sbus" ADD CONSTRAINT "task_sbus_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watchers" ADD CONSTRAINT "task_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_routing" ADD CONSTRAINT "request_routing_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_routing" ADD CONSTRAINT "request_routing_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_sbu_id_sbus_id_fk" FOREIGN KEY ("requester_sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliverables" ADD CONSTRAINT "media_deliverables_shoot_id_media_shoots_id_fk" FOREIGN KEY ("shoot_id") REFERENCES "public"."media_shoots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliverables" ADD CONSTRAINT "media_deliverables_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliverables" ADD CONSTRAINT "media_deliverables_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_deliverables" ADD CONSTRAINT "media_deliverables_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_shoots" ADD CONSTRAINT "media_shoots_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_shoots" ADD CONSTRAINT "media_shoots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sbu_catalog_items" ADD CONSTRAINT "sbu_catalog_items_default_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("default_recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sbu_item_status" ADD CONSTRAINT "sbu_item_status_catalog_item_id_sbu_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."sbu_catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sbu_item_status" ADD CONSTRAINT "sbu_item_status_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sbu_item_status" ADD CONSTRAINT "sbu_item_status_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_sbu_idx" ON "users" USING btree ("sbu_id");--> statement-breakpoint
CREATE INDEX "sbus_region_idx" ON "sbus" USING btree ("region");--> statement-breakpoint
CREATE INDEX "sbus_owner_idx" ON "sbus" USING btree ("ho_owner_id");--> statement-breakpoint
CREATE INDEX "brand_foundation_brand_idx" ON "brand_foundation_entries" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_foundation_component_idx" ON "brand_foundation_entries" USING btree ("brand_id","component_code");--> statement-breakpoint
CREATE INDEX "brand_foundation_history_entry_idx" ON "brand_foundation_history" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_start_idx" ON "campaigns" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_recurring_uniq" ON "tasks" USING btree ("recurring_rule_id","occurrence_date",coalesce("scope_key", '')) WHERE "tasks"."recurring_rule_id" is not null and "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_import_uniq" ON "tasks" USING btree ("import_scope","external_key") WHERE "tasks"."external_key" is not null and "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_assignee_due_idx" ON "tasks" USING btree ("assignee_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_campaign_idx" ON "tasks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_source_idx" ON "tasks" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "activity_log_task_idx" ON "activity_log" USING btree ("task_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attachments_task_idx" ON "attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "checklist_items_task_idx" ON "checklist_items" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "checklist_items_sbu_idx" ON "checklist_items" USING btree ("sbu_id");--> statement-breakpoint
CREATE INDEX "comments_task_idx" ON "comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_confirmation_tokens_task_idx" ON "task_confirmation_tokens" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "request_routing_type_idx" ON "request_routing" USING btree ("request_type","sbu_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_sbu_idx" ON "requests" USING btree ("requester_sbu_id");--> statement-breakpoint
CREATE INDEX "content_items_publish_idx" ON "content_items" USING btree ("publish_date");--> statement-breakpoint
CREATE INDEX "media_deliverables_shoot_idx" ON "media_deliverables" USING btree ("shoot_id");--> statement-breakpoint
CREATE INDEX "sbu_item_status_period_idx" ON "sbu_item_status" USING btree ("period");--> statement-breakpoint
CREATE INDEX "sbu_item_status_catalog_sbu_idx" ON "sbu_item_status" USING btree ("catalog_item_id","sbu_id","period");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "import_rows_batch_idx" ON "import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("user_id","channel","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "saved_views_owner_idx" ON "saved_views" USING btree ("owner_id");