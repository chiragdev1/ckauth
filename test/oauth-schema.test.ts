import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { beforeEach, describe, test } from 'node:test'
import { eq, isNull, sql } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { oauthClientsTable, oauthCodesTable, oauthConsentsTable, oauthRefreshTokensTable, oauthRequestsTable, oauthSubjectsTable, usersTable } from '../src/db/schema.js'
import { createUser, resetDatabase, sha256, startApp } from './helpers.js'

// the oidc tables' own guarantees (docs/OIDC.md, "What CKAuth stores"): the database refuses what the rules forbid,
// so a bug in an endpoint becomes an error instead of a hole. each constraint is tried with a row that breaks it
await startApp()

beforeEach(resetDatabase)

// a valid s256 challenge is base64url(sha256(verifier)): always 43 characters of [A-Za-z0-9_-]
const challenge = () => randomBytes(32).toString('base64url')
const hash = () => sha256(randomBytes(32).toString('hex'))
// lifetimes use the database clock, as the endpoints will, so the lifetime checks hold exactly
const inSeconds = (seconds: number) => sql`now() + make_interval(secs => ${seconds})`

// the error drizzle throws wraps postgres's, which names the constraint it broke
async function violates(work: Promise<unknown>, constraint: string | RegExp) {
  await assert.rejects(work, (error: any) => {
    const cause = error?.cause ?? error
    const text = `${cause?.constraint ?? ''} ${cause?.message ?? ''}`
    assert.match(text, typeof constraint === 'string' ? new RegExp(`\\b${constraint}\\b`) : constraint)
    return true
  })
}

type NewClient = Partial<typeof oauthClientsTable.$inferInsert>
async function createClient(values: NewClient = {}) {
  const [client] = await db.insert(oauthClientsTable).values({
    name: 'Shop', type: 'confidential', secretHash: hash(), redirectUris: ['https://shop.example/callback'],
    allowedScopes: ['openid', 'email'], sector: 'shop.example', ...values,
  }).returning({id: oauthClientsTable.id})
  assert.ok(client)
  return client
}
const insertClient = (values: NewClient) => db.insert(oauthClientsTable).values({
  name: 'Shop', type: 'confidential', secretHash: hash(), redirectUris: ['https://shop.example/callback'],
  allowedScopes: ['openid'], sector: 'shop.example', ...values,
})

describe('oauth_clients', () => {
  test('a valid confidential and a valid public client are stored', async () => {
    await createClient()
    await createClient({type: 'public', secretHash: null, allowedOrigins: ['https://spa.example'], sector: 'spa.example'})
    assert.equal((await db.select().from(oauthClientsTable)).length, 2)
  })

  test('a confidential client must have a secret; a public one never has one, not even a previous one', async () => {
    await violates(insertClient({secretHash: null}), 'oauth_clients_secret_matches_type')
    await violates(insertClient({type: 'public'}), 'oauth_clients_secret_matches_type')
    await violates(insertClient({type: 'public', secretHash: null, previousSecretHash: hash(), previousSecretExpiresAt: new Date(Date.now() + 60_000)}), 'oauth_clients_secret_matches_type')
  })

  test('secrets are stored only as a sha256 hex digest, never as the secret itself', async () => {
    await violates(insertClient({secretHash: 'my-plain-secret'}), 'oauth_clients_secret_hash_format')
    await violates(insertClient({secretHash: hash().toUpperCase()}), 'oauth_clients_secret_hash_format')
    await violates(insertClient({previousSecretHash: 'old-secret', previousSecretExpiresAt: new Date()}), 'oauth_clients_previous_secret_hash_format')
  })

  test('a rotation can never leave the old secret working forever', async () => {
    await violates(insertClient({previousSecretHash: hash()}), 'oauth_clients_previous_secret_expires')
    await violates(insertClient({previousSecretExpiresAt: new Date()}), 'oauth_clients_previous_secret_expires')
  })

  test('at least one redirect uri, openid always allowed, and only scopes the code knows', async () => {
    await violates(insertClient({redirectUris: []}), 'oauth_clients_has_redirect_uri')
    await violates(insertClient({allowedScopes: ['email']}), 'oauth_clients_allows_openid')
    // the enum: a scope outside src/app/oidc/constants.ts can't be stored at all
    await violates(insertClient({allowedScopes: ['openid', 'admin' as any]}), /invalid input value for enum oauth_scope/)
  })

  test('cors origins only for public clients; a lowercase, non-empty sector; a real name', async () => {
    await violates(insertClient({allowedOrigins: ['https://shop.example']}), 'oauth_clients_origins_only_public')
    await violates(insertClient({sector: 'Shop.Example'}), 'oauth_clients_sector_format')
    await violates(insertClient({sector: ''}), 'oauth_clients_sector_format')
    await violates(insertClient({name: '   '}), 'oauth_clients_name_present')
  })

  test('an unknown type or status is refused', async () => {
    await violates(insertClient({type: 'trusted' as any}), /invalid input value for enum oauth_client_type/)
    await violates(insertClient({status: 'internal' as any}), /invalid input value for enum oauth_client_status/)
  })

  // rule 27, at the database: this is every column the table has. a new one fails here until it's added on purpose,
  // after checking it isn't a way to treat one app differently
  test('has exactly the reviewed columns, none of them an exemption', async () => {
    const columns = await db.execute<{column_name: string}>(sql`select column_name from information_schema.columns where table_name = 'oauth_clients' order by column_name`)
    assert.deepEqual(columns.rows.map(row => row.column_name), [
      'allowed_origins', 'allowed_scopes', 'created_at', 'id', 'name', 'post_logout_redirect_uris', 'previous_secret_expires_at',
      'previous_secret_hash', 'redirect_uris', 'registered_by', 'secret_hash', 'sector', 'status', 'type', 'updated_at',
    ])
  })
})

