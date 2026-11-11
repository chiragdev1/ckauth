-- the activity log is append-only: the database itself refuses to edit its rows, and refuses to delete or empty them
-- unless the transaction first runs "set local ckauth.audit_maintenance = 'on'", which only pruneAuditEvents, the
-- seed script's --clear and the tests' reset do (withAuditMaintenance in src/app/auth/utils/audit.ts). an update is
-- refused even then: no code path edits an event, so none ever needs to.
-- this stops a bug, a stray query or an injected UPDATE/DELETE from quietly rewriting history. it is not proof against
-- someone holding the owner's password, who can drop the trigger; separate database roles are the next step for that.
-- older api images still work: their pruning is refused and logged, nothing else touches these rows
CREATE FUNCTION audit_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' AND current_setting('ckauth.audit_maintenance', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only: % refused', TG_OP USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION audit_events_guard();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION audit_events_guard();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION audit_events_guard();
