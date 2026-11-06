import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import { describe, test } from 'node:test'
import type { Request } from 'express'

import { logLevelFor, requestFields, routeOf } from '../src/app/middlewares/request-logger.js'
import { Client, startApp } from './helpers.js'

// the one log line per request: what it names a request by, what it leaves out, and at which level it's written.
// LOG_LEVEL is silent in the tests (test/env.ts), so these check the functions that build the line, and the header the
// client sees

const baseUrl = await startApp()

const TOKEN = 'a'.repeat(64)

function fakeRequest(fields: {originalUrl: string, route?: string, method?: string}) {
  return {
    method: fields.method ?? 'GET',
    originalUrl: fields.originalUrl,
    route: fields.route ? {path: fields.route} : undefined,
    // never meant to reach the log
    headers: {cookie: 'access_token=secret', authorization: 'Bearer secret'},
    body: {password: 'secret123'},
    ip: '203.0.113.7',
  } as unknown as Request
}

const response = (statusCode: number) => ({statusCode}) as ServerResponse

describe('routeOf', () => {
  test('names a matched request by its route template, so a token in the path never reaches the log', () => {
    assert.equal(routeOf(fakeRequest({originalUrl: `/auth/verify-email/${TOKEN}`, route: '/verify-email/:token'})), '/auth/verify-email/:token')
    assert.equal(routeOf(fakeRequest({originalUrl: '/auth/sessions/5', route: '/sessions/:id'})), '/auth/sessions/:id')
  })

  // express resets req.baseUrl to '' once a thrown error leaves the router; the prefix must come from the url instead.
  // the fake request has no baseUrl at all, exactly that state
  test('keeps the mount prefix after an error has left the router', () => {
    assert.equal(routeOf(fakeRequest({originalUrl: '/auth/me', route: '/me'})), '/auth/me')
    assert.equal(routeOf(fakeRequest({originalUrl: '/admin/users/', route: '/users'})), '/admin/users')
    assert.equal(routeOf(fakeRequest({originalUrl: '/', route: '/'})), '/')
  })

  test('drops the query string, which can hold what an admin searched for', () => {
    assert.equal(routeOf(fakeRequest({originalUrl: '/admin/users?search=priya@example.com', route: '/users'})), '/admin/users')
    assert.equal(routeOf(fakeRequest({originalUrl: '/admin/nothing?search=priya@example.com'})), '/admin/nothing')
  })

  test('masks long segments of a path no route matched, in case a token went to the wrong place', () => {
    assert.equal(routeOf(fakeRequest({originalUrl: `/auth/reset-password/${TOKEN}`})), '/auth/reset-password/:redacted')
    assert.equal(routeOf(fakeRequest({originalUrl: `/${'x'.repeat(500)}`})), '/:redacted')
  })
})

describe('requestFields', () => {
  test('logs an allow-list: no headers, cookies or body', () => {
    const fields = requestFields(fakeRequest({originalUrl: '/auth/me', route: '/me'}), response(200), 12)
    assert.deepEqual(Object.keys(fields).sort(), ['ip', 'method', 'ms', 'route', 'status', 'userId'])
    assert.doesNotMatch(JSON.stringify(fields), /secret/)
  })
})

describe('logLevelFor', () => {
  const level = (status: number, originalUrl: string, route?: string) => logLevelFor(fakeRequest({originalUrl, ...(route ? {route} : {})}), response(status))

  test('a server failure or a broken connection is an error', () => {
    assert.equal(level(500, '/auth/sign-in', '/sign-in'), 'error')
    assert.equal(level(502, '/auth/upload-avatar', '/upload-avatar'), 'error')
    assert.equal(logLevelFor(fakeRequest({originalUrl: '/auth/me', route: '/me'}), response(200), new Error('socket hang up')), 'error')
  })

  test('rate limits and refused admin requests are warnings', () => {
    assert.equal(level(429, '/auth/sign-in', '/sign-in'), 'warn')
    assert.equal(level(403, '/admin/users', '/users'), 'warn')
    // other 403s are part of normal use: an unverified sign-in
    assert.equal(level(403, '/auth/sign-in', '/sign-in'), 'info')
  })

  test('the two 401s every anonymous visit makes are debug, so production never writes them', () => {
    assert.equal(level(401, '/auth/me', '/me'), 'debug')
    assert.equal(level(401, '/auth/refresh', '/refresh'), 'debug')
    // a wrong password is still worth a line
    assert.equal(level(401, '/auth/sign-in', '/sign-in'), 'info')
  })
})

describe('X-Request-Id', () => {
  test('every response carries a fresh uuid, errors included', async () => {
    const client = new Client(baseUrl)
    const ids = [await client.get('/'), await client.get('/auth/me'), await client.get('/no-such-route')].map(result => result.headers.get('x-request-id'))
    for(const id of ids) {
      assert.match(id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
    assert.equal(new Set(ids).size, ids.length)
  })
})
