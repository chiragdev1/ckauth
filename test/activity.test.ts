import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq, sql } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { auditEventsTable, usersTable } from '../src/db/schema.js'
import { ACCOUNT_EVENT_RETENTION_DAYS, pruneAuditEvents, ROUTINE_EVENT_RETENTION_DAYS } from '../src/app/auth/utils/audit.js'
import { Client, createUser, lastMailTo, resetDatabase, signIn, signUp, startApp, tokenFrom } from './helpers.js'

// the activity log: every action that changes an account writes one audit_events row, in the same transaction as the
// change, and admins read them through GET /admin/activity

const baseUrl = await startApp()

beforeEach(resetDatabase)

async function events(action?: string) {
  const rows = await db.select().from(auditEventsTable).orderBy(auditEventsTable.createdAt)
  return action ? rows.filter(row => row.action === action) : rows
}

async function adminSession() {
  const admin = await createUser({role: 'admin', firstName: 'Boss'})
  const client = await signIn(baseUrl, admin)
  assert.equal((await client.post('/admin/reauth', {password: admin.password})).status, 200)
  return {admin, client}
}

describe('what gets recorded', () => {
  test('a sign-in, with whether the browser is new, the ip and the request id', async () => {
    const user = await createUser()
    const client = new Client(baseUrl)
    client.userAgent = 'Firefox on Linux'
    const first = await client.post('/auth/sign-in', {email: user.email, password: user.password})
    await client.post('/auth/sign-in', {email: user.email, password: user.password})

    const [newDevice, sameDevice] = await events('sign_in')
    assert.deepEqual(newDevice?.details, {newDevice: true})
    assert.deepEqual(sameDevice?.details, {newDevice: false})
    assert.equal(newDevice?.actorId, user.id)
    assert.equal(newDevice?.targetId, user.id)
    assert.equal(newDevice?.source, 'api')
    assert.equal(newDevice?.ipAddress, client.ip)
    // the id the client got back, so an event leads to the request's application log lines
    assert.equal(newDevice?.requestId, first.headers.get('x-request-id'))
  })

  test('a wrong password for a real account, but nothing for an email nobody has', async () => {
    const user = await createUser()
    await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: 'wrong-password'})
    await new Client(baseUrl).post('/auth/sign-in', {email: 'nobody@ckauth.test', password: 'wrong-password'})

    const all = await events()
    assert.equal(all.length, 1)
    assert.equal(all[0]?.action, 'sign_in_failed')
    assert.equal(all[0]?.targetId, user.id)
    assert.equal(all[0]?.actorId, null)
  })

  test('verifying an email', async () => {
    const token = await signUp(baseUrl, 'ada@ckauth.test')
    await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'secret123'})
    assert.equal((await events('email_verified')).length, 1)
  })

  test('changing a password', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    assert.equal((await client.post('/auth/change-password', {currentPassword: user.password, newPassword: 'brand-new-password'})).status, 200)
    assert.equal((await events('password_changed'))[0]?.actorId, user.id)
  })

  test('a reset, and an invite finished through the reset link as a first password', async () => {
    const user = await createUser()
    await new Client(baseUrl).post('/auth/forgot-password', {email: user.email})
    await new Client(baseUrl).post(`/auth/reset-password/${tokenFrom(lastMailTo(user.email))}`, {newPassword: 'brand-new-password'})

    const {client} = await adminSession()
    await client.post('/admin/users', {firstName: 'New', email: 'invited@ckauth.test'})
    await new Client(baseUrl).post(`/auth/reset-password/${tokenFrom(lastMailTo('invited@ckauth.test'))}`, {newPassword: 'brand-new-password'})

    const resets = await events('password_reset')
    assert.deepEqual(resets.map(row => row.details), [{firstPassword: false}, {firstPassword: true}])
  })

  test('an email change keeps the old address, since the account no longer shows it', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    await client.post('/auth/change-email', {newEmail: 'moved@ckauth.test', password: user.password})
    await new Client(baseUrl).post(`/auth/confirm-email/${tokenFrom(lastMailTo('moved@ckauth.test'))}`)

    const [changed] = await events('email_changed')
    assert.deepEqual(changed?.details, {previousEmail: user.email})
  })

  test('deleting your own account keeps your email on the event, which outlives the account', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    assert.equal((await client.delete('/auth/me', {password: user.password})).status, 200)

    const [deleted] = await events('account_deleted')
    assert.equal(deleted?.actorId, user.id)
    assert.deepEqual(deleted?.details, {email: user.email})
  })

  test('admin actions: confirming the password (right and wrong), inviting and deleting', async () => {
    const {admin, client} = await adminSession()
    await client.post('/admin/reauth', {password: 'wrong-password'})
    const invited = (await client.post('/admin/users', {firstName: 'New', email: 'invited@ckauth.test'})).body.data
    await client.delete(`/admin/users/${invited.id}`)

    const byAction = Object.fromEntries((await events()).filter(row => row.actorId === admin.id && row.action !== 'sign_in').map(row => [row.action, row]))
    assert.deepEqual(Object.keys(byAction).sort(), ['admin_reauth', 'admin_reauth_failed', 'user_deleted', 'user_invited'])
    assert.equal(byAction.user_invited?.targetId, invited.id)
    assert.equal(byAction.user_deleted?.targetId, invited.id)
    assert.deepEqual(byAction.user_deleted?.details, {email: 'invited@ckauth.test'})
  })

  test('a refused action records nothing', async () => {
    const {admin, client} = await adminSession()
    const otherAdmin = await createUser({role: 'admin'})
    assert.equal((await client.delete(`/admin/users/${otherAdmin.id}`)).status, 403)
    assert.equal((await client.post('/admin/users', {firstName: 'Dup', email: admin.email})).status, 409)
    assert.deepEqual((await events()).map(row => row.action).sort(), ['admin_reauth', 'sign_in'])
  })

  // the promise of the design: an action and its record commit together or not at all. a check constraint makes the
  // audit insert fail, and the password change it belongs to must roll back with it
  test('if the record cannot be written, the action does not happen either', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    await db.execute(sql`alter table audit_events add constraint test_block check (action <> 'password_changed')`)
    try {
      const response = await client.post('/auth/change-password', {currentPassword: user.password, newPassword: 'brand-new-password'})
      assert.equal(response.status, 500)
    } finally {
      await db.execute(sql`alter table audit_events drop constraint test_block`)
    }
    // the old password still works, so the change rolled back
    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})).status, 200)
  })
})

