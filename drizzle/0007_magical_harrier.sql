CREATE TABLE "ads_ecom_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"period_end" text,
	"product" text NOT NULL,
	"spend" numeric(14, 0),
	"mql" numeric(10, 0),
	"new_students" numeric(10, 0),
	"revenue" numeric(14, 0),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ads_ecom_products_uniq" ON "ads_ecom_products" USING btree ("period","product");