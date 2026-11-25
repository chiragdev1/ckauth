// the rule 27 detector's own tests (oidc-flags.js), run by pnpm check:pr. a check that can't fail proves nothing,
// and one that fails on honest code gets switched off, so both sides are pinned: what it must catch, what it must leave
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { findOidcFlags, scopeOf, splitWords, tokenize } from './oidc-flags.js'

const oidcFile = 'src/app/oauth/controller.ts'
const otherFile = 'src/app/auth/controller.ts'
const names = (file, source) => findOidcFlags(file, source).map(found => found.name)

describe('rule 27: flags are caught', () => {
  // every spelling of the idea: camelCase anywhere in the name, snake, screaming, either word order
  const caught = [
    'const skipConsent = true', 'let shouldSkipConsent', 'skip_consent: true', 'const SKIP_PKCE = 1',
    'const skipUserConsent = 1', 'if(client.consentSkipped)', 'const pkceDisabled = 1', 'const pkceCheckDisabled = 1',
    'const noConsent = 1', 'const withoutPkce = 1', 'const consentOptional = 1', 'const bypassPairwise = 1',
    'const isTrusted = 1', 'const clientIsTrusted = 1', 'trusted_client: true', 'const isFirstPartyApp = 1',
    'const is_first_party = 1', 'const internalClient = 1', 'const privileged = 1', 'const exempt = true',
    'const autoApprove = 1', 'const autoApproveScopes = 1', 'const pre_approved = 1', 'const preAuthorized = 1',
    'const implicitConsent = 1', 'const allowAnyRedirect = 1', 'const redirectWildcard = 1', 'const redirectUriPattern = 1',
    'const skipScopeCheck = 1',
  ]
  for(const source of caught) {
    test(source, () => assert.equal(findOidcFlags(oidcFile, source).length, 1, source))
  }

  test('a name inside a string: a scope, a json key or an env name', () => {
    assert.deepEqual(names(oidcFile, "const scopes = ['openid', 'skip_consent']"), ['skip_consent'])
    assert.deepEqual(names(oidcFile, "body['trustedClient']"), ['trustedClient'])
  })

  test('inside a template literal expression', () => {
    assert.deepEqual(names(oidcFile, 'const url = `${base}/x?${skipConsent ? 1 : 0}`'), ['skipConsent'])
  })

  test('a protection switched off with false', () => {
    assert.deepEqual(names(oidcFile, 'const options = {requirePkce: false}'), ['requirePkce: false'])
    assert.deepEqual(names(oidcFile, 'pkce = false'), ['pkce= false'])
    assert.deepEqual(names(oidcFile, 'const client = {consentRequired: false}'), ['consentRequired: false'])
  })

  test('a redirect uri compared loosely', () => {
    assert.equal(names(oidcFile, 'if(redirectUri.startsWith(registered)) {}').length, 1)
    // a property and optional chaining too
    assert.equal(names(oidcFile, 'if(requested.redirectUri?.includes(registeredUri)) {}').length, 1)
    assert.equal(names(oidcFile, 'if(redirectUri.endsWith(client.host)) {}').length, 1)
    assert.equal(names(oidcFile, 'if(allowed.test(redirectUri)) {}').length, 1)
  })

  test('the schema: a column that could hold "off" is the flag, whatever its default', () => {
    assert.deepEqual(names('src/db/schema.ts', "requirePkce: boolean('require_pkce').notNull().default(true),"), ['requirePkce', 'require_pkce'])
    assert.deepEqual(names('src/db/schema.ts', "isTrusted: boolean('is_trusted'),"), ['isTrusted', 'is_trusted'])
  })

  test('migrations: quoted, bare and all-lowercase column names', () => {
    assert.deepEqual(names('drizzle/0042_x.sql', 'ALTER TABLE "oauth_clients" ADD COLUMN "is_trusted" boolean;'), ['is_trusted'])
    assert.deepEqual(names('drizzle/0042_x.sql', 'ALTER TABLE oauth_clients ADD COLUMN skipconsent boolean;'), ['skipconsent'])
    assert.deepEqual(names('drizzle/0042_x.sql', 'ALTER TABLE oauth_clients ADD COLUMN firstparty boolean;'), ['firstparty'])
    assert.deepEqual(names('drizzle/0042_x.sql', 'ALTER TABLE oauth_clients ADD COLUMN pkce_required boolean DEFAULT true;'), ['pkce_required'])
  })

  test('env samples and compose: oidc settings get every rule', () => {
    assert.deepEqual(names('deploy/api.env.sample', 'OIDC_TRUSTED_CLIENTS='), ['OIDC_TRUSTED_CLIENTS'])
    assert.deepEqual(names('deploy/api.env.sample', 'OIDC_REQUIRE_PKCE=false'), ['OIDC_REQUIRE_PKCE'])
    assert.deepEqual(names('deploy/compose.yml', '      SKIP_CONSENT_CLIENTS: ${SKIP_CONSENT_CLIENTS}'), ['SKIP_CONSENT_CLIENTS'])
  })

  test('the line number is right after strings, regexes and comments that look like code', () => {
    const source = [
      "const url = 'https://ckauth.test//x'",
      'const slashes = /\\/\\//g',
      '/* a block comment',
      '   over two lines */',
      "<p>Don't stop</p>",
      'const isTrusted = true',
    ].join('\n')
    assert.deepEqual(findOidcFlags('frontend/src/pages/oauth-x.tsx', source).map(found => found.line), [6])
  })
})

