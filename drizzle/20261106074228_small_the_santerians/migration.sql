CREATE TABLE "referral_visits" (
	"day" date DEFAULT now(),
	"source" varchar(32),
	"visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "referral_visits_pkey" PRIMARY KEY("day","source")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_source" varchar(32);