CREATE TYPE "public"."ems_status" AS ENUM('CHUA', 'DA_NHAP');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ems_status" "ems_status" DEFAULT 'CHUA' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ems_link" text;