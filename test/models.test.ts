import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { changePasswordPayloadModel, emailModel, signupPayloadModel } from '../src/app/auth/models.js'
import { inviteUserPayloadModel, listUsersQueryModel } from '../src/app/admin/models.js'
import { availableUserRoles, userRolesEnum } from '../src/app/auth/utils/constants.js'

// pure validation rules, no server or database
describe('emailModel', () => {
  test('trims and lower-cases, so one inbox is one account', () => {
    assert.equal(emailModel.parse('  Ada@Example.COM '), 'ada@example.com')
  })

  test('rejects non-emails and anything over 254 characters', () => {
    assert.equal(emailModel.safeParse('nope').success, false)
    assert.equal(emailModel.safeParse(`${'a'.repeat(250)}@x.io`).success, false)
  })
})

describe('signupPayloadModel', () => {
  test('passwords must be 6 to 72 characters (bcrypt ignores anything past 72 bytes)', () => {
    const base = {firstName: 'Ada', email: 'ada@example.com'}
    assert.equal(signupPayloadModel.safeParse({...base, password: '12345'}).success, false)
    assert.equal(signupPayloadModel.safeParse({...base, password: 'a'.repeat(72)}).success, true)
    assert.equal(signupPayloadModel.safeParse({...base, password: 'a'.repeat(73)}).success, false)
  })
})

describe('changePasswordPayloadModel', () => {
  test('the new password must differ from the current one', () => {
    const result = changePasswordPayloadModel.safeParse({currentPassword: 'secret123', newPassword: 'secret123'})
    assert.equal(result.success, false)
    assert.deepEqual(result.error?.issues[0]?.path, ['newPassword'])
  })
})

describe('roles', () => {
  test('the list of roles comes from userRolesEnum', () => {
    assert.deepEqual(availableUserRoles, Object.values(userRolesEnum))
  })

  test('an invite takes no role and no password: admins are made on the server', () => {
    const base = {firstName: 'Ada', email: 'ada@example.com'}
    assert.equal(inviteUserPayloadModel.safeParse(base).success, true)
    assert.equal(inviteUserPayloadModel.safeParse({...base, role: 'admin'}).success, false)
    assert.equal(inviteUserPayloadModel.safeParse({...base, password: 'secret123'}).success, false)
  })
})

describe('listUsersQueryModel', () => {
  test('query strings are coerced to numbers, with defaults', () => {
    assert.deepEqual(listUsersQueryModel.parse({}), {page: 1, limit: 20})
    assert.deepEqual(listUsersQueryModel.parse({page: '3', limit: '50'}), {page: 3, limit: 50})
  })

  test('the search is trimmed and capped at 100 characters', () => {
    assert.equal(listUsersQueryModel.parse({search: '  ada  '}).search, 'ada')
    assert.equal(listUsersQueryModel.safeParse({search: 'a'.repeat(101)}).success, false)
  })
})
