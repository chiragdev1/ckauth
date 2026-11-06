import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { referralVisitsTable, usersTable } from '../src/db/schema.js'
import { normalizeRefSource } from '../src/app/metrics/sources.js'
import { Client, createUser, findUser, resetDatabase, signIn, startApp } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

async function visitCounts() {
  return db.select({source: referralVisitsTable.source, visits: referralVisitsTable.visits}).from(referralVisitsTable)
}

describe('normalizeRefSource', () => {
  test('accepts a known source in any case, with stray spaces', () => {
    for(const raw of ['x', 'X', ' x ', '\tX\n']) assert.equal(normalizeRefSource(raw), 'x')
  })

  test('anything else is null, never an error', () => {
    for(const raw of ['twitter', 'lol', '', 'x'.repeat(5000), ' '.repeat(40) + 'x', 123, null, undefined, ['x'], {ref: 'x'}]) {
      assert.equal(normalizeRefSource(raw), null)
    }
  })
})

describe('POST /metrics/visit', () => {
  test('counts a known source, one row per day', async () => {
    const client = new Client(baseUrl)
    for(const ref of ['x', 'X', ' x ']) {
      const response = await client.post('/metrics/visit', {ref})
      assert.equal(response.status, 200)
    }
    assert.deepEqual(await visitCounts(), [{source: 'x', visits: 3}])
  })

  test('an unknown source gets the same answer but stores nothing', async () => {
    const known = await new Client(baseUrl).post('/metrics/visit', {ref: 'x'})
    await resetDatabase()
    for(const ref of ['lol', 123, ['x'], {a: 1}, null]) {
      const response = await new Client(baseUrl).post('/metrics/visit', {ref})
      assert.equal(response.status, known.status)
      assert.deepEqual(response.body, known.body)
    }
    assert.deepEqual(await visitCounts(), [])
  })

  // the upsert adds in one statement, so concurrent visits can't overwrite each other's count
  test('visits at the same moment all count', async () => {
    await Promise.all(Array.from({length: 20}, () => new Client(baseUrl).post('/metrics/visit', {ref: 'x'})))
    assert.deepEqual(await visitCounts(), [{source: 'x', visits: 20}])
  })
})

describe('sign-up source', () => {
  const signUp = (email: string, ref: unknown) =>
    new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email, password: 'secret123', ref})

  test('a sign-up keeps the source it arrived with', async () => {
    assert.equal((await signUp('ada@ckauth.test', 'X')).status, 201)
    assert.equal((await findUser('ada@ckauth.test'))?.signupSource, 'x')
  })

  test('no ref or a bad ref still signs up, with no source', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/sign-up', {firstName: 'Ada', email: 'none@ckauth.test', password: 'secret123'})).status, 201)
    assert.equal((await signUp('bad@ckauth.test', {evil: true})).status, 201)
    assert.equal((await findUser('none@ckauth.test'))?.signupSource, null)
    assert.equal((await findUser('bad@ckauth.test'))?.signupSource, null)
  })

  test('signing up again keeps the first source', async () => {
    await signUp('ada@ckauth.test', 'x')
    // let the link expire, so the repeat sign-up replaces the details
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.email, 'ada@ckauth.test'))
    assert.equal((await signUp('ada@ckauth.test', undefined)).status, 201)
    assert.equal((await findUser('ada@ckauth.test'))?.signupSource, 'x')
  })
})

describe('GET /admin/stats referrals', () => {
  test('visits, sign-ups and verified per source over the last 30 days', async () => {
    const admin = await createUser({role: 'admin'})
    const client = await signIn(baseUrl, admin)
    const day = 24 * 60 * 60 * 1000

    await db.insert(referralVisitsTable).values([
      {source: 'x', visits: 5},
      // older than 30 days, so left out
      {source: 'x', visits: 100, day: new Date(Date.now() - 40 * day).toISOString().slice(0, 10)},
    ])
    const verified = await createUser()
    const unverified = await createUser({verified: false})
    const old = await createUser()
    await db.update(usersTable).set({signupSource: 'x'}).where(eq(usersTable.id, verified.id))
    await db.update(usersTable).set({signupSource: 'x'}).where(eq(usersTable.id, unverified.id))
    await db.update(usersTable).set({signupSource: 'x', createdAt: new Date(Date.now() - 40 * day)}).where(eq(usersTable.id, old.id))

    const {data} = (await client.get('/admin/stats')).body
    assert.deepEqual(data.referrals, [{source: 'x', visits: 5, signUps: 2, verified: 1}])
  })
})
