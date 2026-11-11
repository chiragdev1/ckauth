// development only: fills the /admin activity log with a month of believable events, so its designs can be judged on
// something other than an empty list. uses the real users in the database, plus six made-up ones on a reserved domain.
//
//   pnpm build && pnpm seed:activity            replace any earlier seed with a fresh one
//   pnpm build && pnpm seed:activity --clear    remove the seeded users and events
//
// seeded users have no password, so nobody can sign in as them; every seeded event carries details.seed so --clear finds it
import { randomUUID } from 'node:crypto'
import { like, sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import { auditEventsTable, usersTable } from '../db/schema.js'
import { auditActions, userRolesEnum, type AuditAction } from '../app/auth/utils/constants.js'
import { withAuditMaintenance } from '../app/auth/utils/audit.js'

const SEED_DOMAIN = 'seed.example.com'
const DAY = 24 * 60 * 60 * 1000
const MINUTE = 60 * 1000

const people = [
  {firstName: 'Priya', lastName: 'Sharma'},
  {firstName: 'Arjun', lastName: 'Mehta'},
  {firstName: 'Sara', lastName: 'Khan'},
  {firstName: 'Rohan', lastName: 'Iyer'},
  {firstName: 'Meera', lastName: 'Nair'},
  {firstName: 'Dev', lastName: 'Patel'},
]

type SeedEvent = {
  action: AuditAction
  at: Date
  actorId?: string | null
  targetId?: string | null
  details?: Record<string, string | number | boolean>
  source?: 'api' | 'cli'
}

// a time `days` back at the given clock time; today's later hours haven't happened yet, so those fall back to just now
function daysAgo(days: number, hour = 10, minute = 0) {
  const at = new Date(Date.now() - days * DAY)
  at.setHours(hour, minute, Math.floor(Math.random() * 60), 0)
  return at.getTime() < Date.now() ? at : new Date(Date.now() - Math.floor(Math.random() * 30 + 1) * MINUTE)
}

// documentation-only address ranges (rfc 5737), so no real person's ip ends up in a screenshot
function fakeIp() {
  return `${Math.random() < 0.5 ? '203.0.113' : '198.51.100'}.${1 + Math.floor(Math.random() * 254)}`
}

async function clear() {
  const deletedEvents = await withAuditMaintenance((tx) => tx.delete(auditEventsTable).where(sql`${auditEventsTable.details}->>'seed' = 'true'`).returning({id: auditEventsTable.id}))
  const deletedUsers = await db.delete(usersTable).where(like(usersTable.email, `%@${SEED_DOMAIN}`)).returning({id: usersTable.id})
  return {events: deletedEvents.length, users: deletedUsers.length}
}

async function seed() {
  await clear()

  const seeded = await db.insert(usersTable).values(people.map((person, index) => ({
    ...person,
    email: `${person.firstName}.${person.lastName}@${SEED_DOMAIN}`.toLowerCase(),
    emailVerified: true,
    createdAt: daysAgo(28 - index * 4),
  }))).returning({id: usersTable.id, email: usersTable.email})

  const realUsers = await db.select({id: usersTable.id, role: usersTable.role, emailVerified: usersTable.emailVerified}).from(usersTable)
    .where(sql`${usersTable.email} not like ${`%@${SEED_DOMAIN}`}`)
  const admin = realUsers.find(user => user.role === userRolesEnum.ADMIN)?.id ?? seeded[0]!.id
  const [priya, arjun, sara, rohan, meera, dev] = seeded.map(user => user.id) as [string, string, string, string, string, string]

  const events: SeedEvent[] = []
  const add = (event: SeedEvent) => events.push(event)

  // the server made the admin, before anything else happened
  add({action: auditActions.ROLE_CHANGED, at: daysAgo(30, 9), targetId: admin, details: {role: 'admin'}, source: 'cli'})

  // everyone verifies, then signs in every few days, now and then from a new device
  for(const [index, id] of [priya, arjun, sara, rohan, meera].entries()) {
    const joined = 28 - index * 4
    add({action: auditActions.EMAIL_VERIFIED, at: daysAgo(joined, 11, 5), actorId: id, targetId: id})
    add({action: auditActions.SIGN_IN, at: daysAgo(joined, 11, 6), actorId: id, targetId: id, details: {newDevice: true}})
    for(let day = joined - 1 - Math.floor(Math.random() * 3); day >= 0; day -= 1 + Math.floor(Math.random() * 3)) {
      add({action: auditActions.SIGN_IN, at: daysAgo(day, 8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60)), actorId: id, targetId: id, details: {newDevice: Math.random() < 0.15}})
    }
  }
  for(const user of realUsers.filter(user => user.emailVerified)) {
    for(const day of [21, 14, 9, 3, 0]) {
      add({action: auditActions.SIGN_IN, at: daysAgo(day, 9 + day % 8, 15), actorId: user.id, targetId: user.id, details: {newDevice: day === 21}})
    }
  }

  // someone guesses Sara's password five times in two minutes; she resets it that evening and changes it again next day
  for(let attempt = 0; attempt < 5; attempt++) {
    add({action: auditActions.SIGN_IN_FAILED, at: new Date(daysAgo(6, 2, 14).getTime() + attempt * 25_000), targetId: sara})
  }
  add({action: auditActions.PASSWORD_RESET, at: daysAgo(6, 19, 40), actorId: sara, targetId: sara, details: {firstPassword: false}})
  add({action: auditActions.SIGN_IN, at: daysAgo(6, 19, 42), actorId: sara, targetId: sara, details: {newDevice: false}})
  add({action: auditActions.PASSWORD_CHANGED, at: daysAgo(5, 9, 12), actorId: sara, targetId: sara})

  // a typo now and then
  add({action: auditActions.SIGN_IN_FAILED, at: daysAgo(11, 9, 58), targetId: arjun})
  add({action: auditActions.SIGN_IN_FAILED, at: daysAgo(2, 18, 3), targetId: priya})

  // Rohan moves to a new address
  add({action: auditActions.EMAIL_CHANGED, at: daysAgo(10, 15, 30), actorId: rohan, targetId: rohan, details: {previousEmail: `rohan.old@${SEED_DOMAIN}`}})

  // the admin invites Dev (who sets a password the next morning), mistypes the admin password once, and removes a spam account
  add({action: auditActions.ADMIN_REAUTH, at: daysAgo(4, 12, 0), actorId: admin, targetId: admin})
  add({action: auditActions.USER_INVITED, at: daysAgo(4, 12, 2), actorId: admin, targetId: dev})
  add({action: auditActions.PASSWORD_RESET, at: daysAgo(3, 8, 45), actorId: dev, targetId: dev, details: {firstPassword: true}})
  add({action: auditActions.SIGN_IN, at: daysAgo(3, 8, 46), actorId: dev, targetId: dev, details: {newDevice: true}})
  add({action: auditActions.ADMIN_REAUTH_FAILED, at: daysAgo(1, 16, 20), actorId: admin, targetId: admin})
  add({action: auditActions.ADMIN_REAUTH, at: daysAgo(1, 16, 21), actorId: admin, targetId: admin})
  add({action: auditActions.USER_DELETED, at: daysAgo(1, 16, 23), actorId: admin, targetId: randomUUID(), details: {email: `spam.bot@${SEED_DOMAIN}`}})

  // an account that signed in a few times and then deleted itself: its earlier events now show "a deleted account"
  const leaver = randomUUID()
  add({action: auditActions.EMAIL_VERIFIED, at: daysAgo(20, 13), actorId: leaver, targetId: leaver})
  add({action: auditActions.SIGN_IN, at: daysAgo(20, 13, 1), actorId: leaver, targetId: leaver, details: {newDevice: true}})
  add({action: auditActions.SIGN_IN, at: daysAgo(15, 10), actorId: leaver, targetId: leaver, details: {newDevice: false}})
  add({action: auditActions.ACCOUNT_DELETED, at: daysAgo(8, 21, 10), actorId: leaver, targetId: leaver, details: {email: `left.us@${SEED_DOMAIN}`}})

  // something from a few minutes ago, so the newest end of the list shows a relative time
  add({action: auditActions.SIGN_IN, at: new Date(Date.now() - 5 * MINUTE), actorId: meera, targetId: meera, details: {newDevice: false}})

  await db.insert(auditEventsTable).values(events.map(event => ({
    action: event.action,
    actorId: event.actorId ?? null,
    targetId: event.targetId ?? null,
    details: {...event.details, seed: true},
    source: event.source ?? 'api',
    ipAddress: event.source === 'cli' ? null : fakeIp(),
    requestId: event.source === 'cli' ? null : randomUUID(),
    createdAt: event.at,
  })))

  return {users: seeded.length, events: events.length}
}

if(process.env.NODE_ENV === 'production') {
  console.error('error: seed-activity is for development databases only')
  process.exitCode = 1
} else {
  try {
    if(process.argv.includes('--clear')) {
      const removed = await clear()
      console.log(`removed ${removed.users} seeded users and ${removed.events} seeded events`)
    } else {
      const added = await seed()
      console.log(`added ${added.users} seeded users and ${added.events} events over the last 30 days; open /admin to see them`)
    }
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  } finally {
    await db.$client.end()
  }
}
