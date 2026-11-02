import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, mailsTo, resetDatabase, sha256, signIn, startApp } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

describe('POST /auth/sign-in', () => {
  test('a verified user gets both tokens as httpOnly, SameSite=Lax cookies', async () => {
    const user = await createUser()
    const client = new Client(baseUrl)

    const response = await client.post('/auth/sign-in', {email: user.email, password: user.password})
    assert.equal(response.status, 200)

    for(const name of ['access_token', 'refresh_token']) {
      const line = response.setCookies.find(cookie => cookie.startsWith(`${name}=`))
      assert.ok(line, `${name} cookie missing`)
      assert.match(line, /; HttpOnly/i)
      assert.match(line, /; SameSite=Lax/i)
      assert.match(line, /; Expires=/i)
    }
  })

  test('stores only the sha256 hash of the refresh token', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)

    assert.equal((await findUser(user.email))?.refreshToken, sha256(client.cookie('refresh_token')!))
  })

  test('/auth/me returns only safe fields', async () => {
    const client = await signIn(baseUrl, await createUser())

    const me = await client.get('/auth/me')
    assert.equal(me.status, 200)
    assert.deepEqual(Object.keys(me.body.data).sort(), ['age', 'avatarUrl', 'email', 'emailVerified', 'firstName', 'id', 'lastName', 'role'])
  })

  test('accepts the email in any case, with spaces around it', async () => {
    const user = await createUser({email: 'case@ckauth.test'})
    const response = await new Client(baseUrl).post('/auth/sign-in', {email: '  CASE@ckauth.test ', password: user.password})
    assert.equal(response.status, 200)
  })

  test('an unknown email and a wrong password give the same answer', async () => {
    const user = await createUser()

    const unknown = await new Client(baseUrl).post('/auth/sign-in', {email: 'nobody@ckauth.test', password: 'secret123'})
    const wrong = await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: 'wrong-password'})

    assert.equal(unknown.status, 401)
    assert.deepEqual(wrong, unknown)
  })

  test('invalid input is a 400', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {email: 'nope', password: '1'})).status, 400)
    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {})).status, 400)
  })

  test('five failed attempts lock the email, even for the right password', async () => {
    const user = await createUser()

    for(let attempt = 0; attempt < 5; attempt++) {
      const response = await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: 'wrong-password'})
      assert.equal(response.status, 401)
    }

    const locked = await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})
    assert.equal(locked.status, 429)
  })
})

describe('signing in before the email is verified', () => {
  test('gives no session, and sends a link only when there is no valid one', async () => {
    const user = await createUser({verified: false})
    const client = new Client(baseUrl)

    const response = await client.post('/auth/sign-in', {email: user.email, password: user.password})
    assert.equal(response.status, 403)
    assert.equal(client.cookie('access_token'), undefined)
    assert.equal(mailsTo(user.email).length, 1)

    // the link from the first try is still valid, so a second try sends nothing new
    await client.post('/auth/sign-in', {email: user.email, password: user.password})
    assert.equal(mailsTo(user.email).length, 1)
  })

  test('sends a new link once the last one has expired', async () => {
    const user = await createUser({verified: false})
    await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.id, user.id))

    await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})
    assert.equal(mailsTo(user.email).length, 2)
  })

  test('a verified user is never sent a verification link', async () => {
    const user = await createUser()
    await signIn(baseUrl, user)
    assert.equal(mailsTo(user.email).length, 0)
  })
})
