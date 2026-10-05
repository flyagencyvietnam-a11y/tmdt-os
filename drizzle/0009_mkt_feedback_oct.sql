CREATE TABLE "monitoring_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"checked_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "monitoring_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"thumb" "bytea" NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"caption" text,
	"taken_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "grid_custom_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "grid_custom_values" (
	"column_id" uuid NOT NULL,
	"row_id" text NOT NULL,
	"value" text NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "grid_custom_values_column_id_row_id_pk" PRIMARY KEY("column_id","row_id")
);
--> statement-breakpoint
ALTER TABLE "ads_campaigns" ADD COLUMN "planned_budget" numeric(14, 0);--> statement-breakpoint
ALTER TABLE "ads_campaigns" ADD COLUMN "runner_id" uuid;--> statement-breakpoint
ALTER TABLE "monitoring_checks" ADD CONSTRAINT "monitoring_checks_item_id_monitoring_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."monitoring_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_photos" ADD CONSTRAINT "monitoring_photos_item_id_monitoring_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."monitoring_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grid_custom_values" ADD CONSTRAINT "grid_custom_values_column_id_grid_custom_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."grid_custom_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitoring_checks_item_idx" ON "monitoring_checks" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "monitoring_photos_item_idx" ON "monitoring_photos" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "grid_custom_columns_entity_idx" ON "grid_custom_columns" USING btree ("entity");--> statement-breakpoint
CREATE UNIQUE INDEX "grid_custom_columns_name_uniq" ON "grid_custom_columns" USING btree ("entity","name");--> statement-breakpoint
CREATE INDEX "grid_custom_values_row_idx" ON "grid_custom_values" USING btree ("row_id");--> statement-breakpoint
ALTER TABLE "ads_campaigns" ADD CONSTRAINT "ads_campaigns_runner_id_users_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;