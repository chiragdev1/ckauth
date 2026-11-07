import type { Request } from 'express'
import { and, inArray, lt, or } from 'drizzle-orm'

import { db } from '../../../db/index.js'
import { auditEventsTable } from '../../../db/schema.js'
import { auditActions, type AuditAction } from './constants.js'
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

const routineActions: AuditAction[] = [auditActions.SIGN_IN, auditActions.SIGN_IN_FAILED, auditActions.ADMIN_REAUTH]

// run once at start-up and then daily (src/index.ts); the privacy policy promises how long these rows are kept
export async function pruneAuditEvents(executor: Executor = db): Promise<number> {
  const day = 24 * 60 * 60 * 1000
  const routineCutoff = new Date(Date.now() - ROUTINE_EVENT_RETENTION_DAYS * day)
  const accountCutoff = new Date(Date.now() - ACCOUNT_EVENT_RETENTION_DAYS * day)

  // both branches compare created_at, so audit_events_created_at_idx finds the old rows without reading the whole table
  const deleted = await executor.delete(auditEventsTable).where(or(
    and(inArray(auditEventsTable.action, routineActions), lt(auditEventsTable.createdAt, routineCutoff)),
    lt(auditEventsTable.createdAt, accountCutoff),
  )).returning({id: auditEventsTable.id})

  return deleted.length
}
