ALTER TABLE "requests" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "import_scope" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "import_scope" text;--> statement-breakpoint
CREATE UNIQUE INDEX "requests_import_uniq" ON "requests" USING btree ("import_scope","external_key") WHERE "requests"."external_key" is not null and "requests"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_import_uniq" ON "content_items" USING btree ("import_scope","external_key") WHERE "content_items"."external_key" is not null and "content_items"."deleted_at" is null;