describe('GET /admin/activity', () => {
  test('admins only', async () => {
    assert.equal((await new Client(baseUrl).get('/admin/activity')).status, 401)
    const user = await createUser()
    assert.equal((await (await signIn(baseUrl, user)).get('/admin/activity')).status, 403)
  })

  test('newest first, with names joined in and no ip address', async () => {
    const {admin, client} = await adminSession()
    const response = await client.get('/admin/activity')
    assert.equal(response.status, 200)

    const [newest, oldest] = response.body.data.events
    assert.equal(newest.action, 'admin_reauth')
    assert.equal(oldest.action, 'sign_in')
    assert.equal(newest.actorEmail, admin.email)
    assert.equal(newest.actorFirstName, 'Boss')
    assert.ok(newest.requestId)
    // an admin sees what happened and to whom, not where people are
    assert.equal('ipAddress' in newest, false)
    assert.deepEqual(response.body.data.pagination, {page: 1, limit: 20, total: 2})
  })

  test('a deleted account still shows, by the email kept on its event', async () => {
    const {client} = await adminSession()
    const invited = (await client.post('/admin/users', {firstName: 'Gone', email: 'gone@ckauth.test'})).body.data
    await client.delete(`/admin/users/${invited.id}`)

    const [deleted] = (await client.get('/admin/activity?action=user_deleted')).body.data.events
    assert.equal(deleted.targetEmail, null)
    assert.deepEqual(deleted.details, {email: 'gone@ckauth.test'})
  })

  test('filters by action, and by person: what they did and what was done to them', async () => {
    const {client} = await adminSession()
    const user = await createUser()
    await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: 'wrong-password'})
    await signIn(baseUrl, user)
    const invited = (await client.post('/admin/users', {firstName: 'New', email: 'invited@ckauth.test'})).body.data

    const failed = (await client.get('/admin/activity?action=sign_in_failed')).body.data.events
    assert.deepEqual(failed.map((row: {targetId: string}) => row.targetId), [user.id])

    const theirs = (await client.get(`/admin/activity?userId=${user.id}`)).body.data.events
    assert.deepEqual(theirs.map((row: {action: string}) => row.action).sort(), ['sign_in', 'sign_in_failed'])

    // invited, not acting: found through the target
    const invitedLog = (await client.get(`/admin/activity?userId=${invited.id}`)).body.data.events
    assert.deepEqual(invitedLog.map((row: {action: string}) => row.action), ['user_invited'])
  })

  test('rejects an unknown action, a bad user id and a page size over 100', async () => {
    const {client} = await adminSession()
    for(const query of ['action=hacked', 'userId=not-a-uuid', 'limit=101']) {
      assert.equal((await client.get(`/admin/activity?${query}`)).status, 400, query)
    }
  })

  test('pages through the log', async () => {
    const {client} = await adminSession()
    const user = await createUser()
    for(let i = 0; i < 3; i++) await signIn(baseUrl, user)

    const page = (await client.get('/admin/activity?limit=2&page=2')).body.data
    assert.equal(page.events.length, 2)
    assert.deepEqual(page.pagination, {page: 2, limit: 2, total: 5})
  })
})

