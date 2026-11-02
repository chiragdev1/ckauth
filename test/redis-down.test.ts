import assert from 'node:assert/strict'
import { after, test } from 'node:test'

// a redis nobody listens on, set before the app is imported (rate-limit.ts reads REDIS_URL at import);
// this file runs in its own process, so no other test sees it
process.env.REDIS_URL = 'redis://127.0.0.1:1'

const { Client, createUser, resetDatabase, startApp } = await import('./helpers.js')
const { closeRateLimitStore } = await import('../src/app/middlewares/rate-limit.js')

const baseUrl = await startApp()
after(closeRateLimitStore)

test('with redis unreachable, rate-limited requests still go through, without waiting for it', async () => {
  await resetDatabase()
  const user = await createUser()

  const started = Date.now()
  const response = await new Client(baseUrl).post('/auth/sign-in', {email: user.email, password: user.password})
  const elapsed = Date.now() - started

  // fails open (docs: known gaps) and fast: a queued redis command used to hold every limited request for ~5 s
  assert.equal(response.status, 200)
  assert.ok(elapsed < 1000, `sign-in took ${elapsed} ms with redis down`)
})
