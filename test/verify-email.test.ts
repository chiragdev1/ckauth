import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, findUser, lastMailTo, resetDatabase, sha256, signUp, startApp } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

describe('POST /auth/verify-email/:token', () => {
  test('the right password verifies the account and starts a session, once', async () => {
    const token = await signUp(baseUrl, 'verify@ckauth.test')
    const client = new Client(baseUrl)

    const response = await client.post(`/auth/verify-email/${token}`, {password: 'secret123'})
    assert.equal(response.status, 200)
    assert.ok(client.cookie('access_token'))

    const me = await client.get('/auth/me')
    assert.equal(me.body.data.emailVerified, true)
    assert.match(lastMailTo('verify@ckauth.test').subject, /^Welcome to /)

    const again = await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'secret123'})
    assert.equal(again.status, 404)
  })

  test('a wrong password cancels the link, so the right one no longer works with it', async () => {
    const token = await signUp(baseUrl, 'wrong@ckauth.test')

    const wrong = await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'not-the-password'})
    assert.equal(wrong.status, 401)

    const right = await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'secret123'})
    assert.equal(right.status, 404)
    assert.equal((await findUser('wrong@ckauth.test'))?.emailVerified, false)
  })

  test('an expired link is refused', async () => {
    const token = await signUp(baseUrl, 'expired@ckauth.test')
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.email, 'expired@ckauth.test'))

    const response = await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'secret123'})
    assert.equal(response.status, 404)
  })

  test('the stored hash does not work as a token (a database leak gives no working links)', async () => {
    const token = await signUp(baseUrl, 'leak@ckauth.test')

    const response = await new Client(baseUrl).post(`/auth/verify-email/${sha256(token)}`, {password: 'secret123'})
    assert.equal(response.status, 404)
  })

  test('an unknown token is a 404, and an oversized one a 400', async () => {
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${'0'.repeat(64)}`, {password: 'secret123'})).status, 404)
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${'a'.repeat(101)}`, {password: 'secret123'})).status, 400)
  })
})