describe('pruneAuditEvents', () => {
  test(`keeps routine events ${ROUTINE_EVENT_RETENTION_DAYS} days and everything else ${ACCOUNT_EVENT_RETENTION_DAYS}`, async () => {
    const day = 24 * 60 * 60 * 1000
    const planted = [
      ['sign_in', ROUTINE_EVENT_RETENTION_DAYS - 1, true],
      ['sign_in', ROUTINE_EVENT_RETENTION_DAYS + 1, false],
      ['sign_in_failed', ROUTINE_EVENT_RETENTION_DAYS + 1, false],
      ['admin_reauth', ROUTINE_EVENT_RETENTION_DAYS + 1, false],
      ['admin_reauth_failed', ROUTINE_EVENT_RETENTION_DAYS + 1, true],
      ['user_deleted', ACCOUNT_EVENT_RETENTION_DAYS - 1, true],
      ['user_deleted', ACCOUNT_EVENT_RETENTION_DAYS + 1, false],
    ] as const
    for(const [action, daysOld] of planted) {
      await db.insert(auditEventsTable).values({action, source: 'api', details: {label: `${action} ${daysOld}`}, createdAt: new Date(Date.now() - daysOld * day)})
    }

    assert.equal(await pruneAuditEvents(), planted.filter(([, , kept]) => !kept).length)
    const left = (await events()).map(row => row.details?.label).sort()
    assert.deepEqual(left, planted.filter(([, , kept]) => kept).map(([action, daysOld]) => `${action} ${daysOld}`).sort())
  })

  test('touches nothing recent', async () => {
    const user = await createUser()
    await signIn(baseUrl, user)
    assert.equal(await pruneAuditEvents(), 0)
    assert.equal((await db.select().from(auditEventsTable).where(eq(auditEventsTable.targetId, user.id))).length, 1)
    assert.ok(await db.select().from(usersTable).where(eq(usersTable.id, user.id)))
  })
})
