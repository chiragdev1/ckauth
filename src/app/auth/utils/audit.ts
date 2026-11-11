import type { Request } from 'express'
import { sql } from 'drizzle-orm'

import { db } from '../../../db/index.js'
import { auditEventsTable } from '../../../db/schema.js'
import type { AuditAction } from './constants.js'
import { describeClient, type Executor } from './sessions.js'

type AuditEvent = {
  action: AuditAction
  actorId?: string | null
  targetId?: string | null
  // undefined allowed explicitly, so a helper that has nothing to add can say so; stored as null either way
  details?: Record<string, string | number | boolean> | undefined
}

// pass the transaction that makes the change, so the row commits or rolls back with it. req is null for manage-users,
// which runs on the server with no request (and so no ip or request id)
export async function recordEvent(executor: Executor, req: Request | null, {action, actorId = null, targetId = null, details}: AuditEvent) {
  await executor.insert(auditEventsTable).values({
    action,
    actorId,
    targetId,
    details: details ?? null,
    source: req ? 'api' : 'cli',
    ipAddress: req ? describeClient(req).ipAddress : null,
    requestId: req ? String(req.id) : null,
  })
}

// how long events are kept; the privacy policy states these numbers, so change it with them.
// routine events are most of the table and stop mattering within weeks; changes to an account and admin actions are
// rare and answer "who did this?" long after, so they're kept for a year
export const ROUTINE_EVENT_RETENTION_DAYS = 90
export const ACCOUNT_EVENT_RETENTION_DAYS = 365

// the routine actions (90 days) are sign_in, sign_in_failed and admin_reauth, listed in prune_audit_events

// audit_events is append-only in the database itself (drizzle/20261107063859_audit_events_append_only): a delete or
// truncate is refused unless its transaction opts in here, and an update is always refused. only the seed script's --clear
// and the tests' reset call this, as the owner; in production the api's role can't delete events at all, opt-in or not
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function withAuditMaintenance<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    // local: the setting ends with this transaction, so it can't leak onto a pooled connection
    await tx.execute(sql`set local ckauth.audit_maintenance = 'on'`)
    return await work(tx)
  })
}

// run once at start-up and then daily (src/index.ts); the privacy policy promises how long these rows are kept.
// the deleting happens in the database function prune_audit_events (drizzle/20261107081824_api_database_role), because
// the api's own role may not delete events; the function holds the same numbers as the constants above
export async function pruneAuditEvents(): Promise<number> {
  const result = await db.execute<{deleted: number}>(sql`select prune_audit_events() as deleted`)
  return Number(result.rows[0]?.deleted ?? 0)
}