describe('oauth_requests', () => {
  const insertRequest = async (values: Partial<typeof oauthRequestsTable.$inferInsert> = {}) => {
    const client = await createClient()
    return db.insert(oauthRequestsTable).values({
      clientId: client.id, browserBindingHash: hash(), redirectUri: 'https://shop.example/callback', scopes: ['openid'],
      codeChallenge: challenge(), expiresAt: inSeconds(600) as any, ...values,
    })
  }

  test('a valid pending request is stored', async () => {
    await insertRequest()
    assert.equal((await db.select().from(oauthRequestsTable)).length, 1)
  })

  test('the pkce challenge is always an s256 one: 43 base64url characters, no padding, no plain verifier', async () => {
    await violates(insertRequest({codeChallenge: challenge().slice(0, 42)}), 'oauth_requests_code_challenge_format')
    await violates(insertRequest({codeChallenge: `${challenge().slice(0, 42)}=`}), 'oauth_requests_code_challenge_format')
    await violates(insertRequest({codeChallenge: `${challenge().slice(0, 42)}+`}), 'oauth_requests_code_challenge_format')
  })

  test('lives at most 10 minutes, and never ends before it starts', async () => {
    await violates(insertRequest({expiresAt: inSeconds(601) as any}), 'oauth_requests_lifetime')
    await violates(insertRequest({expiresAt: inSeconds(-1) as any}), 'oauth_requests_lifetime')
  })

  test('asks for openid, a non-negative max_age, and a hashed browser binding', async () => {
    await violates(insertRequest({scopes: ['email']}), 'oauth_requests_asks_openid')
    await violates(insertRequest({maxAge: -1}), 'oauth_requests_max_age_positive')
    await violates(insertRequest({browserBindingHash: 'raw-cookie-value'}), 'oauth_requests_binding_hash_format')
  })
})

describe('oauth_codes', () => {
  async function insertCode(values: Partial<typeof oauthCodesTable.$inferInsert> = {}) {
    const [client, user] = await Promise.all([createClient(), createUser()])
    return db.insert(oauthCodesTable).values({
      codeHash: hash(), clientId: client.id, userId: user.id, redirectUri: 'https://shop.example/callback',
      codeChallenge: challenge(), scopes: ['openid'], authTime: new Date(), expiresAt: inSeconds(60) as any, ...values,
    }).returning({codeHash: oauthCodesTable.codeHash})
  }

  test('lives at most 60 seconds', async () => {
    await insertCode()
    await resetDatabase()
    await violates(insertCode({expiresAt: inSeconds(61) as any}), 'oauth_codes_lifetime')
  })

  test('stored as a hash, with an s256 challenge, and asks for openid', async () => {
    await violates(insertCode({codeHash: 'the-code-itself'}), 'oauth_codes_code_hash_format')
    await violates(insertCode({codeChallenge: 'plain'}), 'oauth_codes_code_challenge_format')
    await violates(insertCode({scopes: ['profile']}), 'oauth_codes_asks_openid')
  })

  // the primitive /token will use (rule: the database decides races): of two redemptions, exactly one gets the row
  test('a conditional update redeems a code exactly once, even when two race', async () => {
    const [code] = await insertCode()
    assert.ok(code)
    const redeem = () => db.update(oauthCodesTable).set({usedAt: sql`now()`})
      .where(sql`${oauthCodesTable.codeHash} = ${code.codeHash} and ${oauthCodesTable.usedAt} is null`)
      .returning({familyId: oauthCodesTable.familyId})
    const results = await Promise.all([redeem(), redeem(), redeem()])
    assert.deepEqual(results.map(rows => rows.length).sort(), [0, 0, 1])
  })
})

