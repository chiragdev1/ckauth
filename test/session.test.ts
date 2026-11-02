import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, resetDatabase, sha256, signIn, startApp } from './helpers.js'

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
    assert.equal((await findUser(user.email))?.refreshToken, sha256(client.cookie('refresh_token')!))

    assert.equal((await oldDevice.post('/auth/refresh')).status, 401)
  })

  test('without a refresh token is a 401', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/refresh')).status, 401)
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

    assert.equal((await findUser(user.email))?.refreshToken, null)
    assert.equal((await copy.post('/auth/refresh')).status, 401)
  })

  test('works without any cookies', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/logout')).status, 200)
  })

  test('works after the access token has expired, since the route needs no auth', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    client.setCookie('access_token', jwt.sign({userId: user.id}, ACCESS_SECRET, {expiresIn: '-1s'}))

    assert.equal((await client.post('/auth/logout')).status, 200)
    assert.equal((await findUser(user.email))?.refreshToken, null)
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
