import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { eq } from 'drizzle-orm'

import { db } from '../src/db/index.js'
import { usersTable } from '../src/db/schema.js'
import { Client, createUser, findUser, lastMailTo, mailsTo, resetDatabase, signIn, signUp, startApp, tokenFrom } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

describe('PATCH /auth/me', () => {
  test('changes only the fields that are sent, and returns the updated user', async () => {
    const user = await createUser({firstName: 'Ada'})
    const client = await signIn(baseUrl, user)

    const response = await client.patch('/auth/me', {lastName: ' Lovelace '})
    assert.equal(response.status, 200)
    assert.equal(response.body.data.firstName, 'Ada')
    assert.equal(response.body.data.lastName, 'Lovelace')
    assert.equal((await findUser(user.email))?.lastName, 'Lovelace')
  })

  test('an empty last name removes it', async () => {
    const client = await signIn(baseUrl, await createUser())
    await client.patch('/auth/me', {lastName: 'Lovelace'})
    const response = await client.patch('/auth/me', {lastName: ''})
    assert.equal(response.body.data.lastName, null)
  })

  test('email, role and unknown fields are refused, so a profile edit can\'t become a promotion', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)

    for(const body of [{role: 'admin'}, {email: 'new@ckauth.test'}, {firstName: 'Ada', emailVerified: false}]) {
      assert.equal((await client.patch('/auth/me', body)).status, 400, JSON.stringify(body))
    }
    const stored = await findUser(user.email)
    assert.equal(stored?.role, 'user')
    assert.equal(stored?.emailVerified, true)
  })

  test('an empty body or a too-short name is a 400', async () => {
    const client = await signIn(baseUrl, await createUser())
    assert.equal((await client.patch('/auth/me', {})).status, 400)
    assert.equal((await client.patch('/auth/me', {firstName: 'A'})).status, 400)
  })

  test('needs a session', async () => {
    assert.equal((await new Client(baseUrl).patch('/auth/me', {firstName: 'Ada'})).status, 401)
  })
})

describe('DELETE /auth/avatar', () => {
  test('clears the avatar, and removing it again is still a success', async () => {
    const user = await createUser()
    await db.update(usersTable).set({avatarUrl: 'https://ik.imagekit.io/x/avatars/a.png', avatarFileId: 'file_1'}).where(eq(usersTable.email, user.email))
    const client = await signIn(baseUrl, user)

    const response = await client.delete('/auth/avatar')
    assert.equal(response.status, 200)
    assert.equal(response.body.data.avatarUrl, null)
    const stored = await findUser(user.email)
    assert.equal(stored?.avatarUrl, null)
    assert.equal(stored?.avatarFileId, null)

    assert.equal((await client.delete('/auth/avatar')).status, 200)
  })

  test('needs a session', async () => {
    assert.equal((await new Client(baseUrl).delete('/auth/avatar')).status, 401)
  })
})

describe('DELETE /auth/me', () => {
  test('with the right password: deletes the row, signs out, and emails the owner', async () => {
    const user = await createUser({firstName: 'Ada'})
    const client = await signIn(baseUrl, user)
    const otherDevice = client.clone()

    const response = await client.delete('/auth/me', {password: user.password})
    assert.equal(response.status, 200)
    assert.equal(await findUser(user.email), undefined)
    assert.equal(client.cookie('access_token'), undefined)
    assert.equal(client.cookie('refresh_token'), undefined)
    assert.match(lastMailTo(user.email).text, /deleted from your account page/)

    // a copy of the old cookies is useless too: the user they point at is gone
    assert.equal((await otherDevice.get('/auth/me')).status, 401)
    assert.equal((await otherDevice.post('/auth/refresh')).status, 401)
  })

  test('a wrong password is a 400 and deletes nothing', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)

    const response = await client.delete('/auth/me', {password: 'wrong-password'})
    assert.equal(response.status, 400)
    assert.equal(response.body.message, 'Password is incorrect')
    assert.ok(await findUser(user.email))
    assert.ok(!mailsTo(user.email).some(mail => mail.subject.includes('deleted')))
  })

  test('a missing password is a 400', async () => {
    const client = await signIn(baseUrl, await createUser())
    assert.equal((await client.delete('/auth/me', {})).status, 400)
  })

  test('an admin can\'t delete themselves through the api, even with the right password', async () => {
    const admin = await createUser({role: 'admin'})
    const client = await signIn(baseUrl, admin)

    const response = await client.delete('/auth/me', {password: admin.password})
    assert.equal(response.status, 403)
    assert.ok(await findUser(admin.email))
  })

  test('needs a session', async () => {
    assert.equal((await new Client(baseUrl).delete('/auth/me', {password: 'secret123'})).status, 401)
  })
})

