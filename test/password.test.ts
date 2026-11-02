import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, lastMailTo, mailsTo, resetDatabase, sha256, signIn, startApp, tokenFrom } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

async function requestReset(email: string) {
  await new Client(baseUrl).post('/auth/forgot-password', {email})
  return tokenFrom(lastMailTo(email))
}

describe('POST /auth/forgot-password', () => {
  test('answers the same for unknown and registered emails, and mails only the real one', async () => {
    const user = await createUser()

    const unknown = await new Client(baseUrl).post('/auth/forgot-password', {email: 'nobody@ckauth.test'})
    const known = await new Client(baseUrl).post('/auth/forgot-password', {email: user.email})

    assert.equal(known.status, 200)
    assert.deepEqual(known, unknown)
    assert.equal(lastMailTo(user.email).subject, 'Reset your password')
    assert.equal(mailsTo('nobody@ckauth.test').length, 0)
  })

  test('stores only the hash of the reset token', async () => {
    const user = await createUser()
    const token = await requestReset(user.email)

    assert.equal((await findUser(user.email))?.resetPasswordToken, sha256(token))
  })

  test('an invalid email is a 400', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/forgot-password', {email: 'nope'})).status, 400)
  })
})

describe('POST /auth/reset-password/:token', () => {
  test('sets the new password once and signs out every session', async () => {
    const user = await createUser()
    const session = await signIn(baseUrl, user)
    const token = await requestReset(user.email)

    const reset = await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: 'brand-new-password'})
    assert.equal(reset.status, 200)

    const reused = await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: 'another-password'})
    assert.equal(reused.status, 404)

    assert.equal((await session.post('/auth/refresh')).status, 401)
    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})).status, 401)
    await signIn(baseUrl, {email: user.email, password: 'brand-new-password'})
  })

  test('an expired or unknown token is a 404', async () => {
    const user = await createUser()
    const token = await requestReset(user.email)
    await db.update(usersTable).set({resetPasswordTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.id, user.id))

    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: 'brand-new-password'})).status, 404)
    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${'0'.repeat(64)}`, {newPassword: 'brand-new-password'})).status, 404)
  })

  test('a too-short password is a 400 and leaves the link usable', async () => {
    const user = await createUser()
    const token = await requestReset(user.email)

    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: '123'})).status, 400)
    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: 'brand-new-password'})).status, 200)
  })
})

describe('POST /auth/change-password', () => {
  test('needs the current password and signs out other devices only', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    const otherDevice = await signIn(baseUrl, user)

    const wrong = await client.post('/auth/change-password', {currentPassword: 'wrong-password', newPassword: 'brand-new-password'})
    assert.equal(wrong.status, 400)

    const same = await client.post('/auth/change-password', {currentPassword: user.password, newPassword: user.password})
    assert.equal(same.status, 400)

    const changed = await client.post('/auth/change-password', {currentPassword: user.password, newPassword: 'brand-new-password'})
    assert.equal(changed.status, 200)

    assert.equal((await client.get('/auth/me')).status, 200)
    assert.equal((await otherDevice.post('/auth/refresh')).status, 401)
    await signIn(baseUrl, {email: user.email, password: 'brand-new-password'})
  })

  test('a wrong current password leaves the old one working', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)

    await client.post('/auth/change-password', {currentPassword: 'wrong-password', newPassword: 'brand-new-password'})
    await signIn(baseUrl, user)
  })

  test('without a session is a 401', async () => {
    const response = await new Client(baseUrl).post('/auth/change-password', {currentPassword: 'secret123', newPassword: 'brand-new-password'})
    assert.equal(response.status, 401)
  })
})
