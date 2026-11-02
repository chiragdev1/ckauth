import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { ApiRequestError } from '../src/lib/api.ts'
import { describeError, passwordRequirements, validateConfirmation, validateEmail, validateFirstName, validateNewPassword } from '../src/lib/validation.ts'

// the inline errors every form shows; they mirror the api's rules (src/app/auth/models.ts) so mistakes show before a request
describe('field rules', () => {
  test('names: 2 to 45 characters after trimming', () => {
    assert.ok(validateFirstName(''))
    assert.ok(validateFirstName(' A '))
    assert.equal(validateFirstName('Ada'), undefined)
    assert.ok(validateFirstName('a'.repeat(46)))
  })

  test('emails: trimmed, one @, a dot in the domain, at most 254 characters', () => {
    assert.equal(validateEmail('  ada@example.com '), undefined)
    for(const bad of ['', 'ada', 'ada@example', 'a b@example.com', `${'a'.repeat(250)}@x.io`]) {
      assert.ok(validateEmail(bad), bad)
    }
  })

  test('new passwords: 8 to 72 characters, with a letter and a number', () => {
    assert.equal(validateNewPassword('secret12'), undefined)
    for(const bad of ['', 'short1', 'onlyletters', '12345678', `a1${'x'.repeat(71)}`]) {
      assert.ok(validateNewPassword(bad), bad)
    }
    assert.deepEqual(passwordRequirements('abc').map(rule => rule.met), [false, true, false])
  })

  test('the confirmation must match', () => {
    assert.ok(validateConfirmation('', 'secret12'))
    assert.ok(validateConfirmation('secret13', 'secret12'))
    assert.equal(validateConfirmation('secret12', 'secret12'), undefined)
  })
})

describe('describeError', () => {
  test('a 400 lands on the fields it names, in words for people rather than zod\'s text', () => {
    const error = new ApiRequestError(400, 'Invalid input fields: email: Invalid email address, password: Too small: expected string to have >=6 characters')
    assert.deepEqual(describeError(error), { formError: null, fieldErrors: { email: 'Enter a valid email address', password: 'Check your password' } })
  })

  test('keeps the change-password message, which is written for people', () => {
    const error = new ApiRequestError(400, 'Invalid input fields: newPassword: New password must be different from the current password')
    assert.equal(describeError(error).fieldErrors.newPassword, 'New password must be different from the current password')
  })

  test('429, 5xx and a network failure each get their own plain message', () => {
    assert.match(describeError(new ApiRequestError(429, 'Too many requests')).formError ?? '', /Too many attempts/)
    assert.match(describeError(new ApiRequestError(502, 'Bad gateway')).formError ?? '', /on our side/)
    assert.match(describeError(new TypeError('fetch failed')).formError ?? '', /Can't reach CKAuth/)
  })

  test('any other api error shows the api\'s own message', () => {
    assert.deepEqual(describeError(new ApiRequestError(409, 'A user with this email already exists')), { formError: 'A user with this email already exists', fieldErrors: {} })
  })
})
