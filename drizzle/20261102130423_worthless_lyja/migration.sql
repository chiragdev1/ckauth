CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"action" varchar(40) NOT NULL,
	"actor_id" uuid,
	"target_id" uuid,
	"details" jsonb,
	"source" varchar(10) NOT NULL,
	"ip_address" varchar(45),
	"request_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_id_idx" ON "audit_events" ("target_id");