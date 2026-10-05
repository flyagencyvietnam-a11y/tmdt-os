CREATE TABLE "campaign_sbus" (
	"campaign_id" uuid NOT NULL,
	"sbu_id" uuid NOT NULL,
	CONSTRAINT "campaign_sbus_campaign_id_sbu_id_pk" PRIMARY KEY("campaign_id","sbu_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_sbus" ADD CONSTRAINT "campaign_sbus_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_sbus" ADD CONSTRAINT "campaign_sbus_sbu_id_sbus_id_fk" FOREIGN KEY ("sbu_id") REFERENCES "public"."sbus"("id") ON DELETE no action ON UPDATE no action;