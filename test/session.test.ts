import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, resetDatabase, sessionsOf, sha256, signIn, startApp } from './helpers.js'

const baseUrl = await startApp()

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET_KEY!
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET_KEY!

beforeEach(resetDatabase)

describe('GET /auth/me (authenticateToken)', () => {
  test('without a session is a 401', async () => {
    assert.equal((await new Client(baseUrl).get('/auth/me')).status, 401)
  })

  test('a tampered, expired or wrongly signed access token is a 401', async () => {
    const user = await createUser()
    const valid = (await signIn(baseUrl, user)).cookie('access_token')!

    const forged = [
      `${valid.slice(0, -2)}xx`,
      jwt.sign({userId: user.id}, ACCESS_SECRET, {expiresIn: '-1s'}),
      jwt.sign({userId: user.id}, 'not-the-secret'),
      jwt.sign({something: 'else'}, ACCESS_SECRET),
      // signed correctly, but from before sessions existed: no session id
      jwt.sign({userId: user.id}, ACCESS_SECRET),
      // a real session and the right secret, but HS512: only the algorithm we sign with is accepted
      jwt.sign(jwt.decode(valid) as object, ACCESS_SECRET, {algorithm: 'HS512'}),
    ]
    for(const token of forged) {
      const client = new Client(baseUrl)
      client.setCookie('access_token', token)
      assert.equal((await client.get('/auth/me')).status, 401, token)
    }
  })

  test('a valid token for a deleted user is a 401', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    await db.delete(usersTable).where(eq(usersTable.id, user.id))

    assert.equal((await client.get('/auth/me')).status, 401)
  })
})

describe('POST /auth/refresh', () => {
  test('replaces both tokens and the stored hash, and the old refresh token stops working', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    const oldDevice = client.clone()

    const refreshed = await client.post('/auth/refresh')
    assert.equal(refreshed.status, 200)
    assert.notEqual(client.cookie('refresh_token'), oldDevice.cookie('refresh_token'))
    const sessions = await sessionsOf(user.id)
    assert.equal(sessions.length, 1, 'a refresh rotates the session, it doesn\'t add one')
    assert.equal(sessions[0]?.refreshTokenHash, sha256(client.cookie('refresh_token')!))

    assert.equal((await oldDevice.post('/auth/refresh')).status, 401)
  })

  test('without a refresh token is a 401 with code NO_SESSION, so a client knows nobody was signed in', async () => {
    const response = await new Client(baseUrl).post('/auth/refresh')
    assert.equal(response.status, 401)
    assert.equal(response.body.code, 'NO_SESSION')
  })

  test('a correctly signed token that is not the stored one is a 401', async () => {
    const user = await createUser()
    await signIn(baseUrl, user)

    const client = new Client(baseUrl)
    client.setCookie('refresh_token', jwt.sign({userId: user.id}, REFRESH_SECRET))
    assert.equal((await client.post('/auth/refresh')).status, 401)
  })

  test('an access token sent as the refresh token is a 401', async () => {
    const client = await signIn(baseUrl, await createUser())
    client.setCookie('refresh_token', client.cookie('access_token')!)

    assert.equal((await client.post('/auth/refresh')).status, 401)
  })
})

describe('POST /auth/logout', () => {
  test('clears both cookies and revokes the refresh token', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    const copy = client.clone()

    const response = await client.post('/auth/logout')
    assert.equal(response.status, 200)
    assert.equal(client.cookie('access_token'), undefined)
    assert.equal(client.cookie('refresh_token'), undefined)

    assert.equal((await sessionsOf(user.id)).length, 0)
    assert.equal((await copy.post('/auth/refresh')).status, 401)
    // the access token carries the session id, so it stops working at once instead of when it expires
    assert.equal((await copy.get('/auth/me')).status, 401)
  })

  test('works without any cookies', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/logout')).status, 200)
  })

  test('works after the access token has expired, since the route needs no auth', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    client.setCookie('access_token', jwt.sign({userId: user.id}, ACCESS_SECRET, {expiresIn: '-1s'}))

    assert.equal((await client.post('/auth/logout')).status, 200)
    assert.equal((await sessionsOf(user.id)).length, 0)
  })

  test('a refresh token that belongs to nobody revokes nobody', async () => {
    const user = await createUser()
    const session = await signIn(baseUrl, user)

    const stranger = new Client(baseUrl)
    stranger.setCookie('refresh_token', jwt.sign({userId: user.id}, REFRESH_SECRET))
    await stranger.post('/auth/logout')

    assert.equal((await session.post('/auth/refresh')).status, 200)
  })
})