describe('POST /auth/resend-verification', () => {
  const genericMessage = 'If this email is waiting to be confirmed, a new link has been sent'

  // past the cooldown and past expiry alike
  async function expireLink(email: string) {
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.email, email))
  }

  test('an unconfirmed sign-up gets a new link that works, and the old one stops working', async () => {
    const oldToken = await signUp(baseUrl, 'ada@ckauth.test')
    await expireLink('ada@ckauth.test')

    const response = await new Client(baseUrl).post('/auth/resend-verification', {email: ' ADA@ckauth.test '})
    assert.equal(response.status, 200)
    assert.equal(response.body.message, genericMessage)

    const newToken = tokenFrom(lastMailTo('ada@ckauth.test'))
    assert.notEqual(newToken, oldToken)
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${oldToken}`, {password: 'secret123'})).status, 404)
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${newToken}`, {password: 'secret123'})).status, 200)
  })

  test('a link sent under a minute ago is kept, and no second mail goes out', async () => {
    const token = await signUp(baseUrl, 'quick@ckauth.test')

    const response = await new Client(baseUrl).post('/auth/resend-verification', {email: 'quick@ckauth.test'})
    assert.equal(response.status, 200)
    assert.equal(response.body.message, genericMessage)
    assert.equal(mailsTo('quick@ckauth.test').length, 1)
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'secret123'})).status, 200)
  })

  test('after the minute is up, a link that is still valid is replaced', async () => {
    await signUp(baseUrl, 'later@ckauth.test')
    // sent 61 seconds ago: the expiry is the send time plus the 15-minute lifetime
    await db.update(usersTable).set({emailVerificationTokenExpiry: new Date(Date.now() + 15 * 60_000 - 61_000)}).where(eq(usersTable.email, 'later@ckauth.test'))

    await new Client(baseUrl).post('/auth/resend-verification', {email: 'later@ckauth.test'})
    assert.equal(mailsTo('later@ckauth.test').length, 2)
  })

  test('a link cancelled by a wrong password can be replaced straight away', async () => {
    const token = await signUp(baseUrl, 'typo@ckauth.test')
    assert.equal((await new Client(baseUrl).post(`/auth/verify-email/${token}`, {password: 'wrong-password'})).status, 401)

    await new Client(baseUrl).post('/auth/resend-verification', {email: 'typo@ckauth.test'})
    assert.equal(mailsTo('typo@ckauth.test').length, 2)
  })

  test('the same answer, and no mail, for a verified account or no account (no enumeration)', async () => {
    const verified = await createUser()

    for(const email of [verified.email, 'nobody@ckauth.test']) {
      const response = await new Client(baseUrl).post('/auth/resend-verification', {email})
      assert.equal(response.status, 200)
      assert.equal(response.body.message, genericMessage)
      assert.equal(mailsTo(email).length, 0)
    }
  })

  test('an invited user (no password yet) gets nothing: they finish through the invite link', async () => {
    await db.insert(usersTable).values({firstName: 'Invited', email: 'invited@ckauth.test'})
    await new Client(baseUrl).post('/auth/resend-verification', {email: 'invited@ckauth.test'})
    assert.equal(mailsTo('invited@ckauth.test').length, 0)
  })

  test('an invalid email is a 400', async () => {
    assert.equal((await new Client(baseUrl).post('/auth/resend-verification', {email: 'not-an-email'})).status, 400)
  })
})

