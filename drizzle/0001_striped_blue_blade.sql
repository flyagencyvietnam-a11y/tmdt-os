DROP INDEX "sbu_item_status_catalog_sbu_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "sbu_item_status_catalog_sbu_uniq" ON "sbu_item_status" USING btree ("catalog_item_id","sbu_id","period");