CREATE TYPE "public"."metric_source" AS ENUM('MANUAL', 'API');--> statement-breakpoint
ALTER TABLE "campaign_daily_metrics" ADD COLUMN "source" "metric_source" DEFAULT 'MANUAL' NOT NULL;