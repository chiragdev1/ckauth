import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import jwt from 'jsonwebtoken'

import { generateAccessToken, generateRefreshToken, getTokenExpiry, verifyRefreshToken } from '../src/app/auth/utils/jwt-token.js'
import { ApiError } from '../src/utils/api-error.js'

// the secrets and lifetimes are fixed by test/env.ts
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET_KEY!
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET_KEY!

// a 401 ApiError, so the error handler answers 401 instead of 500
function assertUnauthorized(run: () => unknown) {
  assert.throws(run, (error: unknown) => error instanceof ApiError && error.statusCode === 401)
}

describe('generateAccessToken / generateRefreshToken', () => {
  test('signs each kind of token with its own secret', () => {
    const access = generateAccessToken({userId: 'u1'})
    const refresh = generateRefreshToken({userId: 'u1'})

    assert.doesNotThrow(() => jwt.verify(access, ACCESS_SECRET))
    assert.doesNotThrow(() => jwt.verify(refresh, REFRESH_SECRET))
    assert.throws(() => jwt.verify(access, REFRESH_SECRET))
  })

  test('every token is unique (jwtid), even for one user in the same second', () => {
    // the database finds a session by its refresh token's hash, so two equal tokens would be two equal sessions
    assert.notEqual(generateRefreshToken({userId: 'u1'}), generateRefreshToken({userId: 'u1'}))
  })

  test('uses the configured lifetimes', () => {
    const access = jwt.decode(generateAccessToken({userId: 'u1'})) as jwt.JwtPayload
    const refresh = jwt.decode(generateRefreshToken({userId: 'u1'})) as jwt.JwtPayload

    assert.equal(access.exp! - access.iat!, 15 * 60)
    assert.equal(refresh.exp! - refresh.iat!, 24 * 60 * 60)
  })
})

describe('getTokenExpiry', () => {
  test('returns the exp claim as a Date, for the cookie expiry', () => {
    const token = generateAccessToken({userId: 'u1'})
    const {exp} = jwt.decode(token) as jwt.JwtPayload

    assert.equal(getTokenExpiry(token).getTime(), exp! * 1000)
  })
})

describe('verifyRefreshToken', () => {
  test('returns the payload of a valid refresh token', () => {
    assert.equal(verifyRefreshToken(generateRefreshToken({userId: 'u1'})).userId, 'u1')
  })

  test('rejects an access token, an expired, tampered or userless token, and garbage', () => {
    const refresh = generateRefreshToken({userId: 'u1'})

    assertUnauthorized(() => verifyRefreshToken(generateAccessToken({userId: 'u1'})))
    assertUnauthorized(() => verifyRefreshToken(jwt.sign({userId: 'u1'}, REFRESH_SECRET, {expiresIn: '-1s'})))
    assertUnauthorized(() => verifyRefreshToken(`${refresh.slice(0, -2)}xx`))
    assertUnauthorized(() => verifyRefreshToken(jwt.sign({foo: 'bar'}, REFRESH_SECRET)))
    assertUnauthorized(() => verifyRefreshToken('not-a-jwt'))
  })
})
