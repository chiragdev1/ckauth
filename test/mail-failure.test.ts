import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, lastMailTo, resetDatabase, sha256, signIn, startApp, tokenFrom } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

// CLAUDE.md: "a failed email must never fail the request". in the tests, any address at mail-fails.test fails to send
const FAILING = 'ada@mail-fails.test'

describe('a failed email never fails the request', () => {
  test('sign-up, a repeat sign-up, and resend', async () => {
    const signUp = () => new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email: FAILING, password: 'secret123'})
    assert.equal((await signUp()).status, 201)
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.email, FAILING))
    assert.equal((await signUp()).status, 201)
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.email, FAILING))
    assert.equal((await new Client(baseUrl).post('/auth/resend-verification', {email: FAILING})).status, 200)
  })

  test('sign-up with a verified address, and an unverified sign-in', async () => {
    await createUser({email: FAILING})
    assert.equal((await new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email: FAILING, password: 'secret123'})).status, 201)

    const unverified = await createUser({email: 'new@mail-fails.test', verified: false})
    assert.equal((await new Client(baseUrl).post('/auth/sign-in', {email: unverified.email, password: unverified.password})).status, 403)
  })

  test('sign-in from a new browser, forgot password and deleting the account', async () => {
    const user = await createUser({email: FAILING})
    const client = await signIn(baseUrl, user)
    assert.equal((await new Client(baseUrl).post('/auth/forgot-password', {email: FAILING})).status, 200)
    assert.equal((await client.delete('/auth/me', {password: user.password})).status, 200)
    assert.equal(await findUser(FAILING), undefined)
  })

  test('verifying an email (welcome mail)', async () => {
    const user = await createUser({email: 'ok@ckauth.test', verified: false})
    const token = 'a'.repeat(64)
    const {createHash} = await import('node:crypto')
    await db.update(usersTable).set({
      email: FAILING,
      emailVerificationToken: createHash('sha256').update(token).digest('hex'),
      emailVerificationTokenExpiry: new Date(Date.now() + 60_000),
    }).where(eq(usersTable.id, user.id))
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: user.password})).status, 200)
  })

  test('changing email, to a taken address and to a new one, and confirming', async () => {
    const user = await createUser({email: FAILING})
    const client = await signIn(baseUrl, user)
    await createUser({email: 'taken@mail-fails.test'})
    assert.equal((await client.post('/auth/change-email', {newEmail: 'taken@mail-fails.test', password: user.password})).status, 200)

    // the confirm link goes to a working inbox, so the test can read it; the notices to the old address fail
    assert.equal((await client.post('/auth/change-email', {newEmail: 'moved@ckauth.test', password: user.password})).status, 200)
    const token = tokenFrom(lastMailTo('moved@ckauth.test'))
    assert.equal((await new Client(baseUrl).post(`/auth/confirm-email/${token}`)).status, 200)
  })

  test('changing and resetting a password (the "password was changed" notice)', async () => {
    const user = await createUser({email: FAILING})
    const client = await signIn(baseUrl, user)
    assert.equal((await client.post('/auth/change-password', {currentPassword: user.password, newPassword: 'brand-new-password'})).status, 200)

    // the reset link itself fails to send too, so the token is put in place directly
    const token = 'a'.repeat(64)
    await db.update(usersTable).set({resetPasswordToken: sha256(token), resetPasswordTokenExpiry: new Date(Date.now() + 60_000)}).where(eq(usersTable.email, FAILING))
    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${token}`, {newPassword: 'another-password'})).status, 200)
  })

  test('the confirm link itself failing to send still answers the same', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    assert.equal((await client.post('/auth/change-email', {newEmail: 'moved@mail-fails.test', password: user.password})).status, 200)
  })
})
