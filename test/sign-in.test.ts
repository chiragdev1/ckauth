import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, mailsTo, resetDatabase, sessionsOf, sha256, signIn, startApp } from './helpers.js'

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

    const [session] = await sessionsOf(user.id)
    assert.equal(session?.refreshTokenHash, sha256(client.cookie('refresh_token')!))
  })

  test('/auth/me returns only safe fields', async () => {
    const client = await signIn(baseUrl, await createUser())

    const me = await client.get('/auth/me')
    assert.equal(me.status, 200)
    assert.deepEqual(Object.keys(me.body.data).sort(), ['age', 'avatarUrl', 'createdAt', 'email', 'emailVerified', 'firstName', 'id', 'lastName', 'role'])
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
    // the only mail is the new sign-in notice
    assert.deepEqual(mailsTo(user.email).map(mail => mail.subject), ['New sign-in to your CKAuth account'])
  })
})

describe('new sign-in emails', () => {
  const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

  async function signInAs(user: {email: string, password: string}, userAgent: string) {
    const client = new Client(baseUrl)
    client.userAgent = userAgent
    assert.equal((await client.post('/auth/sign-in', {email: user.email, password: user.password})).status, 200)
    return client
  }

  test('a browser the account isn\'t signed in on gets an email naming it, with a link to the device list', async () => {
    const user = await createUser()
    const client = await signInAs(user, CHROME_WINDOWS)

    const mail = mailsTo(user.email).at(-1)
    assert.equal(mail?.subject, 'New sign-in to your CKAuth account')
    assert.match(mail!.text, /Chrome on Windows/)
    assert.match(mail!.text, new RegExp(client.ip.replaceAll('.', '\\.')))
    assert.match(mail!.text, /\/dashboard#devices/)
  })

  test('signing in again on the same browser sends nothing; a different one does', async () => {
    const user = await createUser()
    await signInAs(user, CHROME_WINDOWS)
    await signInAs(user, CHROME_WINDOWS)
    assert.equal(mailsTo(user.email).length, 1)

    await signInAs(user, SAFARI_IPHONE)
    assert.equal(mailsTo(user.email).length, 2)
    assert.match(mailsTo(user.email).at(-1)!.text, /Safari on iOS/)
  })

  test('a browser that was signed out counts as new again', async () => {
    const user = await createUser()
    const client = await signInAs(user, CHROME_WINDOWS)
    await client.post('/auth/logout')

    await signInAs(user, CHROME_WINDOWS)
    assert.equal(mailsTo(user.email).length, 2)
  })

  test('a wrong password sends no sign-in email', async () => {
    const user = await createUser()
    await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: 'wrong-password'})
    assert.equal(mailsTo(user.email).length, 0)
  })
})
