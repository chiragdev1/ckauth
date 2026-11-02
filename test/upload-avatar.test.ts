import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { Client, createUser, findUser, resetDatabase, signIn, startApp } from './helpers.js'

const baseUrl = await startApp()

beforeEach(resetDatabase)

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function avatarForm(bytes: Uint8Array<ArrayBuffer>, type = 'image/png', field = 'avatar') {
  const form = new FormData()
  form.append(field, new Blob([bytes], {type}), 'avatar.png')
  return form
}

function png(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set(PNG_SIGNATURE)
  return bytes
}

// ImageKit is switched off in the tests, so only the checks before the upload are covered here: they're the security rules
describe('POST /auth/upload-avatar', () => {
  test('authenticates before reading the upload: no session is a 401, even with a valid image', async () => {
    const response = await new Client(baseUrl).post('/auth/upload-avatar', avatarForm(png()))
    assert.equal(response.status, 401)
  })

  test('trusts the file\'s bytes, not the type the client claims', async () => {
    const client = await signIn(baseUrl, await createUser())
    const fake: Uint8Array<ArrayBuffer> = new TextEncoder().encode('<script>alert(1)</script> pretending to be a png')

    const response = await client.post('/auth/upload-avatar', avatarForm(fake, 'image/png'))
    assert.equal(response.status, 400)
    assert.equal(response.body.message, 'Only JPEG, PNG and WebP images are allowed')
  })

  test('rejects a type that isn\'t an image before reading the rest', async () => {
    const client = await signIn(baseUrl, await createUser())
    assert.equal((await client.post('/auth/upload-avatar', avatarForm(png(), 'application/pdf'))).status, 400)
  })

  test('a file over 2 MB is a 413', async () => {
    const client = await signIn(baseUrl, await createUser())
    const response = await client.post('/auth/upload-avatar', avatarForm(png(2 * 1024 * 1024 + 1)))
    assert.equal(response.status, 413)
  })

  test('the file must be the only part, in the avatar field, sent as multipart', async () => {
    const client = await signIn(baseUrl, await createUser())

    assert.equal((await client.post('/auth/upload-avatar', avatarForm(png(), 'image/png', 'picture'))).status, 400)

    const twoParts = avatarForm(png())
    twoParts.append('note', 'hello')
    assert.equal((await client.post('/auth/upload-avatar', twoParts)).status, 400)

    assert.equal((await client.post('/auth/upload-avatar', {avatar: 'not a file'})).status, 400)
  })

  test('a real image passes every check and reaches the upload step', async () => {
    const user = await createUser()
    const client = await signIn(baseUrl, user)

    // with ImageKit off, the upload itself fails (502, the image service failed) and nothing is saved;
    // a 400 or 413 would mean one of the checks had rejected it
    const response = await client.post('/auth/upload-avatar', avatarForm(png()))
    assert.equal(response.status, 502)
    assert.equal((await findUser(user.email))?.avatarUrl, null)
  })
})