describe('rule 27: honest code is left alone', () => {
  const allowed = [
    // the real consent screen and its storage
    'const oauth_consents = 1', 'const consentedAt = new Date()', 'handleConsent(req, res)', "const scope = 'openid email'",
    // enforcing a protection is the opposite of a flag
    'requirePkce(req)', 'function requirePkce(request) {}', 'const pkceVerifier = 1', 'const codeChallenge = 1',
    'if(request.consentRequired) {}', 'const requireConsent = true',
    // exact redirect matching and registration-time format checks
    'const redirectUris = client.redirectUris', 'if(redirectUris.includes(redirectUri)) {}', "redirectUri.startsWith('https://')",
    "redirectUri.includes('#')", 'if(/^https:/.test(redirectUri)) {}', 'function redirectUriWithoutFragment() {}',
    'const noMatchingRedirect = 1',
    // pairwise ids, scopes, nonce, implicit-flow rejection
    'const pairwiseSubject = 1', 'const grantedScopes = 1', 'const nonce = 1', 'rejectImplicitGrant()',
    // prose: error messages and copy are words, not names
    "throw ApiError.badRequest('a public client cannot sign in without PKCE')", '<p>Skip consent? Never.</p>',
    // comments explain the rule; they're never read
    '// there is no skipConsent flag, on purpose', '/* isTrusted would be rule 27 */', '/** @deprecated autoApprove */',
  ]
  for(const source of allowed) {
    test(source, () => assert.deepEqual(names(oidcFile, source), [], source))
  }

  test('outside oidc code, everyday words stay free: trusted devices, skipped redirects, "trust proxy"', () => {
    for(const source of ['const trustedDevice = 1', 'const skipRedirect = 1', "app.set('trust proxy', 1)", 'const noScope = 1', 'const isFirstParty = 1']) {
      assert.deepEqual(names(otherFile, source), [], source)
    }
  })

  test('outside oidc code, the unambiguous ones are still caught', () => {
    for(const source of ['const skipConsent = 1', 'const autoApprove = 1', 'const pkceOptional = 1']) {
      assert.equal(names(otherFile, source).length, 1, source)
    }
  })

  test('env names that only look close', () => {
    assert.deepEqual(names('deploy/api.env.sample', 'OIDC_ENABLED=false\nOIDC_SIGNING_KEY=\n# OIDC_TRUSTED_CLIENTS=a comment'), [])
  })
})

describe('scope', () => {
  test('oidc code, admin and the cli get every rule; other code only the unambiguous ones', () => {
    for(const file of ['src/app/oidc/keys.ts', 'src/app/oauth/routes.ts', 'src/app/admin/controller.ts', 'src/scripts/manage-users.ts',
      'frontend/src/components/oauth-consent.tsx', 'frontend/src/pages/admin.tsx', 'frontend/src/pages/connected-apps.tsx', 'src/db/schema.ts']) {
      assert.equal(scopeOf(file)?.oidc, true, file)
    }
    assert.equal(scopeOf('src/app/auth/controller.ts')?.oidc, false)
  })

  test('tests, docs and scripts are out of scope: they name the flags on purpose', () => {
    for(const file of ['test/oauth-token.test.ts', 'docs/OIDC.md', 'scripts/checks/oidc-flags.test.js', 'e2e/sign-in.spec.ts']) {
      assert.equal(scopeOf(file), null, file)
    }
  })
})

describe('the word splitter and lexer', () => {
  test('splits every naming style the same way', () => {
    for(const name of ['skipConsent', 'skip_consent', 'SKIP_CONSENT', 'skip-consent', 'SkipConsent']) {
      assert.deepEqual(splitWords(name), ['skip', 'consent'], name)
    }
    assert.deepEqual(splitWords('PKCERequired'), ['pkce', 'required'])
  })

  test('nested templates come back out to code', () => {
    const tokens = tokenize('const a = `x${`y${b}`}z`; const c = 1')
    assert.ok(tokens.some(token => token.type === 'name' && token.value === 'b'))
    assert.ok(tokens.some(token => token.type === 'name' && token.value === 'c'))
  })

  test('a division is not a regex', () => {
    const tokens = tokenize('const half = total / 2 / count; const after = 1')
    assert.ok(tokens.some(token => token.value === 'after'))
  })
})
