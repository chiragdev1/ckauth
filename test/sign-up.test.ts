import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, lastMailTo, resetDatabase, sha256, signUp, startApp, tokenFrom } from './helpers.js'

// top level, not in before(): startApp registers its after() cleanup, which inside a hook would run as soon as the hook ends
const baseUrl = await startApp()

beforeEach(resetDatabase)

describe('POST /auth/sign-up', () => {
  test('a new email gets the generic answer, a verification link and no session', async () => {
    const client = new Client(baseUrl)
    const response = await client.post('/auth/sign-up', {firstName: 'Ada', email: 'ada@ckauth.test', password: 'secret123'})

    assert.equal(response.status, 201)
    assert.equal(response.body.message, 'Check your email to finish creating your account')
    assert.equal(lastMailTo('ada@ckauth.test').subject, 'Verify your email address')
    assert.equal(client.cookie('access_token'), undefined)
  })

  test('stores a bcrypt hash, never the password itself', async () => {
    await signUp(baseUrl, 'hash@ckauth.test', 'secret123')
    const user = await findUser('hash@ckauth.test')

    assert.ok(user?.password?.startsWith('$2'))
    assert.notEqual(user?.password, 'secret123')
    assert.equal(await bcrypt.compare('secret123', user!.password!), true)
  })

  test('stores only the hash of the link token, expiring in 15 minutes', async () => {
    const token = await signUp(baseUrl, 'token@ckauth.test')
    const user = await findUser('token@ckauth.test')

    assert.equal(user?.emailVerificationToken, sha256(token))
    const minutesLeft = (user!.emailVerificationTokenExpiry!.getTime() - Date.now()) / 60_000
    assert.ok(minutesLeft > 14 && minutesLeft <= 15, `link expires in ${minutesLeft} minutes`)
  })

  test('saves the email trimmed and lower-cased', async () => {
    await new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email: '  Ada@CKAuth.test ', password: 'secret123'})
    assert.ok(await findUser('ada@ckauth.test'))
  })

  test('a registered email gets exactly the same answer, and only the owner hears about it', async () => {
    const existing = await createUser()

    const forNew = await new Client(baseUrl).post('/auth/sign-up', {firstName: 'New', email: 'new@ckauth.test', password: 'secret123'})
    const forExisting = await new Client(baseUrl).post('/auth/sign-up', {firstName: 'Copy', email: existing.email.toUpperCase(), password: 'other-password'})

    // no account enumeration: the response can't tell the two apart
    assert.deepEqual(forExisting, forNew)
    assert.equal(lastMailTo(existing.email).subject, 'You already have an account')
  })

  test('two sign-ups for one email at the same moment create one account', async () => {
    const body = {firstName: 'Ada', email: 'race@ckauth.test', password: 'secret123'}
    const responses = await Promise.all([new Client(baseUrl).post('/auth/sign-up', body), new Client(baseUrl).post('/auth/sign-up', body)])

    assert.deepEqual(responses.map(response => response.status), [201, 201])
    const rows = await db.select({id: usersTable.id}).from(usersTable).where(eq(usersTable.email, 'race@ckauth.test'))
    assert.equal(rows.length, 1)
  })

  test('invalid input lists every bad field', async () => {
    const response = await new Client(baseUrl).post('/auth/sign-up', {firstName: 'A', email: 'nope', password: '1'})

    assert.equal(response.status, 400)
    assert.match(response.body.message, /firstName: .*email: .*password: /)
  })

  test('the link in the mail carries the raw token, which the frontend page posts back', async () => {
    await new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email: 'link@ckauth.test', password: 'secret123'})
    const mail = lastMailTo('link@ckauth.test')

    assert.match(mail.text, /http:\/\/ckauth\.test\/verify-email\?token=[0-9a-f]{64}/)
    assert.equal(tokenFrom(mail).length, 64)
  })
})
