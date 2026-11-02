import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { api, ApiRequestError, onSessionEnded } from '../src/lib/api.ts'

type Reply = { status: number, body?: unknown }
type Call = { url: string, method: string }

const realFetch = globalThis.fetch

// replaces fetch with a script: `reply` decides each response from the url, and every call is recorded
function fakeFetch(reply: (url: string, calls: Call[]) => Reply) {
  const calls: Call[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET' })
    // yield first, so requests started together are really in flight together, as in a browser
    await new Promise(resolve => setTimeout(resolve, 5))
    const { status, body } = reply(url, calls)
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  }) as typeof fetch
  return calls
}

afterEach(() => {
  globalThis.fetch = realFetch
})

const ok = (data: unknown = null): Reply => ({ status: 200, body: { success: true, message: 'ok', data } })
const unauthorized: Reply = { status: 401, body: { success: false, message: 'Invalid or expired token' } }

describe('api()', () => {
  test('sends everything to /api with cookies included', async () => {
    const calls = fakeFetch(() => ok({ id: 'u1' }))
    const response = await api<{ id: string }>('/auth/me')
    assert.equal(response.data.id, 'u1')
    assert.equal(calls[0]?.url, '/api/auth/me')
  })

  test('an api error becomes ApiRequestError with the status, message and code', async () => {
    fakeFetch(() => ({ status: 403, body: { success: false, message: 'Confirm your password to continue', code: 'REAUTH_REQUIRED' } }))
    await assert.rejects(api('/admin/users', { method: 'DELETE', authed: true }), (error: unknown) =>
      error instanceof ApiRequestError && error.status === 403 && error.code === 'REAUTH_REQUIRED' && error.message === 'Confirm your password to continue')
  })

  test('a response that isn\'t json (a proxy error page) still becomes a clear error', async () => {
    globalThis.fetch = (async () => new Response('<html>502</html>', { status: 502 })) as typeof fetch
    await assert.rejects(api('/auth/me'), (error: unknown) => error instanceof ApiRequestError && error.status === 502)
  })

  test('an authed 401 refreshes once and retries the request', async () => {
    let refreshed = false
    const calls = fakeFetch(url => {
      if(url === '/api/auth/refresh') { refreshed = true; return ok() }
      return refreshed ? ok({ id: 'u1' }) : unauthorized
    })

    const response = await api<{ id: string }>('/auth/me', { authed: true })
    assert.equal(response.data.id, 'u1')
    assert.deepEqual(calls.map(call => call.url), ['/api/auth/me', '/api/auth/refresh', '/api/auth/me'])
  })

  test('several 401s at the same moment share a single refresh', async () => {
    let refreshed = false
    const calls = fakeFetch(url => {
      if(url === '/api/auth/refresh') { refreshed = true; return ok() }
      return refreshed ? ok() : unauthorized
    })

    await Promise.all([api('/admin/stats', { authed: true }), api('/admin/users', { authed: true }), api('/auth/me', { authed: true })])
    assert.equal(calls.filter(call => call.url === '/api/auth/refresh').length, 1)
  })

  test('a failed refresh gives back the original 401, with no loop', async () => {
    const calls = fakeFetch(() => unauthorized)
    await assert.rejects(api('/auth/me', { authed: true }), (error: unknown) => error instanceof ApiRequestError && error.status === 401)
    // one try, one refresh, and the logout that clears the dead cookie; never a second refresh
    assert.deepEqual(calls.map(call => call.url), ['/api/auth/me', '/api/auth/refresh', '/api/auth/logout'])
  })

  test('a session that stopped working is reported once, and its cookie cleared', async () => {
    const calls = fakeFetch(url => url.endsWith('/auth/refresh') ? { status: 401, body: { success: false, message: 'Invalid or expired refresh token' } } : unauthorized)
    let reported = 0
    const stop = onSessionEnded(() => { reported += 1 })
    await Promise.allSettled([api('/auth/me', { authed: true }), api('/auth/sessions', { authed: true })])
    stop()
    assert.equal(reported, 1)
    assert.equal(calls.filter(call => call.url === '/api/auth/logout').length, 1)
  })

  test('a visitor who was never signed in is not told they were signed out', async () => {
    const calls = fakeFetch(url => url.endsWith('/auth/refresh') ? { status: 401, body: { success: false, message: 'Refresh token not provided', code: 'NO_SESSION' } } : unauthorized)
    let reported = 0
    const stop = onSessionEnded(() => { reported += 1 })
    await assert.rejects(api('/auth/me', { authed: true }))
    stop()
    assert.equal(reported, 0)
    assert.ok(!calls.some(call => call.url === '/api/auth/logout'))
  })

  test('a 401 on an unauthed request (wrong password at sign-in) is not refreshed', async () => {
    const calls = fakeFetch(() => unauthorized)
    await assert.rejects(api('/auth/sign-in', { method: 'POST', body: {} }))
    assert.deepEqual(calls.map(call => call.url), ['/api/auth/sign-in'])
  })
})