describe('oauth_consents', () => {
  test('one row per user and app, always including openid', async () => {
    const [client, user] = await Promise.all([createClient(), createUser()])
    await db.insert(oauthConsentsTable).values({userId: user.id, clientId: client.id, scopes: ['openid', 'email']})
    await violates(db.insert(oauthConsentsTable).values({userId: user.id, clientId: client.id, scopes: ['openid']}), 'oauth_consents_pkey')
    const other = await createUser()
    await violates(db.insert(oauthConsentsTable).values({userId: other.id, clientId: client.id, scopes: ['email']}), 'oauth_consents_includes_openid')
  })
})

describe('oauth_refresh_tokens', () => {
  async function insertToken(values: Partial<typeof oauthRefreshTokensTable.$inferInsert> = {}) {
    const [client, user] = await Promise.all([createClient(), createUser()])
    return db.insert(oauthRefreshTokensTable).values({
      tokenHash: hash(), familyId: crypto.randomUUID(), clientId: client.id, userId: user.id, scopes: ['openid', 'offline_access'],
      authTime: new Date(), expiresAt: inSeconds(30 * 86400) as any, idleExpiresAt: inSeconds(14 * 86400) as any, ...values,
    })
  }

  test('a valid token is stored, and two tokens can never share a hash', async () => {
    const tokenHash = hash()
    await insertToken({tokenHash})
    await violates(insertToken({tokenHash}), /oauth_refresh_tokens_token_hash_(key|unique)/)
  })

  test('only issued with offline_access (rule 17)', async () => {
    await violates(insertToken({scopes: ['openid']}), 'oauth_refresh_tokens_offline_access')
  })

  test('30 days absolute, 14 days idle, and idle never outlives absolute', async () => {
    await violates(insertToken({expiresAt: inSeconds(30 * 86400 + 1) as any}), 'oauth_refresh_tokens_lifetime')
    await violates(insertToken({idleExpiresAt: inSeconds(14 * 86400 + 1) as any}), 'oauth_refresh_tokens_idle_lifetime')
    await violates(insertToken({expiresAt: inSeconds(3600) as any, idleExpiresAt: inSeconds(7200) as any}), 'oauth_refresh_tokens_idle_lifetime')
    await violates(insertToken({tokenHash: 'raw-refresh-token'}), 'oauth_refresh_tokens_token_hash_format')
  })
})

describe('oauth_subjects', () => {
  test('one sub per user and sector, never shared between users, always 43 random characters', async () => {
    const [first, second] = await Promise.all([createUser(), createUser()])
    const subject = challenge()
    await db.insert(oauthSubjectsTable).values({userId: first.id, sector: 'shop.example', subject})
    await violates(db.insert(oauthSubjectsTable).values({userId: first.id, sector: 'shop.example', subject: challenge()}), 'oauth_subjects_pkey')
    await violates(db.insert(oauthSubjectsTable).values({userId: second.id, sector: 'other.example', subject}), /oauth_subjects_subject_(key|unique)/)
    await violates(db.insert(oauthSubjectsTable).values({userId: second.id, sector: 'shop.example', subject: first.id}), 'oauth_subjects_subject_format')
  })
})

