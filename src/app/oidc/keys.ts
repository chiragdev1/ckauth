import * as jose from 'jose'
import { ApiError } from '../../utils/api-error.js'

// es256 only (docs/OIDC.md, rule 14). one algorithm per key, and every verifier names it, so a token can't pick its own
export const OIDC_SIGNING_ALG = 'ES256'

export type SigningKey = {kid: string, privateKey: CryptoKey, publicJwk: jose.JWK}

let signingKey: Promise<SigningKey> | null = null

// read on first use, like imagekit.ts, so the rest of the api still starts without a key configured.
// the private key lives only in the environment (a pkcs8 pem), never in the database or the logs
export function getSigningKey(): Promise<SigningKey> {
  if(!signingKey) {
    signingKey = loadSigningKey(process.env.OIDC_SIGNING_KEY).catch(error => {
      // not cached: a key added to the environment later works after `docker compose up -d api` without a code change
      signingKey = null
      throw error
    })
  }
  return signingKey
}

async function loadSigningKey(pem: string | undefined): Promise<SigningKey> {
  if(!pem) {
    throw new ApiError(503, 'Sign in with CKAuth is not configured')
  }
  // extractable so the public half can be exported; the private half itself is never exported or sent anywhere
  const privateKey = await jose.importPKCS8(pem.replace(/\\n/g, '\n'), OIDC_SIGNING_ALG, {extractable: true})
  const {d: _private, ...publicJwk} = await jose.exportJWK(privateKey)
  // the kid is the key's rfc 7638 thumbprint: the same key always gets the same id, and a new key a new one,
  // so rotating (publish the new key, then sign with it) needs no id kept anywhere
  const kid = await jose.calculateJwkThumbprint(publicJwk, 'sha256')
  return {kid, privateKey, publicJwk: {...publicJwk, kid, alg: OIDC_SIGNING_ALG, use: 'sig'}}
}

// tests only: forget the loaded key, so a test can change OIDC_SIGNING_KEY
export function resetSigningKeyForTests() {
  signingKey = null
}
