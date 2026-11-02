import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import pg from 'pg'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, lastMailTo, mailsTo, resetDatabase, sha256, signIn, startApp, tokenFrom } from './helpers.js'

const MISSING_ID = '00000000-0000-4000-8000-000000000000'

// top level, not in before(): startApp registers its after() cleanup, which inside a hook would run as soon as the hook ends
const baseUrl = await startApp()

beforeEach(resetDatabase)

// a signed-in admin who has confirmed their password, so writes are allowed
async function adminSession({reauth = true} = {}) {
  const admin = await createUser({role: 'admin', firstName: 'Boss'})
  const client = await signIn(baseUrl, admin)
  if(reauth) {
    assert.equal((await client.post('/admin/reauth', {password: admin.password})).status, 200)
  }
  return {admin, client}
}

describe('admin access', () => {
  test('every admin route needs a session', async () => {
    const client = new Client(baseUrl)
    for(const response of [await client.get('/admin/stats'), await client.get('/admin/users'), await client.post('/admin/reauth', {password: 'x'}), await client.post('/admin/users', {}), await client.delete(`/admin/users/${MISSING_ID}`)]) {
      assert.equal(response.status, 401)
    }
  })

  test('a plain user is refused with 403 on every route', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    for(const response of [await client.get('/admin/stats'), await client.get('/admin/users'), await client.post('/admin/reauth', {password: user.password}), await client.post('/admin/users', {}), await client.delete(`/admin/users/${MISSING_ID}`)]) {
      assert.equal(response.status, 403)
      assert.equal(response.body.message, 'You do not have permission to access this resource')
    }
  })

  test('an unverified admin cannot sign in at all', async () => {
    const ghost = await createUser({role: 'admin', verified: false})
    const response = await new Client(baseUrl).post('/auth/sign-in', {email: ghost.email, password: ghost.password})
    assert.equal(response.status, 403)
  })

  test('a role change applies on the next request, without signing in again', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    assert.equal((await client.get('/admin/stats')).status, 403)

    await db.update(usersTable).set({role: 'admin'}).where(eq(usersTable.id, user.id))
    assert.equal((await client.get('/admin/stats')).status, 200)
    assert.equal((await client.get('/auth/me')).body.data.role, 'admin')

    await db.update(usersTable).set({role: 'user'}).where(eq(usersTable.id, user.id))
    assert.equal((await client.get('/admin/stats')).status, 403)
  })
})

describe('sudo mode (POST /admin/reauth)', () => {
  test('writes need a confirmed password, with a code the frontend can act on', async () => {
    const {client} = await adminSession({reauth: false})

    for(const response of [await client.post('/admin/users', {firstName: 'New', email: 'new@ckauth.test'}), await client.delete(`/admin/users/${MISSING_ID}`)]) {
      assert.equal(response.status, 403)
      assert.equal(response.body.code, 'REAUTH_REQUIRED')
    }
    // reads don't need it
    assert.equal((await client.get('/admin/users')).status, 200)
  })

  test('a wrong password is a 400 and unlocks nothing; the right one unlocks writes', async () => {
    const {admin, client} = await adminSession({reauth: false})

    assert.equal((await client.post('/admin/reauth', {password: 'wrong-password'})).status, 400)
    assert.equal((await client.delete(`/admin/users/${MISSING_ID}`)).body.code, 'REAUTH_REQUIRED')

    const confirmed = await client.post('/admin/reauth', {password: admin.password})
    assert.equal(confirmed.status, 200)
    assert.ok(Date.parse(confirmed.body.data.expiresAt) > Date.now() + 14 * 60_000)
    assert.equal((await client.delete(`/admin/users/${MISSING_ID}`)).status, 404)
  })

  test('the confirmation expires after 15 minutes', async () => {
    const {admin, client} = await adminSession()
    await db.update(usersTable).set({reauthenticatedAt: new Date(Date.now() - 16 * 60_000)}).where(eq(usersTable.id, admin.id))

    assert.equal((await client.delete(`/admin/users/${MISSING_ID}`)).body.code, 'REAUTH_REQUIRED')
  })

  test('signing out ends it', async () => {
    const {admin} = await adminSession()
    const client = await signIn(baseUrl, admin)
    await client.post('/auth/logout')

    assert.equal((await findUser(admin.email))?.reauthenticatedAt, null)
  })

  test('five wrong passwords lock it, like sign-in', async () => {
    const {admin, client} = await adminSession({reauth: false})
    for(let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await client.post('/admin/reauth', {password: 'wrong-password'})).status, 400)
    }
    assert.equal((await client.post('/admin/reauth', {password: admin.password})).status, 429)
  })
})

