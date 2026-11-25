import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { Client, createUser, resetDatabase, sessionsOf, signIn, startApp } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

// test/env.ts sets FRONTEND_URL to http://ckauth.test, the one origin the web app and the api share
const SIBLING = {'sec-fetch-site': 'same-site', origin: 'https://other.ckauth.test'}

describe('cross-site writes (samesite=lax lets sibling subdomains through, so the api checks the origin)', () => {
  test('a write from a sibling subdomain is refused, with the cookie attached, and changes nothing', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    client.browserHeaders = SIBLING

    const response = await client.post('/auth/logout')
    assert.equal(response.status, 403)
    assert.match(response.body.message, /cross-site/i)
    assert.equal((await sessionsOf(user.id)).length, 1, 'the session must survive')
  })

  test('every cookie-authenticated area is covered: auth, admin and metrics', async () => {
    const client = new Client(baseUrl)
    client.browserHeaders = SIBLING
    for(const [method, path] of [['POST', '/auth/sign-in'], ['DELETE', '/auth/sessions'], ['PATCH', '/auth/me'], ['POST', '/admin/reauth'], ['POST', '/metrics/visit']] as const) {
      assert.equal((await client.request(method, path, {})).status, 403, `${method} ${path}`)
    }
  })

  test('fetch metadata: only same-origin passes; same-site, cross-site and none are refused', async () => {
    const user = await createUser()
    for(const site of ['same-site', 'cross-site', 'none']) {
      const client = await signIn(baseUrl, user)
      client.browserHeaders = {'sec-fetch-site': site}
      assert.equal((await client.post('/auth/logout')).status, 403, site)
    }
    const client = await signIn(baseUrl, user)
    client.browserHeaders = {'sec-fetch-site': 'same-origin', origin: 'http://ckauth.test'}
    assert.equal((await client.post('/auth/logout')).status, 200)
  })

  test('without fetch metadata, the origin decides: only the web app\'s own origin passes', async () => {
    const user = await createUser()
    for(const origin of ['https://other.ckauth.test', 'http://ckauth.test.evil.example', 'https://ckauth.test', 'null']) {
      const client = await signIn(baseUrl, user)
      client.browserHeaders = {origin}
      assert.equal((await client.post('/auth/logout')).status, 403, origin)
    }
    const client = await signIn(baseUrl, user)
    client.browserHeaders = {origin: 'http://ckauth.test'}
    assert.equal((await client.post('/auth/logout')).status, 200)
  })

  test('reads still work cross-site, and a request with neither header (not a browser) passes', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)
    client.browserHeaders = SIBLING
    assert.equal((await client.get('/auth/me')).status, 200)

    client.browserHeaders = {}
    assert.equal((await client.post('/auth/logout')).status, 200)
  })

  test('a form body (the one kind another site can post without a preflight) isn\'t parsed', async () => {
    const user = await createUser()
    const response = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.250.0.1'},
      body: new URLSearchParams({email: user.email, password: user.password}),
    })
    assert.equal(response.status, 400)
    assert.equal(response.headers.getSetCookie().length, 0, 'no session from a form post')
  })
})
