import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as jose from 'jose'

import { getSigningKey, resetSigningKeyForTests } from '../src/app/oidc/keys.js'
import { startApp } from './helpers.js'

const baseUrl = await startApp()
const testKey = process.env.OIDC_SIGNING_KEY

afterEach(() => {
  process.env.OIDC_SIGNING_KEY = testKey
  resetSigningKeyForTests()
})

async function getJson(path: string) {
  const response = await fetch(`${baseUrl}${path}`)
  // any: the tests assert on the fields, so a wrong shape fails an assertion rather than the type check
  return {status: response.status, headers: response.headers, body: await response.json() as any}
}

describe('GET /.well-known/openid-configuration', () => {
  test('names the issuer and every endpoint under it', async () => {
    const {status, body} = await getJson('/.well-known/openid-configuration')
    assert.equal(status, 200)
    // FRONTEND_URL in test/env.ts; exact, because clients compare iss character for character
    assert.equal(body.issuer, 'http://ckauth.test')
    assert.equal(body.jwks_uri, 'http://ckauth.test/.well-known/jwks.json')
    for(const field of ['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint', 'revocation_endpoint', 'end_session_endpoint']) {
      assert.match(body[field], /^http:\/\/ckauth\.test\/oauth\//, field)
    }
  })

  test('the issuer never comes from the Host header', async () => {
    const response = await fetch(`${baseUrl}/.well-known/openid-configuration`, {headers: {'X-Forwarded-Host': 'evil.test'}})
    assert.equal((await response.json() as any).issuer, 'http://ckauth.test')
  })

  test('offers only the safe options: code + pkce s256, pairwise ids, es256, iss on responses', async () => {
    const {body} = await getJson('/.well-known/openid-configuration')
    assert.deepEqual(body.response_types_supported, ['code'])
    assert.deepEqual(body.response_modes_supported, ['query'])
    assert.deepEqual(body.code_challenge_methods_supported, ['S256'])
    assert.deepEqual(body.subject_types_supported, ['pairwise'])
    assert.deepEqual(body.id_token_signing_alg_values_supported, ['ES256'])
    assert.ok(!body.grant_types_supported.includes('implicit') && !body.grant_types_supported.includes('password'))
    assert.ok(!body.token_endpoint_auth_methods_supported.includes('client_secret_post'))
    assert.equal(body.authorization_response_iss_parameter_supported, true)
    // defaults to true in the spec when left out
    assert.equal(body.request_uri_parameter_supported, false)
  })

  test('is cacheable for a few minutes', async () => {
    const {headers} = await getJson('/.well-known/openid-configuration')
    assert.equal(headers.get('cache-control'), 'public, max-age=300')
  })
})

describe('GET /.well-known/jwks.json', () => {
  test('publishes one public es256 key, with its thumbprint as kid and no private part', async () => {
    const {status, headers, body} = await getJson('/.well-known/jwks.json')
    assert.equal(status, 200)
    assert.equal(headers.get('cache-control'), 'public, max-age=300')
    assert.equal(body.keys.length, 1)
    const [key] = body.keys
    assert.equal(key.kty, 'EC')
    assert.equal(key.crv, 'P-256')
    assert.equal(key.alg, 'ES256')
    assert.equal(key.use, 'sig')
    assert.equal(key.d, undefined)
    const {kid: _kid, alg: _alg, use: _use, ...bare} = key
    assert.equal(key.kid, await jose.calculateJwkThumbprint(bare, 'sha256'))
  })

  test('verifies what the private key signs, and only with es256', async () => {
    const {body} = await getJson('/.well-known/jwks.json')
    const {kid, privateKey} = await getSigningKey()
    const token = await new jose.SignJWT({hello: 'world'}).setProtectedHeader({alg: 'ES256', kid}).sign(privateKey)
    const jwks = jose.createLocalJWKSet(body)
    const {payload} = await jose.jwtVerify(token, jwks, {algorithms: ['ES256']})
    assert.equal(payload.hello, 'world')
  })

  test('answers 503 without a key, and works once one is set, with no restart', async () => {
    process.env.OIDC_SIGNING_KEY = ''
    resetSigningKeyForTests()
    assert.equal((await getJson('/.well-known/jwks.json')).status, 503)
    // the rest of the api is unaffected
    assert.equal((await getJson('/.well-known/openid-configuration')).status, 200)

    process.env.OIDC_SIGNING_KEY = testKey
    assert.equal((await getJson('/.well-known/jwks.json')).status, 200)
  })

  test('a key on the wrong curve (p-384) is refused rather than published', async () => {
    const {generateKeyPairSync} = await import('node:crypto')
    process.env.OIDC_SIGNING_KEY = generateKeyPairSync('ec', {namedCurve: 'P-384'}).privateKey.export({type: 'pkcs8', format: 'pem'}) as string
    resetSigningKeyForTests()
    assert.equal((await getJson('/.well-known/jwks.json')).status, 500)
  })
})