describe('changing email', () => {
  async function requestChange(email = 'new@ckauth.test') {
    const user = await createUser({email: 'old@ckauth.test', firstName: 'Ada'})
    const client = await signIn(baseUrl, user)
    const response = await client.post('/auth/change-email', {newEmail: email, password: user.password})
    return {user, client, response}
  }

  test('asks the new address to confirm, warns the old one, and changes nothing yet', async () => {
    const {user, response} = await requestChange(' NEW@ckauth.test ')
    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'Check new@ckauth.test for a link to confirm it')
    assert.equal(lastMailTo('new@ckauth.test').subject, 'Confirm your new CKAuth email')
    assert.match(lastMailTo('old@ckauth.test').text, /change its email to new@ckauth\.test/)

    const stored = await findUser(user.email)
    assert.equal(stored?.email, 'old@ckauth.test')
    assert.equal(stored?.pendingEmail, 'new@ckauth.test')
    // only the hash is stored
    assert.notEqual(stored?.emailChangeToken, tokenFrom(lastMailTo('new@ckauth.test')))
  })

  test('opening the link switches the email, tells the old address, keeps the session, and works once', async () => {
    const {client} = await requestChange()
    const token = tokenFrom(lastMailTo('new@ckauth.test'))

    const confirmed = await new Client(baseUrl).post(`/auth/confirm-email/${token}`)
    assert.equal(confirmed.status, 200)
    assert.equal((await findUser('new@ckauth.test'))?.pendingEmail, null)
    assert.equal(await findUser('old@ckauth.test'), undefined)
    assert.match(lastMailTo('old@ckauth.test').text, /now new@ckauth\.test/)
    assert.equal((await client.get('/auth/me')).body.data.email, 'new@ckauth.test')

    assert.equal((await new Client(baseUrl).post(`/auth/confirm-email/${token}`)).status, 404)
  })

  test('it cancels a password reset link still in the old inbox', async () => {
    await requestChange()
    await new Client(baseUrl).post('/auth/forgot-password', {email: 'old@ckauth.test'})
    const resetToken = tokenFrom(lastMailTo('old@ckauth.test'))

    await new Client(baseUrl).post(`/auth/confirm-email/${tokenFrom(lastMailTo('new@ckauth.test'))}`)
    assert.equal((await new Client(baseUrl).post(`/auth/reset-password/${resetToken}`, {newPassword: 'taken-over-123'})).status, 404)
  })

  test('an address that has an account gets the same answer and a notice, never a link (no enumeration)', async () => {
    await createUser({email: 'taken@ckauth.test'})
    const {user, response} = await requestChange('taken@ckauth.test')
    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'Check taken@ckauth.test for a link to confirm it')
    assert.equal(lastMailTo('taken@ckauth.test').subject, 'This email already has a CKAuth account')
    assert.equal((await findUser(user.email))?.pendingEmail, null)
  })

  test('if someone takes the address before the link is opened, the change fails cleanly', async () => {
    const {user} = await requestChange()
    const token = tokenFrom(lastMailTo('new@ckauth.test'))
    await createUser({email: 'new@ckauth.test'})

    assert.equal((await new Client(baseUrl).post(`/auth/confirm-email/${token}`)).status, 409)
    const stored = await findUser(user.email)
    assert.equal(stored?.email, 'old@ckauth.test')
    assert.equal(stored?.pendingEmail, null)
  })

  test('needs the right password, a session, and an address that isn\'t the current one', async () => {
    const user = await createUser({email: 'old@ckauth.test'})
    const client = await signIn(baseUrl, user)

    assert.equal((await client.post('/auth/change-email', {newEmail: 'new@ckauth.test', password: 'wrong-password'})).status, 400)
    assert.equal((await client.post('/auth/change-email', {newEmail: 'OLD@ckauth.test', password: user.password})).body.message, 'That is already your email')
    assert.equal((await new Client(baseUrl).post('/auth/change-email', {newEmail: 'new@ckauth.test', password: user.password})).status, 401)
    assert.equal(mailsTo('new@ckauth.test').length, 0)
  })

  test('an expired link is a 404', async () => {
    const {user} = await requestChange()
    const token = tokenFrom(lastMailTo('new@ckauth.test'))
    await db.update(usersTable).set({emailChangeTokenExpiry: new Date(Date.now() - 1000)}).where(eq(usersTable.email, user.email))

    assert.equal((await new Client(baseUrl).post(`/auth/confirm-email/${token}`)).status, 404)
  })
})
