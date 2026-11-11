-- the api runs as its own database role, ckauth_api, instead of as the owner (ckauth, a superuser in the postgres image).
-- it can read and write every table, but on audit_events only SELECT and INSERT: no UPDATE, DELETE or TRUNCATE, and as a
-- non-owner it can't drop the append-only triggers either. so a leaked api password, an injected query or code running
-- in the api container can add events but never remove one. migrations, backups and manage-by-hand stay with the owner.
--
-- the role and its grants live in ensure_api_role(), which this migration runs once and src/db/migrate.ts runs on every
-- deploy: roles belong to the whole postgres server, not the database, so a backup restored onto a new server has the
-- tables but no ckauth_api, and the next migrate puts it back. the role is made NOLOGIN; migrate.ts then gives it a login
-- and its password from API_DB_PASSWORD, so the password never sits in a migration

-- the one way the api can delete events: runs with the owner's rights (SECURITY DEFINER) but takes no arguments, and the
-- retention periods are written here, so the most a compromised api can do is prune what was due anyway.
-- these numbers and actions must match ROUTINE_EVENT_RETENTION_DAYS / ACCOUNT_EVENT_RETENTION_DAYS / routineActions in
-- src/app/auth/utils/audit.ts and the privacy policy; test/activity.test.ts plants events either side of each cutoff.
-- created_at is a timestamp without time zone written as the server's local time, so it's compared with localtimestamp.
-- a fixed search_path stops a caller from swapping in their own audit_events table
CREATE FUNCTION prune_audit_events() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  deleted integer;
BEGIN
  PERFORM set_config('ckauth.audit_maintenance', 'on', true);
  DELETE FROM public.audit_events
   WHERE (action IN ('sign_in', 'sign_in_failed', 'admin_reauth') AND created_at < localtimestamp - interval '90 days')
      OR created_at < localtimestamp - interval '365 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  -- switched off again before returning, so the rest of the caller's transaction can't delete anything
  PERFORM set_config('ckauth.audit_maintenance', 'off', true);
  RETURN deleted;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION prune_audit_events() FROM PUBLIC;
--> statement-breakpoint
-- idempotent: safe to run on every deploy. owner only (no EXECUTE for PUBLIC), since it creates a role
CREATE FUNCTION ensure_api_role() RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ckauth_api') THEN
    CREATE ROLE ckauth_api NOLOGIN;
  END IF;
  GRANT USAGE ON SCHEMA public TO ckauth_api;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ckauth_api;
  -- the point of the role: events can be added and read, never changed or removed
  REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM ckauth_api;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ckauth_api;
  -- tables a later migration creates get the same access, so a new table can't break the api by being forgotten.
  -- a new table that must be append-only too needs its own REVOKE above
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ckauth_api;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ckauth_api;
  GRANT EXECUTE ON FUNCTION public.prune_audit_events() TO ckauth_api;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ensure_api_role() FROM PUBLIC;
--> statement-breakpoint
SELECT ensure_api_role();
