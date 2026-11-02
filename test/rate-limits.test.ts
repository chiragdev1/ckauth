import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { Client, createUser, resetDatabase, signIn, startApp } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

const BAD_TOKEN = '0'.repeat(64)

// sends `limit` requests that are allowed, then one more that must be refused with the standard headers
async function assertLimit(limit: number, send: (attempt: number) => Promise<{status: number, headers: Headers}>) {
  for(let attempt = 0; attempt < limit; attempt++) {
    const response = await send(attempt)
    assert.notEqual(response.status, 429, `request ${attempt + 1} of ${limit} was already limited`)
  }
  const over = await send(limit)
  assert.equal(over.status, 429)
  assert.ok(over.headers.get('ratelimit-policy'), 'the RateLimit-Policy header is missing')
}

// docs/API.md, "Rate limits": every endpoint that checks a password, sends an email or uses a single-use token
describe('per-IP limits', () => {
  test('sign-up: 10 per hour', async () => {
    const client = new Client(baseUrl)
    await assertLimit(10, () => client.post('/auth/sign-up', {}))
  })

  test('forgot-password: 10 per hour', async () => {
    const client = new Client(baseUrl)
    await assertLimit(10, attempt => client.post('/auth/forgot-password', {email: `nobody${attempt}@ckauth.test`}))
  })

  test('verify-email: 20 per 15 minutes', async () => {
    const client = new Client(baseUrl)
    await assertLimit(20, () => client.post(`/auth/verify-email/${BAD_TOKEN}`, {password: 'secret123'}))
  })

  test('reset-password: 20 per 15 minutes', async () => {
    const client = new Client(baseUrl)
    await assertLimit(20, () => client.post(`/auth/reset-password/${BAD_TOKEN}`, {newPassword: 'secret123'}))
  })

  test('refresh: 60 per minute', async () => {
    const client = new Client(baseUrl)
    await assertLimit(60, () => client.post('/auth/refresh'))
  })

  test('another IP is counted separately', async () => {
    const first = new Client(baseUrl)
    for(let attempt = 0; attempt < 10; attempt++) {
      await first.post('/auth/sign-up', {})
    }
    assert.equal((await first.post('/auth/sign-up', {})).status, 429)
    assert.equal((await new Client(baseUrl).post('/auth/sign-up', {})).status, 400)
  })
})

describe('per-email limits', () => {
  test('forgot-password: 3 per hour, the same for an email with no account (no enumeration)', async () => {
    const user = await createUser()
    for(const email of [user.email, 'nobody@ckauth.test']) {
      // a new client (so a new IP) every time: only the email is the same
      await assertLimit(3, () => new Client(baseUrl).post('/auth/forgot-password', {email}))
    }
  })

  test('sign-in: case and spaces don\'t get around the per-email count', async () => {
    const user = await createUser({email: 'case@ckauth.test'})
    for(const email of ['case@ckauth.test', 'CASE@ckauth.test', ' Case@ckauth.test ', 'case@CKAUTH.test', 'CASE@CKAUTH.TEST']) {
      await new Client(baseUrl).post('/auth/sign-in', {email, password: 'wrong-password'})
    }
    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})).status, 429)
  })
})

describe('per-user limits', () => {
  test('change-password: 5 per 15 minutes', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    await assertLimit(5, () => client.post('/auth/change-password', {currentPassword: 'wrong-password', newPassword: 'brand-new-password'}))
  })

  test('upload-avatar: 10 per hour', async () => {
    const client = await signIn(baseUrl, await createUser())
    await assertLimit(10, () => client.post('/auth/upload-avatar', {}))
  })
})
