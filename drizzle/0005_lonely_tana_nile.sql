ALTER TYPE "public"."task_type" ADD VALUE 'LEAD_CARE';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_lead_idx" ON "tasks" USING btree ("lead_id");