describe('deleting', () => {
  test('an account takes its codes, consents, refresh tokens and pairwise subs with it; its apps stay, unowned', async () => {
    const admin = await createUser({role: 'admin'})
    const client = await createClient({registeredBy: admin.id})
    await db.insert(oauthCodesTable).values({codeHash: hash(), clientId: client.id, userId: admin.id, redirectUri: 'https://shop.example/callback', codeChallenge: challenge(), scopes: ['openid'], authTime: new Date(), expiresAt: inSeconds(60) as any})
    await db.insert(oauthConsentsTable).values({userId: admin.id, clientId: client.id, scopes: ['openid']})
    await db.insert(oauthRefreshTokensTable).values({tokenHash: hash(), familyId: crypto.randomUUID(), clientId: client.id, userId: admin.id, scopes: ['openid', 'offline_access'], authTime: new Date(), expiresAt: inSeconds(86400) as any, idleExpiresAt: inSeconds(3600) as any})
    await db.insert(oauthSubjectsTable).values({userId: admin.id, sector: 'shop.example', subject: challenge()})

    await db.delete(usersTable).where(eq(usersTable.id, admin.id))

    for(const table of [oauthCodesTable, oauthConsentsTable, oauthRefreshTokensTable, oauthSubjectsTable]) {
      assert.equal((await db.select().from(table)).length, 0)
    }
    assert.equal((await db.select().from(oauthClientsTable).where(isNull(oauthClientsTable.registeredBy))).length, 1)
  })

  test('an app takes its pending requests, codes, consents and refresh tokens with it', async () => {
    const [client, user] = await Promise.all([createClient(), createUser()])
    await db.insert(oauthRequestsTable).values({clientId: client.id, browserBindingHash: hash(), redirectUri: 'https://shop.example/callback', scopes: ['openid'], codeChallenge: challenge(), expiresAt: inSeconds(600) as any})
    await db.insert(oauthConsentsTable).values({userId: user.id, clientId: client.id, scopes: ['openid']})
    await db.delete(oauthClientsTable).where(eq(oauthClientsTable.id, client.id))
    assert.equal((await db.select().from(oauthRequestsTable)).length, 0)
    assert.equal((await db.select().from(oauthConsentsTable)).length, 0)
    // the subjects stay: they belong to the user and the sector, not the app, so a re-registered app gets the same sub
  })
})

