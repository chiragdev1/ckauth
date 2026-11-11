import assert from 'node:assert/strict'
import { test } from 'node:test'

import { describeScopes } from '../src/lib/oauth-scopes.ts'

const user = { firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com' }
const scopesOf = (requested: string[]) => describeScopes(requested, user).map(row => row.scope)

test('rows show the person\'s own data beside each permission', () => {
  assert.deepEqual(describeScopes(['openid', 'profile', 'email'], user), [
    { scope: 'profile', label: 'Your name', value: 'Asha Rao' },
    { scope: 'email', label: 'Your email address', value: 'asha@example.com' },
  ])
  assert.equal(describeScopes(['openid', 'profile'], { ...user, lastName: null })[0]!.value, 'Asha')
})

test('the order is fixed, whatever order the app asked in', () => {
  assert.deepEqual(scopesOf(['offline_access', 'email', 'openid', 'profile']), ['profile', 'email', 'offline_access'])
  assert.deepEqual(scopesOf(['email', 'profile', 'openid']), scopesOf(['openid', 'profile', 'email']))
})

test('openid is listed only when no data scope says who the app learns about', () => {
  assert.deepEqual(scopesOf(['openid']), ['openid'])
  assert.deepEqual(scopesOf(['openid', 'offline_access']), ['openid', 'offline_access'])
  assert.deepEqual(scopesOf(['openid', 'email']), ['email'])
})

test('lasting access is always shown, and last', () => {
  assert.deepEqual(scopesOf(['openid', 'email', 'offline_access']).at(-1), 'offline_access')
})

test('an unknown scope fails instead of being hidden', () => {
  assert.throws(() => describeScopes(['openid', 'email', 'payments'], user), /Unknown scopes on the consent screen: payments/)
  // inherited object keys aren't scopes either
  assert.throws(() => describeScopes(['openid', 'toString'], user), /toString/)
})
