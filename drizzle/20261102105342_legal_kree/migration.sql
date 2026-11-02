ALTER TABLE "users" ADD COLUMN "pending_email" varchar(322);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_change_token" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_change_token_expiry" timestamp;