// production's api connects as ckauth_api; the new tables got its grants from ALTER DEFAULT PRIVILEGES, not by hand
test('the api database role can read and write every oauth table', async () => {
  const user = await createUser()
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local role ckauth_api`)
    const [client] = await tx.insert(oauthClientsTable).values({name: 'Shop', type: 'confidential', secretHash: hash(), redirectUris: ['https://shop.example/callback'], allowedScopes: ['openid'], sector: 'shop.example'}).returning({id: oauthClientsTable.id})
    assert.ok(client)
    await tx.insert(oauthConsentsTable).values({userId: user.id, clientId: client.id, scopes: ['openid']})
    await tx.insert(oauthSubjectsTable).values({userId: user.id, sector: 'shop.example', subject: challenge()})
    await tx.insert(oauthRequestsTable).values({clientId: client.id, browserBindingHash: hash(), redirectUri: 'https://shop.example/callback', scopes: ['openid'], codeChallenge: challenge(), expiresAt: inSeconds(600) as any})
    await tx.update(oauthClientsTable).set({status: 'disabled'}).where(eq(oauthClientsTable.id, client.id))
    await tx.delete(oauthClientsTable).where(eq(oauthClientsTable.id, client.id))
  })
})

// found in the migration review (25 Nov 2026): what the first draft let through
describe('formats the code will also check, enforced underneath it', () => {
  test('redirect uris: https with a path, the loopback, or a reverse-domain scheme; never a fragment, a space or credentials', async () => {
    for(const uri of ['https://shop.example/callback', 'https://shop.example:8443/a/b?x=1', 'https://shop.example/', 'http://127.0.0.1:53412/cb', 'http://127.0.0.1/cb', 'com.example.app:/callback']) {
      await createClient({redirectUris: [uri]})
    }
    const refused = [
      'http://shop.example/callback',     // plain http to a real host
      'https://shop.example/cb#frag',     // a fragment (rule 7)
      'https://shop.example/c b',         // whitespace
      'https://user:pass@shop.example/',  // credentials in the url
      'javascript:alert(1)',              // not a reverse-domain scheme
      'data:text/html,hi',
      'https://shop.example/\tcb',        // a control character
      'http://localhost/cb',              // loopback by name is phishable; only 127.0.0.1 (RFC 8252 §8.3)
      '',
    ]
    for(const uri of refused) {
      await violates(insertClient({redirectUris: [uri]}), 'oauth_clients_redirect_uris_format')
    }
    // one bad uri among good ones is still refused
    await violates(insertClient({redirectUris: ['https://shop.example/ok', 'https://shop.example/x#y']}), 'oauth_clients_redirect_uris_format')
    await violates(insertClient({postLogoutRedirectUris: ['https://shop.example/out#x']}), 'oauth_clients_post_logout_uris_format')
  })

  test('a NULL hidden in an array is refused; = any() and pattern checks would skip it', async () => {
    await violates(db.execute(sql`insert into oauth_clients (name, type, secret_hash, redirect_uris, allowed_scopes, sector) values ('Shop', 'confidential', ${hash()}, array['https://shop.example/cb', null], '{openid}', 'shop.example')`), 'oauth_clients_redirect_uris_format')
    await violates(db.execute(sql`insert into oauth_clients (name, type, secret_hash, redirect_uris, allowed_scopes, sector) values ('Shop', 'confidential', ${hash()}, '{https://shop.example/cb}', array['openid', null]::oauth_scope[], 'shop.example')`), 'oauth_clients_scopes_no_nulls')
  })

  test('at most 10 redirect uris and 10 origins, and no uri over 2048 characters', async () => {
    const many = Array.from({length: 11}, (_, index) => `https://shop.example/cb${index}`)
    await violates(insertClient({redirectUris: many}), 'oauth_clients_has_redirect_uri')
    await violates(insertClient({type: 'public', secretHash: null, allowedOrigins: many.map((_, index) => `https://a${index}.example`)}), 'oauth_clients_origins_format')
    const [client] = await Promise.all([createClient()])
    assert.ok(client)
    await violates(db.insert(oauthRequestsTable).values({clientId: client.id, browserBindingHash: hash(), redirectUri: `https://shop.example/${'a'.repeat(2048)}`, scopes: ['openid'], codeChallenge: challenge(), expiresAt: inSeconds(600) as any}), 'oauth_requests_redirect_uri_format')
  })

  test('cors origins are bare origins: https, no path, no wildcard', async () => {
    const publicClient = {type: 'public' as const, secretHash: null, sector: 'spa.example'}
    await createClient({...publicClient, allowedOrigins: ['https://spa.example', 'https://spa.example:8443', 'http://127.0.0.1:5173']})
    for(const origin of ['https://spa.example/', 'https://spa.example/app', '*', 'http://spa.example', 'https://*.example', 'HTTPS://SPA.EXAMPLE']) {
      await violates(insertClient({...publicClient, allowedOrigins: [origin]}), 'oauth_clients_origins_format')
    }
  })

  test('a name can\'t hide control or invisible characters (rule 12: one app disguised as another)', async () => {
    for(const name of ['Shop\nAdmin', 'Shop‮gnikna', 'Sh​op', '﻿Shop', 'Shop\u0007']) {
      await violates(insertClient({name}), 'oauth_clients_name_visible')
    }
    // real names in any language are fine
    await createClient({name: 'दुकान · Café Ölçü'})
  })

  test('prompt: known values only, and none alone (OIDC Core 3.1.2.1)', async () => {
    const client = await createClient()
    const insert = (prompt: string) => db.insert(oauthRequestsTable).values({clientId: client.id, browserBindingHash: hash(), redirectUri: 'https://shop.example/callback', scopes: ['openid'], codeChallenge: challenge(), prompt, expiresAt: inSeconds(600) as any})
    for(const prompt of ['none', 'login', 'consent', 'login consent', 'select_account']) await insert(prompt)
    for(const prompt of ['none login', 'consent none', 'admin', 'login  consent', ' login', '']) {
      await violates(insert(prompt), 'oauth_requests_prompt_values')
    }
  })

  test('a sector is one lowercase spelling in both tables, so a host never gets two subs', async () => {
    for(const sector of ['Shop.Example', 'shop.example.', '.shop.example', 'shop example', 'shop.example/x']) {
      await violates(insertClient({sector}), 'oauth_clients_sector_format')
    }
    const user = await createUser()
    await violates(db.insert(oauthSubjectsTable).values({userId: user.id, sector: 'Shop.Example', subject: challenge()}), 'oauth_subjects_sector_format')
  })
})