describe('sessions per device', () => {
  test('signing in on a second device keeps the first one signed in', async () => {
    const user = await createUser()
    const laptop = await signIn(baseUrl, user)
    const phone = await signIn(baseUrl, user)

    assert.equal((await sessionsOf(user.id)).length, 2)
    assert.equal((await laptop.get('/auth/me')).status, 200)
    assert.equal((await laptop.post('/auth/refresh')).status, 200)
    assert.equal((await phone.post('/auth/refresh')).status, 200)
  })

  test('signing out one device leaves the others signed in', async () => {
    const user = await createUser()
    const laptop = await signIn(baseUrl, user)
    const phone = await signIn(baseUrl, user)

    await laptop.post('/auth/logout')
    assert.equal((await phone.get('/auth/me')).status, 200)
  })

  test('an 11th sign-in signs out the device used least recently', async () => {
    const user = await createUser()
    const first = await signIn(baseUrl, user)
    for(let device = 0; device < 10; device++) {
      await signIn(baseUrl, user)
    }

    assert.equal((await sessionsOf(user.id)).length, 10)
    assert.equal((await first.get('/auth/me')).status, 401)
  })

  test('records the browser and the IP address the device list shows', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)

    const [session] = await sessionsOf(user.id)
    assert.equal(session?.ipAddress, client.ip)
    assert.equal(session?.userAgent, 'node')
  })

  test('an ipv4 visitor\'s address is stored in its plain form, not as ::ffff:…', async () => {
    const user = await createUser()
    await new Client(baseUrl, '::ffff:203.0.113.7').post('/auth/sign-in', {email: user.email, password: user.password})

    const [session] = await sessionsOf(user.id)
    assert.equal(session?.ipAddress, '203.0.113.7')
  })

  test('a change of password signs out every other device, and this one stays signed in', async () => {
    const user = await createUser()
    const laptop = await signIn(baseUrl, user)
    const phone = await signIn(baseUrl, user)

    const changed = await laptop.post('/auth/change-password', {currentPassword: user.password, newPassword: 'brand-new-password'})
    assert.equal(changed.status, 200)
    assert.equal((await phone.get('/auth/me')).status, 401)
    assert.equal((await laptop.get('/auth/me')).status, 200)
    assert.equal((await sessionsOf(user.id)).length, 1)
  })
})

describe('GET /auth/sessions', () => {
  test('lists this account\'s devices, marks the current one, and never sends the token hash', async () => {
    const user = await createUser()
    await signIn(baseUrl, user)
    const phone = await signIn(baseUrl, user)
    // someone else's session must not appear
    await signIn(baseUrl, await createUser())

    const response = await phone.get('/auth/sessions')
    assert.equal(response.status, 200)
    assert.equal(response.body.data.length, 2)
    assert.equal(response.body.data.filter((session: any) => session.current).length, 1)
    assert.equal(response.body.data.find((session: any) => session.current).ipAddress, phone.ip)
    for(const session of response.body.data) {
      assert.equal(session.refreshTokenHash, undefined)
      assert.equal(session.reauthenticatedAt, undefined)
    }
  })

  test('needs a session', async () => {
    assert.equal((await new Client(baseUrl).get('/auth/sessions')).status, 401)
  })
})

describe('DELETE /auth/sessions/:id', () => {
  test('signs that device out at once', async () => {
    const user = await createUser()
    const laptop = await signIn(baseUrl, user)
    const phone = await signIn(baseUrl, user)
    const phoneSession = (await phone.get('/auth/sessions')).body.data.find((session: any) => session.current)

    const response = await laptop.delete(`/auth/sessions/${phoneSession.id}`)
    assert.equal(response.status, 200)
    assert.equal((await phone.get('/auth/me')).status, 401)
    assert.equal((await phone.post('/auth/refresh')).status, 401)
    assert.equal((await laptop.get('/auth/me')).status, 200)
  })

  test('ending your own session clears your cookies, like signing out', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    const [session] = await sessionsOf(user.id)

    assert.equal((await client.delete(`/auth/sessions/${session!.id}`)).status, 200)
    assert.equal(client.cookie('access_token'), undefined)
  })

  test('someone else\'s session is a 404, and keeps working', async () => {
    const victim = await createUser()
    const victimClient = await signIn(baseUrl, victim)
    const [victimSession] = await sessionsOf(victim.id)
    const attacker = await signIn(baseUrl, await createUser())

    assert.equal((await attacker.delete(`/auth/sessions/${victimSession!.id}`)).status, 404)
    assert.equal((await victimClient.get('/auth/me')).status, 200)
  })

  test('an id that isn\'t a uuid is a 400', async () => {
    const client = await signIn(baseUrl, await createUser())
    assert.equal((await client.delete('/auth/sessions/not-a-uuid')).status, 400)
  })
})

describe('DELETE /auth/sessions', () => {
  test('signs out every other device and keeps this one', async () => {
    const user = await createUser()
    const laptop = await signIn(baseUrl, user)
    const phone = await signIn(baseUrl, user)
    const tablet = await signIn(baseUrl, user)

    const response = await laptop.delete('/auth/sessions')
    assert.equal(response.status, 200)
    assert.equal(response.body.data.count, 2)
    assert.equal((await phone.get('/auth/me')).status, 401)
    assert.equal((await tablet.post('/auth/refresh')).status, 401)
    assert.equal((await laptop.get('/auth/me')).status, 200)
  })
})