describe('GET /admin/stats', () => {
  test('counts users, verified users, admins and this week\'s sign-ups', async () => {
    const {client} = await adminSession()
    await createUser()
    await createUser({verified: false})

    const response = await client.get('/admin/stats')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.data, {totalUsers: 3, verifiedUsers: 2, admins: 1, newThisWeek: 3})
  })
})

describe('GET /admin/users', () => {
  test('lists users newest first, without any secret fields', async () => {
    const {client} = await adminSession()
    const newest = await createUser()

    const response = await client.get('/admin/users')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.data.pagination, {page: 1, limit: 20, total: 2})

    const users = response.body.data.users
    assert.equal(users[0].id, newest.id)
    for(const user of users) {
      assert.deepEqual(Object.keys(user).sort(), ['age', 'avatarUrl', 'createdAt', 'email', 'emailVerified', 'firstName', 'id', 'lastName', 'role'])
    }
  })

  test('pages never overlap, and a page past the end is empty', async () => {
    const {client} = await adminSession()
    for(let i = 0; i < 4; i++) {
      await createUser()
    }

    const pages = await Promise.all([1, 2, 3].map(page => client.get(`/admin/users?page=${page}&limit=2`)))
    const ids = pages.flatMap(page => page.body.data.users.map((user: {id: string}) => user.id))

    assert.equal(ids.length, 5)
    assert.equal(new Set(ids).size, 5)
    assert.deepEqual((await client.get('/admin/users?page=99')).body.data.users, [])
  })

  test('search matches name or email, ignoring case, and counts only matches', async () => {
    const {client} = await adminSession()
    await createUser({email: 'ada@ckauth.test', firstName: 'Ada'})
    await createUser({email: 'grace@ckauth.test', firstName: 'Grace'})

    const byName = await client.get('/admin/users?search=GRACE')
    assert.deepEqual(byName.body.data.users.map((user: {email: string}) => user.email), ['grace@ckauth.test'])
    assert.equal(byName.body.data.pagination.total, 1)

    const byEmail = await client.get('/admin/users?search=ada@')
    assert.deepEqual(byEmail.body.data.users.map((user: {email: string}) => user.email), ['ada@ckauth.test'])
  })

  test('search treats % and _ as plain characters, not wildcards', async () => {
    const {client} = await adminSession()
    await createUser({email: 'a_b@ckauth.test'})
    await createUser({email: 'axb@ckauth.test'})

    const underscore = await client.get(`/admin/users?search=${encodeURIComponent('a_b')}`)
    assert.deepEqual(underscore.body.data.users.map((user: {email: string}) => user.email), ['a_b@ckauth.test'])
    assert.equal((await client.get(`/admin/users?search=${encodeURIComponent('%')}`)).body.data.users.length, 0)
  })

  test('rejects bad paging and search values', async () => {
    const {client} = await adminSession()
    for(const query of ['limit=0', 'limit=101', 'limit=abc', 'page=0', 'page=-1', 'page=1.5', `search=${'a'.repeat(101)}`]) {
      assert.equal((await client.get(`/admin/users?${query}`)).status, 400, query)
    }
  })
})

describe('POST /admin/users (invite)', () => {
  test('creates an account without a password and emails a link to choose one', async () => {
    const {client} = await adminSession()

    const response = await client.post('/admin/users', {firstName: '  New  ', email: '  NEW@ckauth.test '})
    assert.equal(response.status, 201)
    assert.equal(response.body.data.email, 'new@ckauth.test')
    assert.equal(response.body.data.firstName, 'New')
    assert.equal(response.body.data.role, 'user')
    assert.equal(response.body.data.emailVerified, false)

    const stored = await findUser('new@ckauth.test')
    assert.equal(stored?.password, null)

    const mail = lastMailTo('new@ckauth.test')
    assert.match(mail.subject, /invited/)
    assert.match(mail.text, /\/reset-password\?token=[0-9a-f]{64}&invite=1/)
    assert.equal(stored?.resetPasswordToken, sha256(tokenFrom(mail)))
    const hoursLeft = (stored!.resetPasswordTokenExpiry!.getTime() - Date.now()) / 3_600_000
    assert.ok(hoursLeft > 71 && hoursLeft <= 72, `invite expires in ${hoursLeft} hours`)
  })

  test('nobody can sign in before the link is used; using it sets the password and verifies the email', async () => {
    const {client} = await adminSession()
    await client.post('/admin/users', {firstName: 'New', email: 'new@ckauth.test'})
    const token = tokenFrom(lastMailTo('new@ckauth.test'))

    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {email: 'new@ckauth.test', password: 'anything'})).status, 401)

    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: 'chosen-password'})).status, 200)
    assert.equal((await findUser('new@ckauth.test'))?.emailVerified, true)
    await signIn(baseUrl, {email: 'new@ckauth.test', password: 'chosen-password'})
  })

  test('cannot set a role or a password: admins are made on the server only', async () => {
    const {client} = await adminSession()

    for(const extra of [{role: 'admin'}, {role: 'user'}, {password: 'secret123'}, {emailVerified: true}]) {
      const response = await client.post('/admin/users', {firstName: 'New', email: 'new@ckauth.test', ...extra})
      assert.equal(response.status, 400, JSON.stringify(extra))
    }
    assert.equal(await findUser('new@ckauth.test'), undefined)
  })

  test('a taken email is a 409, whatever its case, and sends nothing', async () => {
    const {client} = await adminSession()
    const existing = await createUser({email: 'taken@ckauth.test'})

    const response = await client.post('/admin/users', {firstName: 'Copy', email: existing.email.toUpperCase()})
    assert.equal(response.status, 409)
    assert.equal(mailsTo(existing.email).length, 0)
  })

  test('rejects bad input', async () => {
    const {client} = await adminSession()
    for(const body of [{firstName: 'A', email: 'new@ckauth.test'}, {firstName: 'New', email: 'nope'}, {}]) {
      assert.equal((await client.post('/admin/users', body)).status, 400, JSON.stringify(body))
    }
  })
})

