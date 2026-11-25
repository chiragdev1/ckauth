CREATE TYPE "oauth_client_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "oauth_client_type" AS ENUM('confidential', 'public');--> statement-breakpoint
CREATE TYPE "oauth_scope" AS ENUM('openid', 'profile', 'email', 'offline_access');--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(80) NOT NULL,
	"type" "oauth_client_type" NOT NULL,
	"secret_hash" varchar(64),
	"previous_secret_hash" varchar(64),
	"previous_secret_expires_at" timestamp with time zone,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_scopes" "oauth_scope"[] NOT NULL,
	"allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"sector" varchar(253) NOT NULL,
	"status" "oauth_client_status" DEFAULT 'active'::"oauth_client_status" NOT NULL,
	"registered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "oauth_clients_secret_matches_type" CHECK (("type" = 'confidential' and "secret_hash" is not null) or ("type" = 'public' and "secret_hash" is null and "previous_secret_hash" is null)),
	CONSTRAINT "oauth_clients_secret_hash_format" CHECK ("secret_hash" is null or secret_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "oauth_clients_previous_secret_hash_format" CHECK ("previous_secret_hash" is null or previous_secret_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "oauth_clients_previous_secret_expires" CHECK (("previous_secret_hash" is null) = ("previous_secret_expires_at" is null)),
	CONSTRAINT "oauth_clients_has_redirect_uri" CHECK (cardinality("redirect_uris") between 1 and 10),
	CONSTRAINT "oauth_clients_redirect_uris_format" CHECK (array_position(redirect_uris, null) is null and char_length(array_to_string("redirect_uris", ' ')) <= 20490 and array_to_string(redirect_uris, ' ') ~ '^(https://[^[:space:][:cntrl:]#/@?]+(/[^[:space:][:cntrl:]#]*)?|http://127\.0\.0\.1(:[0-9]{1,5})?(/[^[:space:][:cntrl:]#]*)?|[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:/[^[:space:][:cntrl:]#]*)( (https://[^[:space:][:cntrl:]#/@?]+(/[^[:space:][:cntrl:]#]*)?|http://127\.0\.0\.1(:[0-9]{1,5})?(/[^[:space:][:cntrl:]#]*)?|[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:/[^[:space:][:cntrl:]#]*))*$'),
	CONSTRAINT "oauth_clients_post_logout_uris_format" CHECK (array_position(post_logout_redirect_uris, null) is null and cardinality("post_logout_redirect_uris") <= 10 and (cardinality("post_logout_redirect_uris") = 0 or array_to_string(post_logout_redirect_uris, ' ') ~ '^(https://[^[:space:][:cntrl:]#/@?]+(/[^[:space:][:cntrl:]#]*)?|http://127\.0\.0\.1(:[0-9]{1,5})?(/[^[:space:][:cntrl:]#]*)?|[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:/[^[:space:][:cntrl:]#]*)( (https://[^[:space:][:cntrl:]#/@?]+(/[^[:space:][:cntrl:]#]*)?|http://127\.0\.0\.1(:[0-9]{1,5})?(/[^[:space:][:cntrl:]#]*)?|[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:/[^[:space:][:cntrl:]#]*))*$')),
	CONSTRAINT "oauth_clients_scopes_no_nulls" CHECK (array_position(allowed_scopes, null) is null),
	CONSTRAINT "oauth_clients_origins_format" CHECK (array_position(allowed_origins, null) is null and cardinality("allowed_origins") <= 10 and (cardinality("allowed_origins") = 0 or array_to_string(allowed_origins, ' ') ~ '^(https://[a-z0-9.-]+(:[0-9]{1,5})?|http://127\.0\.0\.1(:[0-9]{1,5})?)( (https://[a-z0-9.-]+(:[0-9]{1,5})?|http://127\.0\.0\.1(:[0-9]{1,5})?))*$')),
	CONSTRAINT "oauth_clients_allows_openid" CHECK ('openid' = any("allowed_scopes")),
	CONSTRAINT "oauth_clients_origins_only_public" CHECK ("type" = 'public' or cardinality("allowed_origins") = 0),
	CONSTRAINT "oauth_clients_sector_format" CHECK (sector ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'),
	CONSTRAINT "oauth_clients_name_present" CHECK (btrim("name") <> ''),
	CONSTRAINT "oauth_clients_name_visible" CHECK (name !~ '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]')
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"code_hash" varchar(64) PRIMARY KEY,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" varchar(43) NOT NULL,
	"nonce" varchar(512),
	"scopes" "oauth_scope"[] NOT NULL,
	"auth_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "oauth_codes_code_hash_format" CHECK (code_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "oauth_codes_code_challenge_format" CHECK ("code_challenge" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "oauth_codes_asks_openid" CHECK ('openid' = any("scopes") and array_position(scopes, null) is null),
	CONSTRAINT "oauth_codes_redirect_uri_format" CHECK (char_length("redirect_uri") <= 2048 and redirect_uri ~ '^(https://[^[:space:][:cntrl:]#/@?]+(/[^[:space:][:cntrl:]#]*)?|http://127\.0\.0\.1(:[0-9]{1,5})?(/[^[:space:][:cntrl:]#]*)?|[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:/[^[:space:][:cntrl:]#]*)$'),
	CONSTRAINT "oauth_codes_lifetime" CHECK ("expires_at" > "created_at" and "expires_at" <= "created_at" + interval '60 seconds')
);
--> statement-breakpoint
CREATE TABLE "oauth_consents" (
	"user_id" uuid,
	"client_id" uuid,
	"scopes" "oauth_scope"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "oauth_consents_pkey" PRIMARY KEY("user_id","client_id"),
	CONSTRAINT "oauth_consents_includes_openid" CHECK ('openid' = any("scopes") and array_position(scopes, null) is null)
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"family_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" "oauth_scope"[] NOT NULL,
	"auth_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "oauth_refresh_tokens_token_hash_format" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "oauth_refresh_tokens_offline_access" CHECK ('offline_access' = any("scopes") and 'openid' = any("scopes") and array_position(scopes, null) is null),
	CONSTRAINT "oauth_refresh_tokens_lifetime" CHECK ("expires_at" > "created_at" and "expires_at" <= "created_at" + interval '30 days'),
	CONSTRAINT "oauth_refresh_tokens_idle_lifetime" CHECK ("idle_expires_at" <= "expires_at" and "idle_expires_at" <= "created_at" + interval '14 days')
);
--> statement-breakpoint
CREATE TABLE "oauth_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"client_id" uuid NOT NULL,
	"browser_binding_hash" varchar(64) NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" "oauth_scope"[] NOT NULL,
	"state" varchar(512),
	"nonce" varchar(512),
	"code_challenge" varchar(43) NOT NULL,
	"prompt" varchar(64),
	"max_age" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_requests_binding_hash_format" CHECK (browser_binding_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "oauth_requests_code_challenge_format" CHECK ("code_challenge" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "oauth_requests_asks_openid" CHECK ('openid' = any("scopes") and array_position(scopes, null) is null),
	CONSTRAINT "oauth_requests_redirect_uri_format" CHECK (char_length("redirect_uri") <= 2048 and redirect_uri ~ '^(https://[^[:space:][:cntrl:]#/@?]+(/[^[:space:][:cntrl:]#]*)?|http://127\.0\.0\.1(:[0-9]{1,5})?(/[^[:space:][:cntrl:]#]*)?|[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:/[^[:space:][:cntrl:]#]*)$'),
	CONSTRAINT "oauth_requests_prompt_values" CHECK ("prompt" is null or "prompt" ~ '^(none|(login|consent|select_account)( (login|consent|select_account))*)$'),
	CONSTRAINT "oauth_requests_max_age_positive" CHECK ("max_age" is null or "max_age" >= 0),
	CONSTRAINT "oauth_requests_lifetime" CHECK ("expires_at" > "created_at" and "expires_at" <= "created_at" + interval '10 minutes')
);
--> statement-breakpoint
CREATE TABLE "oauth_subjects" (
	"user_id" uuid,
	"sector" varchar(253),
	"subject" varchar(43) NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_subjects_pkey" PRIMARY KEY("user_id","sector"),
	CONSTRAINT "oauth_subjects_subject_format" CHECK ("subject" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "oauth_subjects_sector_format" CHECK (sector ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
);
--> statement-breakpoint
CREATE INDEX "oauth_codes_user_id_idx" ON "oauth_codes" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_codes_client_id_idx" ON "oauth_codes" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_codes_expires_at_idx" ON "oauth_codes" ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_consents_client_id_idx" ON "oauth_consents" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_family_id_idx" ON "oauth_refresh_tokens" ("family_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_client_id_idx" ON "oauth_refresh_tokens" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_idle_expires_at_idx" ON "oauth_refresh_tokens" ("idle_expires_at");--> statement-breakpoint
CREATE INDEX "oauth_requests_expires_at_idx" ON "oauth_requests" ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_requests_client_id_idx" ON "oauth_requests" ("client_id");--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_registered_by_users_id_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_client_id_oauth_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_oauth_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_client_id_oauth_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_subjects" ADD CONSTRAINT "oauth_subjects_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;