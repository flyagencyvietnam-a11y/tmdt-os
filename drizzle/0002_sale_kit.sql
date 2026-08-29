CREATE TYPE "public"."sale_kit_category" AS ENUM('PRODUCT_INFO', 'PRICING', 'SCHEDULE', 'PROMO', 'TEMPLATE', 'SCRIPT', 'FAQ', 'OBJECTION');--> statement-breakpoint
CREATE TYPE "public"."sale_kit_status" AS ENUM('DRAFT', 'APPROVED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "sale_kit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "sale_kit_category" NOT NULL,
	"product_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"valid_until" date,
	"status" "sale_kit_status" DEFAULT 'DRAFT' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sale_kit_items" ADD CONSTRAINT "sale_kit_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_kit_items" ADD CONSTRAINT "sale_kit_items_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_kit_category_idx" ON "sale_kit_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "sale_kit_product_idx" ON "sale_kit_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_kit_status_idx" ON "sale_kit_items" USING btree ("status");