describe('DELETE /admin/users/:id', () => {
  test('deletes a user, ends their sessions and tells them by email', async () => {
    const {client} = await adminSession()
    const user = await createUser()
    const userSession = await signIn(baseUrl, user)

    const response = await client.delete(`/admin/users/${user.id}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.id, user.id)

    assert.equal((await userSession.get('/auth/me')).status, 401)
    assert.equal((await userSession.post('/auth/refresh')).status, 401)
    assert.match(lastMailTo(user.email).subject, /deleted/)
    assert.equal((await client.delete(`/admin/users/${user.id}`)).status, 404)
  })

  test('an unverified address gets no deletion mail, since it may not be theirs', async () => {
    const {client} = await adminSession()
    const user = await createUser({verified: false})

    assert.equal((await client.delete(`/admin/users/${user.id}`)).status, 200)
    assert.equal(mailsTo(user.email).length, 0)
  })

  test('an admin cannot delete themselves or another admin', async () => {
    const {admin, client} = await adminSession()
    const otherAdmin = await createUser({role: 'admin'})

    const self = await client.delete(`/admin/users/${admin.id}`)
    assert.equal(self.status, 403)
    assert.match(self.body.message, /their own account/)

    const other = await client.delete(`/admin/users/${otherAdmin.id}`)
    assert.equal(other.status, 403)
    assert.match(other.body.message, /another admin/)
  })

  test('a promotion that commits while the delete waits wins: the new admin is not deleted', async () => {
    const {client} = await adminSession()
    const user = await createUser()

    // a second connection promotes the user and holds the row lock without committing yet
    const promoter = new pg.Client({connectionString: process.env.DATABASE_URL})
    await promoter.connect()
    try {
      await promoter.query('begin')
      await promoter.query(`update users set role = 'admin' where id = $1`, [user.id])

      // the delete now has to wait for that lock; give it time to get there, then commit the promotion
      const deleting = client.delete(`/admin/users/${user.id}`)
      await new Promise(resolve => setTimeout(resolve, 300))
      await promoter.query('commit')

      // postgres re-checks the delete's WHERE on the committed row, sees an admin, and deletes nothing.
      // a separate "select role, then delete" would have read 'user' before the lock and deleted the new admin
      const response = await deleting
      assert.equal(response.status, 403)
      assert.equal((await findUser(user.email))?.role, 'admin')
    } finally {
      await promoter.end()
    }
  })

  test('a user who has an avatar is still deleted when the image cleanup fails', async () => {
    const {client} = await adminSession()
    const user = await createUser()
    await db.update(usersTable).set({avatarFileId: 'missing-file', avatarUrl: 'https://example.com/a.png'}).where(eq(usersTable.id, user.id))

    assert.equal((await client.delete(`/admin/users/${user.id}`)).status, 200)
  })

  test('unknown ids are 404 and malformed ids are 400', async () => {
    const {client} = await adminSession()
    assert.equal((await client.delete(`/admin/users/${MISSING_ID}`)).status, 404)
    assert.equal((await client.delete('/admin/users/not-a-uuid')).status, 400)
  })
})

describe('admin rate limit', () => {
  test('writes stop at 30 per admin, reads are not limited', async () => {
    const {client} = await adminSession()

    const statuses: number[] = []
    for(let i = 0; i < 31; i++) {
      statuses.push((await client.delete(`/admin/users/${MISSING_ID}`)).status)
    }

    assert.ok(statuses.slice(0, 30).every((status) => status === 404))
    assert.equal(statuses[30], 429)
    assert.equal((await client.get('/admin/stats')).status, 200)
  })
})
